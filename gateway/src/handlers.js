import { readdir, stat, readFile, writeFile, mkdir, rename, unlink, rm } from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import { resolve, dirname, basename, join, normalize, relative, extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { pipeline } from 'node:stream/promises';
import Busboy from 'busboy';
import archiver from 'archiver';
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

// --- Viewer State ---

const DEFAULT_VIEWER_STATE = { version: 1, positions: {}, history: [] };
const MAX_HISTORY_ENTRIES = 10;

async function ensureViewerStateDir() {
  const dir = dirname(CONFIG.VIEWER_STATE_FILE);
  try {
    await mkdir(dir, { recursive: true });
  } catch {
    // directory may already exist
  }
}

async function readViewerState() {
  try {
    const raw = await readFile(CONFIG.VIEWER_STATE_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.version === 1) {
      return parsed;
    }
    return { ...DEFAULT_VIEWER_STATE };
  } catch {
    return { ...DEFAULT_VIEWER_STATE };
  }
}

async function writeViewerState(state) {
  await ensureViewerStateDir();
  const data = JSON.stringify(state, null, 2);
  await writeFile(CONFIG.VIEWER_STATE_FILE, data, 'utf-8');
}

export async function handleViewerStateGet(_request, response) {
  const state = await readViewerState();
  json(response, 200, state);
}

export async function handleViewerStatePatchPosition(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { filePath, progress, updatedAt } = parsed;
  if (!filePath || typeof filePath !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'filePath is required.');
  }
  if (typeof progress !== 'number' || progress < 0 || progress > 1) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'progress must be a number between 0 and 1.');
  }
  if (typeof updatedAt !== 'number') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'updatedAt is required.');
  }

  const state = await readViewerState();
  const existing = state.positions[filePath];
  if (!existing || existing.updatedAt < updatedAt) {
    state.positions[filePath] = { progress, updatedAt };
    await writeViewerState(state);
  }

  json(response, 200, { ok: true });
}

export async function handleViewerStatePatchHistory(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { path: filePath, lastViewedAt } = parsed;
  if (!filePath || typeof filePath !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'path is required.');
  }
  if (typeof lastViewedAt !== 'number') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'lastViewedAt is required.');
  }

  const state = await readViewerState();

  // Remove existing entry for this path (if any)
  state.history = state.history.filter((e) => e.path !== filePath);

  // Add to front
  state.history.unshift({ path: filePath, lastViewedAt });

  // Enforce max entries
  if (state.history.length > MAX_HISTORY_ENTRIES) {
    state.history = state.history.slice(0, MAX_HISTORY_ENTRIES);
  }

  await writeViewerState(state);
  json(response, 200, { ok: true });
}

export async function handleViewerStateDeleteHistory(request, response, url) {
  const filePath = url.searchParams.get('path');
  if (!filePath) {
    return errorResponse(response, 400, 'INVALID_REQUEST', "The 'path' query parameter is required.");
  }

  const state = await readViewerState();
  const before = state.history.length;
  state.history = state.history.filter((e) => e.path !== filePath);

  if (state.history.length !== before) {
    await writeViewerState(state);
  }

  json(response, 200, { ok: true });
}

// --- Rename ---

export async function handleRename(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { path: filePath, newName } = parsed;

  if (!filePath || typeof filePath !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'path is required.');
  }
  if (!newName || typeof newName !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'newName is required.');
  }

  // Reject names containing path separators
  if (/[\/\\]/.test(newName)) {
    return errorResponse(response, 400, 'INVALID_NAME', 'newName must not contain path separators.');
  }

  // Reject empty names or names with only dots/spaces
  if (!newName.trim() || newName === '.' || newName === '..') {
    return errorResponse(response, 400, 'INVALID_NAME', 'Invalid file name.');
  }

  // Validate source path
  const srcValidation = validatePath(filePath, CONFIG.ROOT_PATH);
  if (!srcValidation.valid) {
    if (srcValidation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Path is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid path.');
  }

  const srcResolved = srcValidation.resolvedPath;

  // Check source exists
  let srcStats;
  try {
    srcStats = await stat(srcResolved);
  } catch {
    return errorResponse(response, 404, 'NOT_FOUND', 'File or directory not found.');
  }

  // Build destination path
  const parentDir = dirname(srcResolved);
  const destResolved = resolve(parentDir, newName);

  // Validate destination path is within root
  const destValidation = validatePath(destResolved, CONFIG.ROOT_PATH);
  if (!destValidation.valid) {
    if (destValidation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Destination is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid destination path.');
  }

  // Check destination does not already exist
  try {
    await stat(destResolved);
    return errorResponse(response, 409, 'ALREADY_EXISTS', 'A file or directory with that name already exists.');
  } catch {
    // Good — destination does not exist
  }

  // Perform rename
  try {
    await rename(srcResolved, destResolved);
  } catch (e) {
    console.error(`[Rename] Failed: ${e.message}`);
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'Failed to rename.');
  }

  json(response, 200, { ok: true, path: destResolved });
}

// --- Delete ---

export async function handleDelete(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { paths } = parsed;

  if (!Array.isArray(paths) || paths.length === 0) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'paths array is required.');
  }

  // Validate all paths first
  const validatedPaths = [];
  for (const p of paths) {
    if (!p || typeof p !== 'string') {
      return errorResponse(response, 400, 'INVALID_REQUEST', 'Each path must be a non-empty string.');
    }
    const validation = validatePath(p, CONFIG.ROOT_PATH);
    if (!validation.valid) {
      if (validation.error === 'FORBIDDEN') {
        return errorResponse(response, 403, 'FORBIDDEN', `Path is outside the allowed root: ${p}`);
      }
      return errorResponse(response, 400, 'INVALID_REQUEST', `Invalid path: ${p}`);
    }
    validatedPaths.push(validation.resolvedPath);
  }

  // Delete each path
  let deleted = 0;
  const errors = [];
  for (let i = 0; i < validatedPaths.length; i++) {
    const resolved = validatedPaths[i];
    try {
      const s = await stat(resolved);
      if (s.isDirectory()) {
        await rm(resolved, { recursive: true, force: false });
      } else {
        await unlink(resolved);
      }
      deleted++;
    } catch (e) {
      errors.push({ path: paths[i], error: e.message });
    }
  }

  if (errors.length > 0 && deleted === 0) {
    return errorResponse(response, 500, 'DELETE_FAILED', 'Failed to delete items.');
  }

  json(response, 200, { ok: true, deleted, errors: errors.length > 0 ? errors : undefined });
}

// --- Mkdir ---

export async function handleMkdir(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { parentPath, name } = parsed;

  if (!parentPath || typeof parentPath !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'parentPath is required.');
  }
  if (!name || typeof name !== 'string') {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'name is required.');
  }

  // Reject names containing path separators
  if (/[\/\\]/.test(name)) {
    return errorResponse(response, 400, 'INVALID_NAME', 'name must not contain path separators.');
  }

  // Reject empty names or names with only dots/spaces
  if (!name.trim() || name === '.' || name === '..') {
    return errorResponse(response, 400, 'INVALID_NAME', 'Invalid folder name.');
  }

  // Validate parent path
  const parentValidation = validatePath(parentPath, CONFIG.ROOT_PATH);
  if (!parentValidation.valid) {
    if (parentValidation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Path is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid parent path.');
  }

  const parentResolved = parentValidation.resolvedPath;

  // Check parent is a directory
  try {
    const parentStat = await stat(parentResolved);
    if (!parentStat.isDirectory()) {
      return errorResponse(response, 400, 'INVALID_REQUEST', 'The specified parent path is not a directory.');
    }
  } catch {
    return errorResponse(response, 404, 'NOT_FOUND', 'Parent directory not found.');
  }

  // Build child path
  const destResolved = resolve(parentResolved, name);

  // Validate child path is within root
  const destValidation = validatePath(destResolved, CONFIG.ROOT_PATH);
  if (!destValidation.valid) {
    if (destValidation.error === 'FORBIDDEN') {
      return errorResponse(response, 403, 'FORBIDDEN', 'Destination is outside the allowed root.');
    }
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid destination path.');
  }

  // Check destination does not already exist
  try {
    await stat(destResolved);
    return errorResponse(response, 409, 'ALREADY_EXISTS', 'A file or directory with that name already exists.');
  } catch {
    // Good — destination does not exist
  }

  // Perform mkdir
  try {
    await mkdir(destResolved);
  } catch (e) {
    console.error(`[Mkdir] Failed: ${e.message}`);
    return errorResponse(response, 500, 'INTERNAL_ERROR', 'Failed to create directory.');
  }

  json(response, 200, { ok: true, path: destResolved });
}

// --- Download ---

export async function handleDownloadGet(request, response, url) {
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
    return errorResponse(response, 400, 'INVALID_REQUEST', 'The specified path is not a file. Use POST for directories.');
  }

  const filename = basename(resolved);

  response.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': stats.size,
  });

  createReadStream(resolved).pipe(response);
}

export async function handleDownloadPost(request, response) {
  const body = await readBody(request);
  if (!body) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Request body is required.');
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid JSON.');
  }

  const { paths } = parsed;

  if (!Array.isArray(paths) || paths.length === 0) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'paths array is required.');
  }

  const validatedPaths = [];
  for (const p of paths) {
    if (!p || typeof p !== 'string') {
      return errorResponse(response, 400, 'INVALID_REQUEST', 'Each path must be a non-empty string.');
    }
    const validation = validatePath(p, CONFIG.ROOT_PATH);
    if (!validation.valid) {
      if (validation.error === 'FORBIDDEN') {
        return errorResponse(response, 403, 'FORBIDDEN', `Path is outside the allowed root: ${p}`);
      }
      return errorResponse(response, 400, 'INVALID_REQUEST', `Invalid path: ${p}`);
    }
    validatedPaths.push({ requested: p, resolved: validation.resolvedPath });
  }

  let stats;
  for (const vp of validatedPaths) {
    try {
      stats = await stat(vp.resolved);
    } catch {
      return errorResponse(response, 404, 'NOT_FOUND', `Not found: ${vp.requested}`);
    }
  }

  let filename;
  if (validatedPaths.length === 1) {
    const single = validatedPaths[0];
    const singleStat = await stat(single.resolved);
    if (singleStat.isDirectory()) {
      filename = basename(single.resolved) + '.zip';
    } else {
      filename = basename(single.resolved);
    }
  } else {
    filename = 'download.zip';
  }

  const archive = archiver('zip', { zlib: { level: 6 } });

  archive.on('warning', (err) => {
    if (err.code === 'SYMLINKNOTSUPPORTED') {
      console.warn('[Download] Symlink skipped:', err.message);
      return;
    }
    console.warn('[Download] Archive warning:', err);
  });

  archive.on('error', (err) => {
    console.error('[Download] Archive error:', err);
    if (!response.headersSent) {
      errorResponse(response, 500, 'INTERNAL_ERROR', 'Failed to create archive.');
    } else {
      response.destroy();
    }
  });

  response.writeHead(200, {
    ...CORS_HEADERS,
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });

  archive.pipe(response);

  for (const vp of validatedPaths) {
    const itemStat = await stat(vp.resolved);
    const name = basename(vp.resolved);
    if (itemStat.isDirectory()) {
      archive.directory(vp.resolved, name);
    } else {
      archive.file(vp.resolved, { name });
    }
  }

  archive.finalize();
}

// --- Upload ---

function isPathSafe(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') return false;
  const normalized = normalize(relativePath);
  if (normalized.startsWith('..') || normalized === '.' || normalized === '') return false;
  if (/^([A-Z]:|\\\\)/i.test(normalized)) return false;
  return true;
}

async function getUniqueName(destDir, name) {
  const ext = extname(name);
  const base = ext ? name.slice(0, -ext.length) : name;

  let candidate = name;
  let i = 2;
  while (true) {
    try {
      await stat(join(destDir, candidate));
      candidate = `${base} (${i})${ext}`;
      i++;
    } catch {
      return candidate;
    }
  }
}





// export async function handleUpload(request, response) {
//   const contentType = request.headers['content-type'] || '';
//   if (!contentType.includes('multipart/form-data')) {
//     return errorResponse(response, 400, 'INVALID_REQUEST', 'Content-Type must be multipart/form-data.');
//   }

//   let busboyInstance;
//   try {
//     busboyInstance = Busboy({ headers: request.headers, limits: { fileSize: Infinity, files: 100 } });
//   } catch {
//     return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid multipart data.');
//   }

//   const destPath = busboyInstance.fields['destPath'];
//   if (!destPath || typeof destPath !== 'string') {
//     busboyInstance.destroy();
//     return errorResponse(response, 400, 'INVALID_REQUEST', 'destPath is required.');
//   }

//   const destValidation = validatePath(destPath, CONFIG.ROOT_PATH);
//   if (!destValidation.valid) {
//     busboyInstance.destroy();
//     if (destValidation.error === 'FORBIDDEN') {
//       return errorResponse(response, 403, 'FORBIDDEN', 'Destination is outside the allowed root.');
//     }
//     return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid destination path.');
//   }

//   const destResolved = destValidation.resolvedPath;

//   let destStat;
//   try {
//     destStat = await stat(destResolved);
//     if (!destStat.isDirectory()) {
//       busboyInstance.destroy();
//       return errorResponse(response, 400, 'INVALID_REQUEST', 'Destination is not a directory.');
//     }
//   } catch {
//     busboyInstance.destroy();
//     return errorResponse(response, 404, 'NOT_FOUND', 'Destination directory not found.');
//   }

//   const tmpDir = join(destResolved, '.hp_uploads');
//   try { await mkdir(tmpDir, { recursive: true }); } catch { /* may exist */ }

//   const files = [];
//   const tmpFiles = [];
//   let uploadError = null;

//   busboyInstance.on('file', (fieldname, fileStream, info) => {
//     const filename = info.filename || 'unnamed';
//     const relativePath = filename;

//     if (!isPathSafe(relativePath)) {
//       fileStream.resume();
//       uploadError = `Invalid path: ${relativePath}`;
//       return;
//     }

//     const targetDir = join(destResolved, dirname(relativePath));
//     const tmpName = `.upload_tmp_${randomUUID()}`;
//     const tmpPath = join(tmpDir, tmpName);
//     const finalName = filename;

//     fileStream.on('limit', () => {
//       uploadError = `File too large: ${filename}`;
//     });

//     const writeStream = createWriteStream(tmpPath);
//     tmpFiles.push(tmpPath);

//     fileStream.pipe(writeStream);

//     writeStream.on('finish', () => {
//       files.push({ tmpPath, finalPath, targetDir, finalName, relativePath });
//     });

//     writeStream.on('error', (err) => {
//       uploadError = `Write error: ${err.message}`;
//     });

//     fileStream.on('error', (err) => {
//       uploadError = `Stream error: ${err.message}`;
//     });
//   });

//   busboyInstance.on('error', (err) => {
//     uploadError = `Parse error: ${err.message}`;
//   });

//   busboyInstance.on('finish', async () => {
//     if (uploadError) {
//       for (const tmp of tmpFiles) {
//         try { await unlink(tmp); } catch { /* ignore */ }
//       }
//       try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }
//       return errorResponse(response, 500, 'UPLOAD_FAILED', uploadError);
//     }

//     let uploaded = 0;
//     const errors = [];

//     for (const f of files) {
//       try {
//         await mkdir(f.targetDir, { recursive: true });
//         const uniqueName = await getUniqueName(f.targetDir, f.finalName);
//         const uniqueFinalPath = join(f.targetDir, uniqueName);
//         await rename(f.tmpPath, uniqueFinalPath);
//         uploaded++;
//       } catch (e) {
//         errors.push({ path: f.relativePath, error: e.message });
//         try { await unlink(f.tmpPath); } catch { /* ignore */ }
//       }
//     }

//     try { await rm(tmpDir, { recursive: true, force: true }); } catch { /* ignore */ }

//     json(response, 200, { ok: true, uploaded, errors: errors.length > 0 ? errors : undefined });
//   });

//   request.pipe(busboyInstance);
// }





export async function handleUpload(request, response) {
  const contentType = request.headers['content-type'] || '';

  if (!contentType.includes('multipart/form-data')) {
    return errorResponse(
      response,
      400,
      'INVALID_REQUEST',
      'Content-Type must be multipart/form-data.',
    );
  }

  let busboyInstance;

  try {
    busboyInstance = Busboy({
      headers: request.headers,
      limits: {
        fileSize: Infinity,
        files: 100,
      },
    });
  } catch {
    return errorResponse(
      response,
      400,
      'INVALID_REQUEST',
      'Invalid multipart data.',
    );
  }

  // destPath is a multipart field, so it cannot be read synchronously
  // from the Busboy instance. Store it when the field event arrives.
  let destPath = null;
  const relativePaths = [];

  // Store uploaded files in a temporary directory first.
  // The final destination is validated only after all multipart fields
  // and files have been received.
  const tmpDir = join(
    CONFIG.ROOT_PATH,
    `.hp_upload_tmp_${randomUUID()}`,
  );

  try {
    await mkdir(tmpDir, { recursive: true });
  } catch {
    return errorResponse(
      response,
      500,
      'UPLOAD_FAILED',
      'Failed to create temporary upload directory.',
    );
  }

  const files = [];
  const tmpFiles = [];
  const writePromises = [];

  let uploadError = null;

  // busboyInstance.on('field', (fieldname, value) => {
  //   if (fieldname === 'destPath') {
  //     destPath = value;
  //   }
  // });

  busboyInstance.on('field', (fieldname, value) => {
    if (fieldname === 'destPath') {
      destPath = value;
    } else if (fieldname === 'relativePaths') {
      relativePaths.push(value);
    }
  });





  // busboyInstance.on('file', (fieldname, fileStream, info) => {
  //   // Ignore unexpected multipart fields.
  //   if (fieldname !== 'files') {
  //     fileStream.resume();
  //     return;
  //   }

  //   // const filename = info.filename || 'unnamed';
  //   // const relativePath = filename;

  //   // if (!isPathSafe(relativePath)) {
  //   //   fileStream.resume();
  //   //   uploadError = `Invalid path: ${relativePath}`;
  //   //   return;
  //   // }

  //   const filename = info.filename || 'unnamed';
  //   const fileIndex = files.length;
  //   const relativePath = relativePaths[fileIndex];

  //   if (!relativePath || !isPathSafe(relativePath)) {
  //     fileStream.resume();
  //     uploadError = `Invalid relative path for file: ${filename}`;
  //     return;
  //   }



  // busboyInstance.on('file', (fieldname, fileStream, info) => {
  //   if (fieldname !== 'files') {
  //     fileStream.resume();
  //     return;
  //   }

  //   const filename = info.filename || 'unnamed';
  //   const fileIndex = uploadFileIndex++;
  //   const relativePath = relativePaths[fileIndex];

  //   if (!relativePath || !isPathSafe(relativePath)) {
  //     fileStream.resume();
  //     uploadError = `Invalid relative path for file: ${filename}`;
  //     return;
  //   }

  //   const tmpPath = join(
  //     tmpDir,
  //     `.upload_tmp_${randomUUID()}`,
  //   );

  //   tmpFiles.push(tmpPath);

  //   const writeStream = createWriteStream(tmpPath);

  //   const writePromise = new Promise((resolveWrite) => {
  //     let settled = false;

  //     const finishWrite = () => {
  //       if (settled) {
  //         return;
  //       }

  //       settled = true;
  //       resolveWrite();
  //     };

  //     fileStream.on('limit', () => {
  //       uploadError = `File too large: ${relativePath}`;
  //     });

  //     fileStream.on('error', (err) => {
  //       uploadError = `Stream error: ${err.message}`;
  //       finishWrite();
  //     });

  //     writeStream.on('error', (err) => {
  //       uploadError = `Write error: ${err.message}`;
  //       finishWrite();
  //     });

  //     writeStream.on('finish', () => {
  //       files.push({
  //         tmpPath,
  //         relativePath,
  //       });

  //       finishWrite();
  //     });

  //     fileStream.pipe(writeStream);
  //   });

  //   writePromises.push(writePromise);
  // });





  let uploadFileIndex = 0;

  busboyInstance.on('file', (fieldname, fileStream, info) => {
    if (fieldname !== 'files') {
      fileStream.resume();
      return;
    }

    const fileIndex = uploadFileIndex++;
    const filename = info.filename || 'unnamed';

    const tmpPath = join(
      tmpDir,
      `.upload_tmp_${randomUUID()}`,
    );
    tmpFiles.push(tmpPath);

    const writeStream = createWriteStream(tmpPath);

    const writePromise = new Promise((resolveWrite) => {
      let settled = false;

      const finishWrite = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolveWrite();
      };

      fileStream.on('limit', () => {
        uploadError = `File too large: ${filename}`;
      });

      fileStream.on('error', (err) => {
        uploadError = `Stream error: ${err.message}`;
        finishWrite();
      });

      writeStream.on('error', (err) => {
        uploadError = `Write error: ${err.message}`;
        finishWrite();
      });

      writeStream.on('finish', () => {
        files.push({
          tmpPath,
          fileIndex,
          filename,
        });

        finishWrite();
      });

      fileStream.pipe(writeStream);
    });

    writePromises.push(writePromise);
  });





  busboyInstance.on('error', (err) => {
    uploadError = `Parse error: ${err.message}`;
  });

  busboyInstance.on('finish', async () => {
    try {
      // Wait until every file stream has finished writing.
      await Promise.all(writePromises);



      for (const file of files) {
        const relativePath = relativePaths[file.fileIndex];

        if (!relativePath || !isPathSafe(relativePath)) {
          uploadError = `Invalid relative path for file: ${file.filename}`;
          break;
        }

        file.relativePath = relativePath;
      }



      // Validate destination only after Busboy has delivered the fields.
      if (!destPath || typeof destPath !== 'string') {
        uploadError = 'destPath is required.';
      }

      let destResolved = null;

      if (!uploadError) {
        const destValidation = validatePath(
          destPath,
          CONFIG.ROOT_PATH,
        );

        if (!destValidation.valid) {
          if (destValidation.error === 'FORBIDDEN') {
            uploadError = 'Destination is outside the allowed root.';
          } else {
            uploadError = 'Invalid destination path.';
          }
        } else {
          destResolved = destValidation.resolvedPath;

          try {
            const destStat = await stat(destResolved);

            if (!destStat.isDirectory()) {
              uploadError = 'Destination is not a directory.';
            }
          } catch {
            uploadError = 'Destination directory not found.';
          }
        }
      }

      if (uploadError) {
        for (const tmp of tmpFiles) {
          try {
            await unlink(tmp);
          } catch {
            // Ignore cleanup errors.
          }
        }

        try {
          await rm(tmpDir, { recursive: true, force: true });
        } catch {
          // Ignore cleanup errors.
        }

        return errorResponse(
          response,
          400,
          'UPLOAD_FAILED',
          uploadError,
        );
      }

      let uploaded = 0;
      const errors = [];

      for (const file of files) {
        try {
          const relativePath = file.relativePath;

          const targetDir = join(
            destResolved,
            dirname(relativePath),
          );

          const finalName = basename(relativePath);

          await mkdir(targetDir, { recursive: true });

          const uniqueName = await getUniqueName(
            targetDir,
            finalName,
          );

          const uniqueFinalPath = join(
            targetDir,
            uniqueName,
          );

          await rename(
            file.tmpPath,
            uniqueFinalPath,
          );

          uploaded++;
        } catch (e) {
          errors.push({
            path: file.relativePath,
            error: e.message,
          });

          try {
            await unlink(file.tmpPath);
          } catch {
            // Ignore cleanup errors.
          }
        }
      }

      try {
        await rm(tmpDir, {
          recursive: true,
          force: true,
        });
      } catch {
        // Ignore cleanup errors.
      }

      json(response, 200, {
        ok: true,
        uploaded,
        errors: errors.length > 0 ? errors : undefined,
      });
    } catch (e) {
      console.error(`[Upload] Failed: ${e.message}`);

      for (const tmp of tmpFiles) {
        try {
          await unlink(tmp);
        } catch {
          // Ignore cleanup errors.
        }
      }

      try {
        await rm(tmpDir, {
          recursive: true,
          force: true,
        });
      } catch {
        // Ignore cleanup errors.
      }

      if (!response.headersSent) {
        return errorResponse(
          response,
          500,
          'UPLOAD_FAILED',
          'Failed to upload files.',
        );
      }
    }
  });

  request.pipe(busboyInstance);
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
