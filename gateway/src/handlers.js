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
