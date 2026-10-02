import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from 'node:fs/promises';
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

// ── Non-ASCII filename end-to-end ─────────────────────────────────────
// These tests exercise the actual filesystem paths with Japanese, accented
// and emoji characters through the Gateway handlers, so the "no problem"
// verdict for read/write/list/rename/delete/move/copy is backed by a real
// round-trip rather than a code review alone.

async function postJson(handlerName, payload) {
  const request = createRequest(JSON.stringify(payload));
  const response = createResponse();
  await handlers[handlerName](request, response);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

async function callWithUrl(handlerName, path, extraParams = {}) {
  const url = new URL('http://localhost/api/fs/directory');
  url.searchParams.set('path', path);
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }
  const response = createResponse();
  await handlers[handlerName]({}, response, url);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

const NON_ASCII_NAMES = [
  'テスト.txt',
  '深呼吸の方法_ストレス対策まとめ.md',
  'résumé.txt',
  'café.txt',
  '中文.txt',
  '한국어.txt',
  'emoji😀.txt',
  'テスト 全角スペース.txt',
];

describe('non-ASCII filenames through the Gateway handlers', () => {
  for (const name of NON_ASCII_NAMES) {
    it(`write + read round-trips for "${name}"`, async () => {
      const path = join(root, name);
      const content = `content of ${name} 🚀`;

      const write = await postJson('handleFileWrite', { path, content });
      assert.equal(write.status, 200, `write failed: ${JSON.stringify(write.data)}`);
      assert.equal(await readFile(path, 'utf-8'), content);

      const read = await callWithUrl('handleFile', path);
      assert.equal(read.status, 200, `read failed: ${JSON.stringify(read.data)}`);
      assert.equal(read.data.content, content);
    });
  }

  it('directory listing includes a non-ASCII file name', async () => {
    const sub = join(root, '日本語フォルダ');
    await mkdir(sub, { recursive: true });
    const file = join(sub, 'ファイル.txt');
    await writeFile(file, 'x', 'utf-8');

    const listing = await callWithUrl('handleDirectory', sub);
    assert.equal(listing.status, 200);
    const names = listing.data.items.map((i) => i.name);
    assert.ok(names.includes('ファイル.txt'), `names: ${JSON.stringify(names)}`);
  });

  it('rename works with a non-ASCII new name', async () => {
    const oldPath = join(root, 'rename-old.txt');
    await writeFile(oldPath, 'x', 'utf-8');

    const result = await postJson('handleRename', { path: oldPath, newName: 'リネーム.txt' });
    assert.equal(result.status, 200);
    let renamedExists = true;
    try {
      await readFile(join(root, 'リネーム.txt'), 'utf-8');
    } catch {
      renamedExists = false;
    }
    assert.ok(renamedExists, 'renamed file should exist');
  });

  it('delete works with a non-ASCII path', async () => {
    const path = join(root, '削除.txt');
    await writeFile(path, 'x', 'utf-8');

    const result = await postJson('handleDelete', { paths: [path] });
    assert.equal(result.status, 200);
    assert.equal(result.data.deleted, 1);
    assert.ok(!(await stat(path).then(() => true).catch(() => false)));
  });

  it('mkdir works with a non-ASCII name', async () => {
    const parent = join(root, 'mkdir-parent');
    await mkdir(parent, { recursive: true });

    const result = await postJson('handleMkdir', { parentPath: parent, name: '新フォルダ' });
    assert.equal(result.status, 200);
    assert.ok((await stat(result.data.path)).isDirectory());
  });

  it('move works with a non-ASCII source name', async () => {
    const src = join(root, 'move-source.txt');
    const destDir = join(root, 'move-dest');
    await writeFile(src, 'move me', 'utf-8');
    await mkdir(destDir, { recursive: true });

    const result = await postJson('handleMove', { paths: [src], destDir });
    assert.equal(result.status, 200);
    assert.equal(result.data.processed, 1);
    assert.ok((await stat(join(destDir, 'move-source.txt'))).isFile());
  });

  it('copy works with a non-ASCII source name', async () => {
    const src = join(root, 'copy-source.txt');
    const destDir = join(root, 'copy-dest');
    await writeFile(src, 'copy me', 'utf-8');
    await mkdir(destDir, { recursive: true });

    const result = await postJson('handleCopy', { paths: [src], destDir });
    assert.equal(result.status, 200);
    assert.equal(result.data.processed, 1);
    assert.ok((await stat(src)).isFile());
    assert.ok((await stat(join(destDir, 'copy-source.txt'))).isFile());
  });
});
