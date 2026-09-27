import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm, realpath } from 'node:fs/promises';
import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GATEWAY_ENTRY = join(HERE, '..', 'src', 'index.js');

// index.js binds a fixed port, so the test is skipped whenever something is
// already listening there (for example a Gateway the user is running).
const PORT = 51887;
const HOST = '127.0.0.1';

function portInUse() {
  return new Promise((resolve) => {
    const socket = connect(PORT, HOST);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

function request(path, token, method = 'GET', body) {
  return fetch(`http://${HOST}:${PORT}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body,
  });
}

let root;
let stateDirIsAFile;
let child;
let token;
let stderrOutput = '';

// index.js binds a fixed port, so the whole file is skipped whenever something
// is already listening there (for example a Gateway the user is running).
const PORT_BUSY = await portInUse();
const SKIP_REASON = PORT_BUSY ? 'another Gateway is already listening on the fixed port' : false;

before(async () => {
  if (PORT_BUSY) return;

  root = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-resilience-')));
  stateDirIsAFile = join(root, 'not-a-directory');

  // Make the viewer-state write fail the way the original report did, without
  // touching any file attribute: the state directory path is occupied by a
  // regular file, so mkdir is refused and writeFile cannot open its target.
  await writeFile(stateDirIsAFile, 'this is a file, not a directory', 'utf-8');

  child = spawn(process.execPath, [GATEWAY_ENTRY], {
    env: { ...process.env, HOMEPILOT_ROOT: root, HOMEPILOT_VIEWER_STATE_DIR: stateDirIsAFile },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  child.stdout.setEncoding('utf-8');
  child.stderr.setEncoding('utf-8');
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderrOutput += chunk; });
  child.on('error', () => {});

  const deadline = Date.now() + 15_000;
  while (!/^Token: (.+)$/m.test(stdout) && child.exitCode === null && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  const match = stdout.match(/^Token: (.+)$/m);
  assert.ok(
    match,
    `Gateway did not report a token.\nstdout:\n${stdout}\nstderr:\n${stderrOutput}`,
  );
  token = match[1].trim();
});

after(async () => {
  if (child && !child.killed) {
    child.kill();
  }
  if (root) {
    await rm(root, { recursive: true, force: true });
  }
});

describe('Gateway survives an unexpected handler exception', { skip: SKIP_REASON }, () => {
  it('is listening and serving health checks', async () => {
    const res = await request('/api/health', token);
    assert.equal(res.status, 200);
  });

  it('answers a failing viewer-state write with 500 instead of dying', async () => {
    const before = child.exitCode;
    assert.equal(before, null, 'Gateway process should still be running');

    const res = await request('/api/viewer-state/history', token, 'PATCH', JSON.stringify({
      path: 'C:\\hp1\\boom.txt',
      lastViewedAt: 1,
    }));

    assert.equal(res.status, 500);
    const body = await res.json();
    assert.equal(body.error.code, 'INTERNAL_ERROR');
    assert.equal(typeof body.error.message, 'string');
  });

  it('keeps serving requests after the failure', async () => {
    // The exact scenario from the report: the same request again, then a normal
    // request. Before the fix the process was already gone at this point.
    const failed = await request('/api/viewer-state/history', token, 'PATCH', JSON.stringify({
      path: 'C:\\hp1\\boom2.txt',
      lastViewedAt: 2,
    }));
    assert.equal(failed.status, 500);

    const health = await request('/api/health', token);
    assert.equal(health.status, 200);

    const listing = await request(`/api/fs/directory?path=${encodeURIComponent(root)}`, token);
    assert.equal(listing.status, 200);

    assert.equal(child.exitCode, null, 'Gateway process must still be alive');
  });

  it('still returns the existing 4xx responses rather than 500', async () => {
    const missingPath = await request('/api/viewer-state/history', token, 'PATCH', JSON.stringify({ lastViewedAt: 1 }));
    assert.equal(missingPath.status, 400);
    assert.equal((await missingPath.json()).error.code, 'INVALID_REQUEST');

    const missingDir = await request(
      `/api/fs/directory?path=${encodeURIComponent(join(root, 'no-such-directory'))}`,
      token,
    );
    assert.equal(missingDir.status, 404);
    assert.equal((await missingDir.json()).error.code, 'NOT_FOUND');

    const relative = await request('/api/fs/directory?path=relative.txt', token);
    assert.equal(relative.status, 400);
    assert.equal((await relative.json()).error.code, 'INVALID_REQUEST');

    const forbidden = await request('/api/fs/directory?path=C%3A%5CWindows', token);
    assert.equal(forbidden.status, 403);
    assert.equal((await forbidden.json()).error.code, 'FORBIDDEN');

    assert.equal(child.exitCode, null);
  });
});
