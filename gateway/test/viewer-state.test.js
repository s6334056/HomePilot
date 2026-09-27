import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, '..', 'src');
const HANDLERS_URL = new URL('../src/handlers.js', import.meta.url).href;
const CONFIG_URL = new URL('../src/config.js', import.meta.url).href;

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

// CONFIG reads the environment at import time, so the variables are set before
// handlers.js is loaded. node --test gives every test file its own process, so
// this does not disturb the other test files.
let handlers;
let config;
let root;
let stateDir;

before(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-state-test-')));
  stateDir = await realpath(await mkdtemp(join(tmpdir(), 'hpstate-')));
  process.env.HOMEPILOT_ROOT = root;
  process.env.HOMEPILOT_VIEWER_STATE_DIR = stateDir;
  config = await import('../src/config.js');
  handlers = await import('../src/handlers.js');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
  await rm(stateDir, { recursive: true, force: true });
});

async function call(handlerName, payload) {
  const { Readable } = await import('node:stream');
  const chunks = payload === undefined ? [] : [Buffer.from(payload, 'utf-8')];
  const request = Object.assign(Readable.from(chunks), { headers: {} });
  const response = createResponse();
  await handlers[handlerName](request, response);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

const patchHistory = (path, lastViewedAt) =>
  call('handleViewerStatePatchHistory', JSON.stringify({ path, lastViewedAt }));
const patchPosition = (filePath, progress, updatedAt) =>
  call('handleViewerStatePatchPosition', JSON.stringify({ filePath, progress, updatedAt }));

function isInside(parent, child) {
  return child.toLowerCase().startsWith(parent.toLowerCase() + sep);
}

// Runs a sequence of Gateway operations in a child process so that CONFIG picks
// up a different environment each time (an in-process import would be cached).
function runInChild(rootPath, stateDirPath, operations) {
  const script = `
    process.env.HOMEPILOT_ROOT = ${JSON.stringify(rootPath)};
    process.env.HOMEPILOT_VIEWER_STATE_DIR = ${JSON.stringify(stateDirPath)};
    const { Readable } = await import('node:stream');
    const handlers = await import(${JSON.stringify(HANDLERS_URL)});
    const { CONFIG } = await import(${JSON.stringify(CONFIG_URL)});
    const out = { file: CONFIG.VIEWER_STATE_FILE, dir: CONFIG.VIEWER_STATE_DIR, legacy: CONFIG.LEGACY_VIEWER_STATE_FILE, results: [] };
    const res = () => ({ statusCode: 0, headers: {}, body: '', writeHead(s, h) { this.statusCode = s; this.headers = h || {}; return this; }, end(c) { this.body = c ? String(c) : ''; } });
    for (const op of ${JSON.stringify(operations)}) {
      if (op.op === 'patchHistory') {
        const r = res();
        await handlers.handleViewerStatePatchHistory(Object.assign(Readable.from([Buffer.from(JSON.stringify({ path: op.path, lastViewedAt: op.at }))]), { headers: {} }), r);
        out.results.push({ op: op.op, status: r.statusCode, body: r.body });
      } else if (op.op === 'patchPosition') {
        const r = res();
        await handlers.handleViewerStatePatchPosition(Object.assign(Readable.from([Buffer.from(JSON.stringify({ filePath: op.path, progress: op.progress, updatedAt: op.at }))]), { headers: {} }), r);
        out.results.push({ op: op.op, status: r.statusCode, body: r.body });
      } else if (op.op === 'get') {
        const r = res();
        await handlers.handleViewerStateGet({}, r);
        out.results.push({ op: op.op, status: r.statusCode, body: r.body });
      }
    }
    process.stdout.write('\\n__RESULT__' + JSON.stringify(out));
  `;
  const raw = execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf-8' });
  const marker = raw.indexOf('__RESULT__');
  assert.notEqual(marker, -1, `child produced no result marker:\n${raw}`);
  return JSON.parse(raw.slice(marker + '__RESULT__'.length));
}

describe('ViewerState storage location', () => {
  it('stores the state outside ROOT_PATH', () => {
    assert.equal(config.CONFIG.VIEWER_STATE_FILE, join(stateDir, '.HomePilotViewerState.json'));
    assert.equal(isInside(root, config.CONFIG.VIEWER_STATE_FILE), false);
  });

  it('keeps a separate directory and remembers the legacy location', () => {
    assert.equal(config.CONFIG.VIEWER_STATE_DIR, stateDir);
    assert.notEqual(config.CONFIG.VIEWER_STATE_FILE, config.CONFIG.LEGACY_VIEWER_STATE_FILE);
    assert.equal(config.CONFIG.LEGACY_VIEWER_STATE_FILE, join(root, '.HomePilotViewerState.json'));
  });

  it('defaults to a HomePilot directory outside ROOT_PATH when no override is set', () => {
    const out = runInChild(root, '', [{ op: 'get' }]);
    const expectedDir = join(process.env.LOCALAPPDATA || process.env.HOME || '', 'HomePilot');
    // An empty override must not silently fall back to ROOT_PATH.
    assert.equal(isInside(root, out.file), false, `default state file ${out.file} must not be under ROOT_PATH`);
    assert.equal(out.dir, expectedDir);
    assert.equal(out.file, join(expectedDir, '.HomePilotViewerState.json'));
  });

  it('creates the state directory on demand', async () => {
    const nested = join(stateDir, 'nested', 'deeper');
    const out = runInChild(root, nested, [{ op: 'patchHistory', path: 'C:\\hp1\\fresh.txt', at: 1 }]);
    assert.equal(out.results[0].status, 200);
    assert.equal(out.file, join(nested, '.HomePilotViewerState.json'));
    const written = JSON.parse(await readFile(join(nested, '.HomePilotViewerState.json'), 'utf-8'));
    assert.equal(written.version, 1);
    assert.deepEqual(written.history[0], { path: 'C:\\hp1\\fresh.txt', lastViewedAt: 1 });
    await rm(join(stateDir, 'nested'), { recursive: true, force: true });
  });
});

describe('ViewerState read and write behaviour', () => {
  it('saves history and keeps the documented JSON shape', async () => {
    const result = await patchHistory('C:\\hp1\\a.txt', 1000);
    assert.equal(result.status, 200);
    assert.deepEqual(result.data, { ok: true });

    const state = JSON.parse(await readFile(config.CONFIG.VIEWER_STATE_FILE, 'utf-8'));
    assert.equal(state.version, 1);
    assert.ok(Array.isArray(state.history));
    assert.deepEqual(state.history[0], { path: 'C:\\hp1\\a.txt', lastViewedAt: 1000 });
    assert.equal(typeof state.positions, 'object');
  });

  it('persists across requests by re-reading the stored state', async () => {
    await rm(config.CONFIG.VIEWER_STATE_FILE, { force: true });

    await patchHistory('C:\\hp1\\first.txt', 1);
    await patchHistory('C:\\hp1\\second.txt', 2);

    const state = JSON.parse(await readFile(config.CONFIG.VIEWER_STATE_FILE, 'utf-8'));
    assert.deepEqual(
      state.history.map((entry) => entry.path),
      ['C:\\hp1\\second.txt', 'C:\\hp1\\first.txt'],
    );
  });

  it('saves reading positions and keeps the documented JSON shape', async () => {
    const result = await patchPosition('C:\\hp1\\a.txt', 0.42, 5000);
    assert.equal(result.status, 200);

    const state = JSON.parse(await readFile(config.CONFIG.VIEWER_STATE_FILE, 'utf-8'));
    assert.deepEqual(state.positions['C:\\hp1\\a.txt'], { progress: 0.42, updatedAt: 5000 });
  });

  it('ignores an older position update', async () => {
    await patchPosition('C:\\hp1\\a.txt', 0.9, 9000);
    await patchPosition('C:\\hp1\\a.txt', 0.1, 1000);

    const state = JSON.parse(await readFile(config.CONFIG.VIEWER_STATE_FILE, 'utf-8'));
    assert.equal(state.positions['C:\\hp1\\a.txt'].progress, 0.9);
  });

  it('keeps the existing request validation responses', async () => {
    const noBody = await call('handleViewerStatePatchHistory', undefined);
    assert.equal(noBody.status, 400);
    assert.equal(noBody.data.error.code, 'INVALID_REQUEST');

    const badJson = await call('handleViewerStatePatchHistory', '{not-json');
    assert.equal(badJson.status, 400);

    const noPath = await call('handleViewerStatePatchHistory', JSON.stringify({ lastViewedAt: 1 }));
    assert.equal(noPath.status, 400);

    const badProgress = await call(
      'handleViewerStatePatchPosition',
      JSON.stringify({ filePath: 'C:\\a.txt', progress: 5, updatedAt: 1 }),
    );
    assert.equal(badProgress.status, 400);
  });

  it('still serves the other Gateway endpoints normally', async () => {
    await writeFile(join(root, 'plain.txt'), 'hello', 'utf-8');

    const response = createResponse();
    const url = new URL('http://localhost/api/fs/directory');
    url.searchParams.set('path', root);
    await handlers.handleDirectory({}, response, url);

    assert.equal(response.statusCode, 200);
    assert.ok(JSON.parse(response.body).items.some((item) => item.name === 'plain.txt'));
  });
});

describe('Migration from the legacy state file inside ROOT_PATH', () => {
  let legacyRoot;
  let newStateDir;
  let legacyPath;
  let legacyContent;

  before(async () => {
    legacyRoot = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-legacy-')));
    newStateDir = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-newstate-')));
    legacyPath = join(legacyRoot, '.HomePilotViewerState.json');
    legacyContent = JSON.stringify({
      version: 1,
      positions: { 'C:\\hp1\\old.txt': { progress: 0.25, updatedAt: 111 } },
      history: [{ path: 'C:\\hp1\\old.txt', lastViewedAt: 222 }],
    });
    await writeFile(legacyPath, legacyContent, 'utf-8');
  });

  after(async () => {
    await rm(legacyRoot, { recursive: true, force: true });
    await rm(newStateDir, { recursive: true, force: true });
  });

  it('reads the legacy file and carries the data into the new location', async () => {
    const before = await import('node:fs/promises').then((fs) => fs.stat(legacyPath));

    const out = runInChild(legacyRoot, newStateDir, [
      { op: 'get' },
      { op: 'patchHistory', path: 'C:\\hp1\\new.txt', at: 333 },
    ]);

    // The legacy data was visible to the Gateway.
    const observed = JSON.parse(out.results[0].body);
    assert.deepEqual(observed.history, [{ path: 'C:\\hp1\\old.txt', lastViewedAt: 222 }]);
    assert.deepEqual(observed.positions['C:\\hp1\\old.txt'], { progress: 0.25, updatedAt: 111 });

    // The new location now holds the carried-over data plus the new entry.
    const migrated = JSON.parse(await readFile(join(newStateDir, '.HomePilotViewerState.json'), 'utf-8'));
    assert.deepEqual(
      migrated.history.map((entry) => entry.path),
      ['C:\\hp1\\new.txt', 'C:\\hp1\\old.txt'],
    );
    assert.deepEqual(migrated.positions['C:\\hp1\\old.txt'], { progress: 0.25, updatedAt: 111 });
    assert.equal(migrated.version, 1);

    // The legacy file is left completely alone: not rewritten, not deleted.
    const afterStat = await import('node:fs/promises').then((fs) => fs.stat(legacyPath));
    assert.equal(await readFile(legacyPath, 'utf-8'), legacyContent);
    assert.equal(afterStat.mtimeMs, before.mtimeMs);
    assert.equal(afterStat.size, before.size);
  });

  it('prefers the new location once it exists', () => {
    const out = runInChild(legacyRoot, newStateDir, [{ op: 'get' }]);
    const observed = JSON.parse(out.results[0].body);
    assert.deepEqual(
      observed.history.map((entry) => entry.path),
      ['C:\\hp1\\new.txt', 'C:\\hp1\\old.txt'],
    );
  });
});

describe('No Windows attribute manipulation was added', () => {
  it('does not reference attrib, SetFileAttributes or chmod in the Gateway sources', () => {
    for (const file of ['config.js', 'handlers.js', 'index.js', 'hiddenFiles.js']) {
      const source = readFileSync(join(SRC, file), 'utf-8');
      for (const forbidden of ['attrib ', 'SetFileAttributes', 'chmod', 'Set-ItemProperty', "attrib'", 'attrib"']) {
        assert.equal(source.includes(forbidden), false, `${file} must not contain ${forbidden}`);
      }
    }
  });
});
