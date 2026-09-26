import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Readable } from 'node:stream';

// CONFIG reads HOMEPILOT_ROOT at import time, so the environment must be set
// before handlers.js is loaded.
let handlers;
let root;

before(async () => {
  root = await mkdtemp(join(tmpdir(), 'homepilot-gateway-test-'));
  process.env.HOMEPILOT_ROOT = root;
  handlers = await import('../src/handlers.js');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

function createRequest(body) {
  const chunks = body === undefined ? [] : [Buffer.from(body, 'utf-8')];
  return Object.assign(Readable.from(chunks), { headers: {} });
}

function createResponse() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    writeHead(statusCode, headers) {
      this.statusCode = statusCode;
      this.headers = headers || {};
      return this;
    },
    end(chunk) {
      this.body = chunk ? String(chunk) : '';
    },
  };
}

async function postFile(payload) {
  const request = createRequest(payload);
  const response = createResponse();
  await handlers.handleFileWrite(request, response);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

async function getFile(path) {
  const url = new URL('http://localhost/api/fs/file');
  url.searchParams.set('path', path);
  const response = createResponse();
  await handlers.handleFile({}, response, url);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

function bodyOf(content) {
  return JSON.stringify(content);
}

describe('POST /api/fs/file', () => {
  it('creates a new file', async () => {
    const path = join(root, 'created.txt');
    const result = await postFile(bodyOf({ path, content: 'hello' }));

    assert.equal(result.status, 200);
    assert.equal(result.data.ok, true);
    assert.equal(await readFile(path, 'utf-8'), 'hello');
  });

  it('overwrites an existing file', async () => {
    const path = join(root, 'overwrite.txt');
    const first = await postFile(bodyOf({ path, content: 'first' }));
    assert.equal(first.status, 200);

    const second = await postFile(bodyOf({ path, content: 'second' }));
    assert.equal(second.status, 200);
    assert.equal(await readFile(path, 'utf-8'), 'second');
  });

  it('stores UTF-8 content unchanged', async () => {
    const path = join(root, 'utf8.txt');
    const content = '日本語テキスト 🚀\n改行と\tタブ含む';
    const result = await postFile(bodyOf({ path, content }));

    assert.equal(result.status, 200);
    assert.equal(await readFile(path, 'utf-8'), content);
    assert.deepEqual(await readFile(path), Buffer.from(content, 'utf-8'));
  });

  it('rejects paths outside the root exactly like GET /api/fs/file', async () => {
    const outside = resolve(root, '..', 'outside.txt');

    const write = await postFile(bodyOf({ path: outside, content: 'x' }));
    assert.equal(write.status, 403);
    assert.equal(write.data.error.code, 'FORBIDDEN');

    const read = await getFile(outside);
    assert.equal(read.status, 403);
    assert.equal(read.data.error.code, 'FORBIDDEN');
  });

  it('rejects relative paths exactly like GET /api/fs/file', async () => {
    const write = await postFile(bodyOf({ path: 'relative.txt', content: 'x' }));
    assert.equal(write.status, 400);
    assert.equal(write.data.error.code, 'INVALID_REQUEST');

    const read = await getFile('relative.txt');
    assert.equal(read.status, 400);
    assert.equal(read.data.error.code, 'INVALID_REQUEST');
  });

  it('rejects a missing request body', async () => {
    const result = await postFile(undefined);
    assert.equal(result.status, 400);
    assert.equal(result.data.error.message, 'Request body is required.');
  });

  it('rejects an invalid JSON body', async () => {
    const result = await postFile('{not-json');
    assert.equal(result.status, 400);
    assert.equal(result.data.error.message, 'Invalid JSON.');
  });

  it('rejects a body without path', async () => {
    const result = await postFile(bodyOf({ content: 'x' }));
    assert.equal(result.status, 400);
    assert.equal(result.data.error.message, 'path is required.');
  });

  it('rejects a body without string content', async () => {
    const path = join(root, 'no-content.txt');

    const missing = await postFile(bodyOf({ path }));
    assert.equal(missing.status, 400);
    assert.equal(missing.data.error.message, 'content must be a string.');

    const wrongType = await postFile(bodyOf({ path, content: 42 }));
    assert.equal(wrongType.status, 400);
    assert.equal(wrongType.data.error.message, 'content must be a string.');
  });

  it('refuses to overwrite a directory', async () => {
    const dir = join(root, 'a-directory');
    await mkdir(dir, { recursive: true });

    const result = await postFile(bodyOf({ path: dir, content: 'x' }));
    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'INVALID_REQUEST');
  });

  it('returns 404 when the parent directory does not exist', async () => {
    const path = join(root, 'missing-parent', 'file.txt');
    const result = await postFile(bodyOf({ path, content: 'x' }));

    assert.equal(result.status, 404);
    assert.equal(result.data.error.code, 'NOT_FOUND');
  });
});

test('write then read round-trips through the shared file endpoint', async () => {
  const path = join(root, 'round-trip.txt');
  const write = await postFile(bodyOf({ path, content: 'round trip' }));
  assert.equal(write.status, 200);

  const read = await getFile(path);
  assert.equal(read.status, 200);
  assert.equal(read.data.content, 'round trip');
});
