import { createServer } from 'node:http';
import { CONFIG } from './config.js';
import { generateToken, verifyToken } from './token.js';
import {
  json, noContent, errorResponse,
  handleHealth, handleRoot, handleDirectory, handleFile,
  handleOpenCodeProxy, handleOpenCodeProxyBody, handleOpenCodeSSE,
} from './handlers.js';

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

function extractTokenFromRequest(request, url) {
  const headerToken = extractToken(request);
  if (headerToken) return headerToken;
  return url.searchParams.get('token');
}

function setCorsHeaders(response) {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
}

const server = createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === 'OPTIONS') {
    return noContent(response);
  }

  if (request.method !== 'GET' && request.method !== 'POST') {
    return errorResponse(response, 405, 'METHOD_NOT_ALLOWED', 'Only GET, POST and OPTIONS are allowed.');
  }

  const url = parseUrl(request.url);
  if (!url) {
    return errorResponse(response, 400, 'INVALID_REQUEST', 'Invalid URL.');
  }

  const path = url.pathname;
  const requestToken = extractTokenFromRequest(request, url);

  // Diagnostic: log token extraction for OpenCode routes
  if (path.startsWith('/api/opencode/')) {
    const hasHeader = !!(request.headers.authorization);
    const queryToken = url.searchParams.get('token');
    const headerToken = extractToken(request);
    console.log(`[DIAG] ${request.method} ${path}`);
    console.log(`[DIAG] Authorization header present: ${hasHeader}`);
    console.log(`[DIAG] Header token: ${headerToken ? headerToken.slice(0, 4) + '...' : 'null'}`);
    console.log(`[DIAG] Query token: ${queryToken ? queryToken.slice(0, 4) + '...' : 'null'}`);
    console.log(`[DIAG] requestToken: ${requestToken ? requestToken.slice(0, 4) + '...' : 'null'}`);
    console.log(`[DIAG] verifyToken result: ${verifyToken(requestToken, token)}`);
  }

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

  // --- OpenCode Proxy ---
  if (path.startsWith('/api/opencode/')) {
    if (!verifyToken(requestToken, token)) {
      return errorResponse(response, 401, 'UNAUTHORIZED', 'Authentication required.');
    }

    const openCodePath = path.slice('/api/opencode'.length) + url.search;

    if (path === '/api/opencode/event') {
      return handleOpenCodeSSE(request, response, openCodePath);
    }

    if (request.method === 'GET') {
      return handleOpenCodeProxy(request, response, openCodePath);
    }

    if (request.method === 'POST') {
      return handleOpenCodeProxyBody(request, response, openCodePath);
    }
  }

  return errorResponse(response, 404, 'NOT_FOUND', 'Endpoint not found.');
});

server.listen(CONFIG.PORT, CONFIG.HOST, () => {
  console.log(`HomePilot Gateway listening on http://${CONFIG.HOST}:${CONFIG.PORT}`);
  console.log(`ROOT_PATH: ${CONFIG.ROOT_PATH}`);
  console.log(`OpenCode Server: http://${CONFIG.OPENCODE_HOST}:${CONFIG.OPENCODE_PORT}`);
  console.log(`Token: ${token}`);
  console.log('');
  console.log('Use this token in Authorization header:');
  console.log(`  Authorization: Bearer ${token}`);
});
