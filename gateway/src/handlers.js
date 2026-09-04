import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { CONFIG } from './config.js';
import { validatePath, isTextFile } from './pathValidator.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

function ts() {
  return new Date().toISOString().slice(11, 23);
}

export function json(response, statusCode, data) {
  response.writeHead(statusCode, {
    ...CORS_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(data));
}

export function noContent(response) {
  response.writeHead(204, CORS_HEADERS);
  response.end();
}

export function errorResponse(response, statusCode, code, message) {
  json(response, statusCode, { error: { code, message } });
}

export async function handleHealth(_request, response) {
  json(response, 200, { status: 'ok' });
}

export async function handleRoot(_request, response) {
  json(response, 200, { path: CONFIG.ROOT_PATH });
}

export async function handleDirectory(request, response, url) {
  const dirPath = url.searchParams.get('path');
  if (!dirPath) {
    return errorResponse(response, 400, 'INVALID_REQUEST', "The 'path' query parameter is required.");
  }

  const validation = validatePath(dirPath, CONFIG.ROOT_PATH);
  if (!validation.valid) {
    if (validation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Path is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid path.');
  }

  const resolved = validation.resolvedPath;

  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    return errorResponse(response, 404, 'NOT_FOUND', 'Directory not found.');
  }

  if (!stats.isDirectory()) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'The specified path is not a directory.');
  }

  let entries;
  try {
    entries = await readdir(resolved, { withFileTypes: true });
  } catch {
    return errorResponse(response, 404, 'NOT_FOUND', 'Directory not found.');
  }

  const items = [];
  for (const entry of entries) {
    const entryPath = resolve(resolved, entry.name);
    try {
      const entryStat = await stat(entryPath);
      items.push({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
        path: entryPath,
        size: entry.isDirectory() ? null : entryStat.size,
        modifiedAt: entryStat.mtime.toISOString(),
      });
    } catch {
      continue;
    }
  }

  items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  json(response, 200, { path: dirPath, items });
}

export async function handleFile(request, response, url) {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return errorResponse(response, 400, 'INVALID_REQUEST', "The 'path' query parameter is required.");
  }

  const validation = validatePath(filePath, CONFIG.ROOT_PATH);
  if (!validation.valid) {
    if (validation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Path is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid path.');
  }

  const resolved = validation.resolvedPath;

  let stats;
  try {
    stats = await stat(resolved);
  } catch {
    return errorResponse(response, 404, 'NOT_FOUND', 'File not found.');
  }

  if (!stats.isFile()) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'The specified path is not a file.');
  }

  if (stats.size > CONFIG.MAX_FILE_SIZE) {
    return errorResponse(response, 413, 'FILE_TOO_LARGE', 'The requested file is too large.');
  }

  let content;
  try {
    const buffer = await readFile(resolved);
    content = buffer.toString('utf-8');
  } catch {
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'An internal server error occurred.');
  }

  if (!isTextFile(resolved, content)) {
    return errorResponse(response, 415, 'UNSUPPORTED_FILE_TYPE', 'Binary files are not supported.');
  }

  json(response, 200, { path: filePath, content });
}

// --- OpenCode Proxy ---

export function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf-8');
      resolve(body || null);
    });
    request.on('error', reject);
  });
}

export function handleOpenCodeProxy(request, response, openCodePath) {
  const options = {
    hostname: CONFIG.OPENCODE_HOST,
    port: CONFIG.OPENCODE_PORT,
    path: openCodePath,
    method: request.method,
    headers: { ...request.headers, host: `${CONFIG.OPENCODE_HOST}:${CONFIG.OPENCODE_PORT}` },
  };

  const proxyReq = httpRequest(options, (proxyRes) => {
    response.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(response);
  });

  proxyReq.on('error', () => {
    errorResponse(response, 502, 'BAD_GATEWAY', 'OpenCode Server is not reachable.');
  });

  request.pipe(proxyReq);
}

export async function handleOpenCodeProxyBody(request, response, openCodePath) {
  const body = await readBody(request);
  const options = {
    hostname: CONFIG.OPENCODE_HOST,
    port: CONFIG.OPENCODE_PORT,
    path: openCodePath,
    method: request.method,
    headers: {
      ...request.headers,
      host: `${CONFIG.OPENCODE_HOST}:${CONFIG.OPENCODE_PORT}`,
    },
  };

  if (body) {
    options.headers['content-length'] = Buffer.byteLength(body);
  }

  const proxyReq = httpRequest(options, (proxyRes) => {
    response.writeHead(proxyRes.statusCode, proxyRes.headers);
    proxyRes.pipe(response);
  });

  proxyReq.on('error', () => {
    errorResponse(response, 502, 'BAD_GATEWAY', 'OpenCode Server is not reachable.');
  });

  if (body) {
    proxyReq.write(body);
  }
  proxyReq.end();
}

export function handleOpenCodeSSE(request, response, openCodePath) {
  const diagId = Math.random().toString(36).slice(2, 8);
  const startTime = Date.now();
  let chunkSeq = 0;
  let sseEventCount = 0;
  let sseBuffer = Buffer.alloc(0);

  console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 1. Received SSE request: ${request.method} ${openCodePath}`);

  const options = {
    hostname: CONFIG.OPENCODE_HOST,
    port: CONFIG.OPENCODE_PORT,
    path: openCodePath,
    method: 'GET',
    headers: {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'host': `${CONFIG.OPENCODE_HOST}:${CONFIG.OPENCODE_PORT}`,
    },
  };

  console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 2. Connecting to OpenCode Server: http://${options.hostname}:${options.port}${options.path}`);

  const proxyReq = httpRequest(options, (proxyRes) => {
    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 3. OpenCode Server responded: HTTP ${proxyRes.statusCode}`);
    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 3a. OpenCode Server response headers:`, JSON.stringify(proxyRes.headers));

    const responseHeaders = {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    };

    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 4. Gateway response headers:`, JSON.stringify(responseHeaders));
    response.writeHead(proxyRes.statusCode, responseHeaders);
    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 5. SSE stream forwarding started`);

    proxyRes.on('data', (chunk) => {
      chunkSeq++;
      const recvTime = ts();

      // --- DIAG: chunk content analysis ---
      const str = chunk.toString('utf-8');

      // Escaped preview (first 120 chars, last 60 chars)
      const previewHead = str.slice(0, 120).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
      const previewTail = str.slice(-60).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
      const preview = chunk.length > 180
        ? `"${previewHead}...${previewTail}"`
        : `"${str.replace(/\r/g, '\\r').replace(/\n/g, '\\n')}"`;

      // Line ending analysis
      const lfCount = (str.match(/\n/g) || []).length;
      const crCount = (str.match(/\r(?!\n)/g) || []).length;
      const crlfCount = (str.match(/\r\n/g) || []).length;

      // SSE field counts
      const dataCount = (str.match(/^data:/gm) || []).length;
      const eventCount = (str.match(/^event:/gm) || []).length;
      const idCount = (str.match(/^id:/gm) || []).length;
      const retryCount = (str.match(/^retry:/gm) || []).length;

      // Event boundary detection: \n\n or \r\n\r\n
      const doubleLf = str.includes('\n\n');
      const doubleCrLf = str.includes('\r\n\r\n');
      const hasEventBoundary = doubleLf || doubleCrLf;

      // Does chunk start at event boundary? (buffer was empty or ended with boundary)
      const startsAtBoundary = sseBuffer.length === 0;
      // Does chunk end at event boundary?
      const endsAtBoundary = hasEventBoundary && (
        str.endsWith('\n\n') || str.endsWith('\r\n\r\n')
      );

      // Append to buffer and count complete events
      sseBuffer = Buffer.concat([sseBuffer, chunk]);
      const bufStr = sseBuffer.toString('utf-8');
      const completeEvents = (bufStr.match(/\n\n/g) || []).length + (bufStr.match(/\r\n\r\n/g) || []).length;
      const prevEventCount = sseEventCount;
      sseEventCount = completeEvents;
      const newEvents = sseEventCount - prevEventCount;

      // Check for incomplete fragment at buffer tail
      const lastBoundary = Math.max(bufStr.lastIndexOf('\n\n'), bufStr.lastIndexOf('\r\n\r\n'));
      const tailAfterBoundary = lastBoundary >= 0 ? bufStr.slice(lastBoundary + (bufStr[lastBoundary] === '\r' ? 4 : 2)) : bufStr;
      const hasIncompleteFragment = tailAfterBoundary.length > 0;

      console.log(`[${recvTime}] [DIAG-SSE] [${diagId}] chunk seq=${chunkSeq} bytes=${chunk.length} lf=${lfCount} cr=${crCount} crlf=${crlfCount} data_fields=${dataCount} event_fields=${eventCount} id_fields=${idCount} retry_fields=${retryCount} boundary=${hasEventBoundary} starts_at_boundary=${startsAtBoundary} ends_at_boundary=${endsAtBoundary} new_events=${newEvents} total_events=${sseEventCount} incomplete_fragment=${hasIncompleteFragment} fragment_bytes=${tailAfterBoundary.length}`);
      console.log(`[${recvTime}] [DIAG-SSE] [${diagId}] chunk preview: ${preview}`);

      // Write to client
      response.write(chunk);
      const writeTime = ts();
      console.log(`[${writeTime}] [DIAG-SSE] [${diagId}] chunk seq=${chunkSeq} written`);
    });

    proxyRes.on('end', () => {
      const elapsed = Date.now() - startTime;
      const bufStr = sseBuffer.toString('utf-8');
      const remainingBytes = bufStr.length;
      console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 7. OpenCode Server closed connection elapsed=${elapsed}ms total_chunks=${chunkSeq} total_events=${sseEventCount} remaining_buffer_bytes=${remainingBytes}`);
      if (remainingBytes > 0) {
        const tailPreview = bufStr.slice(-200).replace(/\r/g, '\\r').replace(/\n/g, '\\n');
        console.log(`[${ts()}] [DIAG-SSE] [${diagId}] remaining buffer tail: "${tailPreview}"`);
      }
    });
  });

  proxyReq.on('error', (err) => {
    const elapsed = Date.now() - startTime;
    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] ERROR: OpenCode Server connection error: ${err.message} elapsed=${elapsed}ms`);
    errorResponse(response, 502, 'BAD_GATEWAY', 'OpenCode Server is not reachable.');
  });

  proxyReq.end();

  request.on('close', () => {
    const elapsed = Date.now() - startTime;
    console.log(`[${ts()}] [DIAG-SSE] [${diagId}] 6. Client disconnected elapsed=${elapsed}ms total_chunks=${chunkSeq} total_events=${sseEventCount}`);
    proxyReq.destroy();
  });
}

// --- DIAG-SSE-TEST: Pure SSE test endpoint (no OpenCode Server dependency) ---

export function handleDiagSSE(request, response) {
  const diagId = Math.random().toString(36).slice(2, 8);
  const startTime = Date.now();
  let seq = 0;

  console.log(`[${ts()}] [DIAG-SSE-TEST] [${diagId}] connection started from ${request.socket.remoteAddress}`);

  const responseHeaders = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };

  response.writeHead(200, responseHeaders);
  console.log(`[${ts()}] [DIAG-SSE-TEST] [${diagId}] response headers sent`);

  function writeEvent(data) {
    seq++;
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const bytes = Buffer.byteLength(payload);
    response.write(payload);
    console.log(`[${ts()}] [DIAG-SSE-TEST] [${diagId}] write seq=${seq} bytes=${bytes} type=${data.type}`);
  }

  // Send hello event immediately
  writeEvent({ type: 'hello', seq: 1, ts: new Date().toISOString(), source: 'gateway-diag' });

  // Send heartbeat events at 3-second intervals
  const interval = setInterval(() => {
    writeEvent({ type: 'heartbeat', seq: seq + 1, ts: new Date().toISOString() });
    if (seq >= 4) {
      clearInterval(interval);
      const elapsed = Date.now() - startTime;
      console.log(`[${ts()}] [DIAG-SSE-TEST] [${diagId}] test complete, sending final event elapsed=${elapsed}ms total_events=${seq}`);
      writeEvent({ type: 'done', seq: seq + 1, ts: new Date().toISOString(), total_events: seq + 1 });
      response.end();
    }
  }, 3000);

  request.on('close', () => {
    clearInterval(interval);
    const elapsed = Date.now() - startTime;
    console.log(`[${ts()}] [DIAG-SSE-TEST] [${diagId}] client disconnected elapsed=${elapsed}ms total_events=${seq}`);
  });
}
