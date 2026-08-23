import { readdir, stat, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { CONFIG } from './config.js';
import { validatePath, isTextFile } from './pathValidator.js';

export function json(response, statusCode, data) {
  response.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify(data));
}

export function noContent(response) {
  response.writeHead(204);
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
