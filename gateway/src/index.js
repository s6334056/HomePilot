import { createServer } from 'node:http';
import { CONFIG } from './config.js';
import { generateToken, verifyToken } from './token.js';
import { json, noContent, errorResponse, handleHealth, handleRoot, handleDirectory, handleFile } from './handlers.js';

const token = generateToken();

function parseUrl(requestUrl) {
  try {
    return new URL(requestUrl, `http://localhost:${CONFIG.PORT}`);
  } catch {
    return null;
  }
}

function extractToken(request) {
  const auth = request.headers.authorization;
  if (!auth) return null;
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    return noContent(response);
  }

  if (request.method !== 'GET') {
    return errorResponse(response, 405, 'METHOD_NOT_ALLOWED', 'Only GET and OPTIONS are allowed.');
  }

  const url = parseUrl(request.url);
  if (!url) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid URL.');
  }

  const path = url.pathname;
  const requestToken = extractToken(request);

  if (path === '/api/health') {
    if (!verifyToken(requestToken, token)) {
      return errorResponse(response, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return handleHealth(request, response);
  }

  if (path === '/api/fs/root') {
    if (!verifyToken(requestToken, token)) {
      return errorResponse(response, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return handleRoot(request, response);
  }

  if (path === '/api/fs/directory') {
    if (!verifyToken(requestToken, token)) {
      return errorResponse(response, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return handleDirectory(request, response, url);
  }

  if (path === '/api/fs/file') {
    if (!verifyToken(requestToken, token)) {
      return errorResponse(response, 401, 'UNAUTHORIZED', 'Authentication required.');
    }
    return handleFile(request, response, url);
  }

  return errorResponse(response, 404, 'NOT_FOUND', 'Endpoint not found.');
});

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`HomePilot Gateway listening on http://${CONFIG.HOST}:${CONFIG.PORT}`);
  console.log(`ROOT_PATH: ${CONFIG.ROOT_PATH}`);
  console.log(`Token: ${token}`);
  console.log('');
  console.log('Use this token in Authorization header:');
  console.log(`  Authorization: Bearer ${token}`);
});
