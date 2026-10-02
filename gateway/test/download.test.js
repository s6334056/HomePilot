import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable, Writable } from 'node:stream';
import { EventEmitter } from 'node:events';
import { pipeline } from 'node:stream/promises';

// CONFIG reads HOMEPILOT_ROOT at import time, so the environment must be set
// before handlers.js is loaded.
let handlers;
let root;

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-download-test-')));
  process.env.HOMEPILOT_ROOT = root;
  handlers = await import('../src/handlers.js');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

class MockResponse extends Writable {
  constructor() {
    super();
    this.chunks = [];
    this.statusCode = 0;
    this.headers = {};
    this.body = '';
  }
  _write(chunk, encoding, callback) {
    this.chunks.push(Buffer.from(chunk));
    callback();
  }
  _final(callback) {
    this.body = Buffer.concat(this.chunks).toString('utf-8');
    callback();
  }
  writeHead(statusCode, headers) {
    this.statusCode = statusCode;
    this.headers = headers || {};
    return this;
  }
  end(_chunk) {
    // Trigger finalisation asynchronously so callers can await.
    setImmediate(() => this.finalize());
  }
  finalize() {
    this.body = Buffer.concat(this.chunks).toString('utf-8');
    this.emit('finish');
  }
}

function createResponse() {
  return new MockResponse();
}

function createRequest() {
  return Object.assign(Readable.from([]), { headers: {} });
}

async function makeFile(name, content = 'hello') {
  const path = join(root, name);
  await mkdir(join(root, name.split('/').slice(0, -1).join('/')), { recursive: true });
  await writeFile(path, content, 'utf-8');
  return path;
}

async function downloadGet(path) {
  const url = new URL('http://localhost/api/fs/download');
  url.searchParams.set('path', path);
  const response = createResponse();
  await handlers.handleDownloadGet(createRequest(), response, url);
  await new Promise((resolve) => response.once('finish', resolve));
  return {
    status: response.statusCode,
    headers: response.headers,
    disposition: response.headers['Content-Disposition'],
  };
}

describe('buildContentDisposition', () => {
  it('is exported', () => {
    assert.equal(typeof handlers.buildContentDisposition, 'function');
  });

  it('keeps an ASCII filename as-is', () => {
    assert.equal(
      handlers.buildContentDisposition('test.txt'),
      'attachment; filename="test.txt"',
    );
  });

  it('falls back to "download" for an empty name', () => {
    assert.equal(
      handlers.buildContentDisposition(''),
      'attachment; filename="download"',
    );
  });

  it('falls back to "download" for a non-string', () => {
    assert.equal(
      handlers.buildContentDisposition(undefined),
      'attachment; filename="download"',
    );
  });

  it('escapes double quotes and backslashes in the ASCII fallback', () => {
    assert.equal(
      handlers.buildContentDisposition('a"b\\c.txt'),
      'attachment; filename="a_b_c.txt"',
    );
  });

  it('keeps the filename= value ASCII-only for a Japanese name', () => {
    const header = handlers.buildContentDisposition('テスト.txt');
    const filenamePart = header.split('; filename="')[1].split('"')[0];
    assert.ok(/^[\x00-\x7f]+$/.test(filenamePart),
      `filename= value must be ASCII-only, got: ${filenamePart}`);
  });

  it('keeps the filename= value ASCII-only for the reported case', () => {
    const header = handlers.buildContentDisposition('深呼吸の方法_ストレス対策まとめ.md');
    const filenamePart = header.split('; filename="')[1].split('"')[0];
    assert.ok(/^[\x00-\x7f]+$/.test(filenamePart),
      `filename= value must be ASCII-only, got: ${filenamePart}`);
    // 深呼吸の方法_ストレス対策まとめ.md は ASCII 以外 16 文字 → _ 16 個 + .md
    assert.equal(filenamePart, '________________.md');
  });

  it('keeps the filename= value ASCII-only for accented Latin characters', () => {
    const header = handlers.buildContentDisposition('café.txt');
    const filenamePart = header.split('; filename="')[1].split('"')[0];
    assert.ok(/^[\x00-\x7f]+$/.test(filenamePart),
      `filename= value must be ASCII-only, got: ${filenamePart}`);
  });

  it('keeps the filename= value ASCII-only for emoji', () => {
    const header = handlers.buildContentDisposition('emoji😀.txt');
    const filenamePart = header.split('; filename="')[1].split('"')[0];
    assert.ok(/^[\x00-\x7f]+$/.test(filenamePart),
      `filename= value must be ASCII-only, got: ${filenamePart}`);
  });

  it('keeps the filename= value ASCII-only for full-width spaces', () => {
    const header = handlers.buildContentDisposition('テスト ファイル.txt');
    const filenamePart = header.split('; filename="')[1].split('"')[0];
    assert.ok(/^[\x00-\x7f]+$/.test(filenamePart),
      `filename= value must be ASCII-only, got: ${filenamePart}`);
  });

  it('emits filename* for a Japanese name', () => {
    const header = handlers.buildContentDisposition('テスト.txt');
    assert.ok(header.startsWith('attachment; filename="'));
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent('テスト.txt')));
  });

  it('emits filename* for the reported case', () => {
    const header = handlers.buildContentDisposition('深呼吸の方法_ストレス対策まとめ.md');
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent('深呼吸の方法_ストレス対策まとめ.md')));
  });

  it('emits filename* for accented Latin characters', () => {
    const header = handlers.buildContentDisposition('café.txt');
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent('café.txt')));
  });

  it('emits filename* for emoji', () => {
    const header = handlers.buildContentDisposition('emoji😀.txt');
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent('emoji😀.txt')));
  });

  it('emits filename* for full-width spaces', () => {
    const header = handlers.buildContentDisposition('テスト ファイル.txt');
    assert.ok(header.includes("filename*=UTF-8''"));
    assert.ok(header.includes(encodeURIComponent('テスト ファイル.txt')));
  });

  it('does not throw for any non-ASCII name', () => {
    const names = [
      'テスト.txt',
      '深呼吸の方法_ストレス対策まとめ.md',
      'résumé.txt',
      'café.txt',
      '中文.txt',
      '한국어.txt',
      'emoji😀.txt',
      'テスト 全角スペース.txt',
    ];
    for (const name of names) {
      assert.doesNotThrow(() => handlers.buildContentDisposition(name));
    }
  });

  it('returns a header value that is entirely ASCII-safe', () => {
    const names = [
      'テスト.txt',
      '深呼吸の方法_ストレス対策まとめ.md',
      'résumé.txt',
      'café.txt',
      '中文.txt',
      '한국어.txt',
      'emoji😀.txt',
      'テスト 全角スペース.txt',
      'a"b\\c.txt',
    ];
    for (const name of names) {
      const header = handlers.buildContentDisposition(name);
      assert.ok(
        /^[\x00-\x7f]+$/.test(header),
        `Header must be ASCII-only for ${name}, got: ${header}`,
      );
    }
  });
});

describe('GET /api/fs/download (Content-Disposition)', () => {
  it('serves an ASCII file without error', async () => {
    const path = await makeFile('test.txt', 'ascii content');
    const result = await downloadGet(path);
    assert.equal(result.status, 200);
    assert.equal(result.disposition, 'attachment; filename="test.txt"');
  });

  it('serves a Japanese-named file without error', async () => {
    const path = await makeFile('テスト.txt', 'japanese content');
    const result = await downloadGet(path);
    assert.equal(result.status, 200);
    // The header must be ASCII-only (no ERR_INVALID_CHAR), and filename*
    // carries the real name for modern browsers.
    assert.ok(/^[\x00-\x7f]+$/.test(result.disposition),
      `Header must be ASCII-only, got: ${result.disposition}`);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
    assert.ok(result.disposition.includes(encodeURIComponent('テスト.txt')));
  });

  it('serves the reported case without error', async () => {
    const path = await makeFile('深呼吸の方法_ストレス対策まとめ.md', 'content');
    const result = await downloadGet(path);
    assert.equal(result.status, 200);
    assert.ok(/^[\x00-\x7f]+$/.test(result.disposition),
      `Header must be ASCII-only, got: ${result.disposition}`);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
    assert.ok(result.disposition.includes(encodeURIComponent('深呼吸の方法_ストレス対策まとめ.md')));
  });

  it('serves an accented-named file without error', async () => {
    const path = await makeFile('café.txt', 'accented');
    const result = await downloadGet(path);
    assert.equal(result.status, 200);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
  });

  it('serves an emoji-named file without error', async () => {
    const path = await makeFile('emoji😀.txt', 'emoji');
    const result = await downloadGet(path);
    assert.equal(result.status, 200);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
  });

  it('returns 400 when the path parameter is missing', async () => {
    const url = new URL('http://localhost/api/fs/download');
    const response = createResponse();
    await handlers.handleDownloadGet(createRequest(), response, url);
    assert.equal(response.statusCode, 400);
  });

  it('returns 404 for a missing file', async () => {
    const result = await downloadGet(join(root, 'no-such-file.txt'));
    assert.equal(result.status, 404);
  });
});

function createPostRequest(body) {
  return Object.assign(Readable.from([Buffer.from(body, 'utf-8')]), { headers: {} });
}

async function downloadPost(paths) {
  const response = createResponse();
  const request = createPostRequest(JSON.stringify({ paths }));
  await handlers.handleDownloadPost(request, response);
  await new Promise((resolve) => response.once('finish', resolve));
  return {
    status: response.statusCode,
    headers: response.headers,
    disposition: response.headers['Content-Disposition'],
  };
}

describe('POST /api/fs/download (Content-Disposition)', () => {
  it('serves a single Japanese-named file without error', async () => {
    const path = await makeFile('テスト.txt', 'japanese content');
    const result = await downloadPost([path]);
    assert.equal(result.status, 200);
    assert.ok(result.disposition, 'Content-Disposition header should be set');
    assert.ok(/^[\x00-\x7f]+$/.test(result.disposition),
      `Header must be ASCII-only, got: ${result.disposition}`);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
    assert.ok(result.disposition.includes(encodeURIComponent('テスト.txt')));
  });

  it('serves the reported case without error', async () => {
    const path = await makeFile('深呼吸の方法_ストレス対策まとめ.md', 'content');
    const result = await downloadPost([path]);
    assert.equal(result.status, 200);
    assert.ok(result.disposition, 'Content-Disposition header should be set');
    assert.ok(/^[\x00-\x7f]+$/.test(result.disposition),
      `Header must be ASCII-only, got: ${result.disposition}`);
    assert.ok(result.disposition.includes("filename*=UTF-8''"));
    assert.ok(result.disposition.includes(encodeURIComponent('深呼吸の方法_ストレス対策まとめ.md')));
  });

  it('returns a generic filename for multiple paths', async () => {
    const path1 = await makeFile('a.txt', 'a');
    const path2 = await makeFile('b.txt', 'b');
    const result = await downloadPost([path1, path2]);
    assert.equal(result.status, 200);
    assert.ok(result.disposition.includes('download.zip'));
  });

  it('returns 400 when the request body is missing', async () => {
    const response = createResponse();
    const request = createPostRequest('');
    await handlers.handleDownloadPost(request, response);
    assert.equal(response.statusCode, 400);
  });

  it('returns 400 for an invalid JSON body', async () => {
    const response = createResponse();
    const request = createPostRequest('{not-json');
    await handlers.handleDownloadPost(request, response);
    assert.equal(response.statusCode, 400);
  });

  it('returns 400 when paths is not an array', async () => {
    const response = createResponse();
    const request = createPostRequest(JSON.stringify({ paths: 'not-an-array' }));
    await handlers.handleDownloadPost(request, response);
    assert.equal(response.statusCode, 400);
  });

  it('returns 404 for a missing file', async () => {
    const result = await downloadPost([join(root, 'no-such-file.txt')]);
    assert.equal(result.status, 404);
  });
});