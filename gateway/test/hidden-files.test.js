import { test, before, after, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, utimes, rm, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';

const isWindows = process.platform === 'win32';

// CONFIG reads HOMEPILOT_ROOT at import time, so the environment must be set
// before handlers.js is loaded. node --test runs every test file in its own
// process, so this does not collide with the other test files.
let handlers;
let hiddenFiles;
let root;

before(async () => {
  // realpath so the root matches what pathValidator.js derives internally.
  root = await realpath(await mkdtemp(join(tmpdir(), 'homepilot-hidden-test-')));
  process.env.HOMEPILOT_ROOT = root;
  handlers = await import('../src/handlers.js');
  hiddenFiles = await import('../src/hiddenFiles.js');
});

after(async () => {
  await rm(root, { recursive: true, force: true });
});

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

async function getDirectory(path, sort) {
  const url = new URL('http://localhost/api/fs/directory');
  url.searchParams.set('path', path);
  if (sort) {
    url.searchParams.set('sort', sort);
  }
  const response = createResponse();
  await handlers.handleDirectory({}, response, url);
  return {
    status: response.statusCode,
    data: response.body ? JSON.parse(response.body) : null,
  };
}

async function makeEntry(relativePath, content = 'x') {
  const entryPath = join(root, relativePath);
  await mkdir(dirname(entryPath), { recursive: true });
  await writeFile(entryPath, content, 'utf-8');
  return entryPath;
}

function setHidden(entryPath) {
  execFileSync('attrib', ['+h', entryPath], { stdio: 'ignore' });
}

function names(result) {
  return result.data.items.map((item) => item.name);
}

describe('stripExtendedPathPrefix', () => {
  it('strips the extended prefix from drive-letter paths', () => {
    assert.equal(hiddenFiles.stripExtendedPathPrefix('\\\\?\\C:\\hp1\\a.txt'), 'C:\\hp1\\a.txt');
  });

  it('restores a plain UNC share from an extended UNC path', () => {
    assert.equal(
      hiddenFiles.stripExtendedPathPrefix('\\\\?\\UNC\\server\\share\\a.txt'),
      '\\\\server\\share\\a.txt',
    );
  });

  it('leaves a plain UNC share untouched', () => {
    assert.equal(
      hiddenFiles.stripExtendedPathPrefix('\\\\server\\share\\a.txt'),
      '\\\\server\\share\\a.txt',
    );
  });

  it('leaves ordinary paths untouched', () => {
    assert.equal(hiddenFiles.stripExtendedPathPrefix('C:\\hp1\\a.txt'), 'C:\\hp1\\a.txt');
  });

  it('leaves extended volume paths untouched', () => {
    assert.equal(
      hiddenFiles.stripExtendedPathPrefix('\\\\?\\Volume{00000000-0000-0000-0000-000000000000}\\a.txt'),
      '\\\\?\\Volume{00000000-0000-0000-0000-000000000000}\\a.txt',
    );
  });
});

describe('getHiddenEntryPaths', { skip: isWindows ? false : 'requires Windows' }, () => {
  it('returns an empty set for a directory without hidden entries', async () => {
    const dir = await makeEntry('no-hidden/inside.txt');
    const parent = dirname(dir);

    const hidden = await hiddenFiles.getHiddenEntryPaths(parent);
    assert.equal(hidden.size, 0);
  });

  it('returns lower-cased full paths of hidden entries', async () => {
    const hiddenFile = await makeEntry('probe/hidden.txt');
    setHidden(hiddenFile);

    const hidden = await hiddenFiles.getHiddenEntryPaths(join(root, 'probe'));
    assert.equal(hidden.size, 1);
    assert.ok(hidden.has(hiddenFile.toLowerCase()));
  });

  it('returns an empty set when the probe cannot run (fail-open)', async () => {
    const previous = process.env.HOMEPILOT_POWERSHELL_BIN;
    process.env.HOMEPILOT_POWERSHELL_BIN = 'homepilot-no-such-powershell-binary';
    try {
      const hidden = await hiddenFiles.getHiddenEntryPaths(root);
      assert.equal(hidden.size, 0);
    } finally {
      if (previous === undefined) {
        delete process.env.HOMEPILOT_POWERSHELL_BIN;
      } else {
        process.env.HOMEPILOT_POWERSHELL_BIN = previous;
      }
    }
  });
});

describe('GET /api/fs/directory (hidden filtering)', { skip: isWindows ? false : 'requires Windows' }, () => {
  it('excludes a hidden file and keeps a normal file', async () => {
    await makeEntry('filter-basic/visible.txt');
    setHidden(await makeEntry('filter-basic/hidden.txt'));

    const result = await getDirectory(join(root, 'filter-basic'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['visible.txt']);
  });

  it('excludes a hidden folder and keeps a normal folder', async () => {
    await makeEntry('filter-folder/visible-folder/inside.txt');
    await makeEntry('filter-folder/hidden-folder/inside.txt');
    setHidden(join(root, 'filter-folder', 'hidden-folder'));

    const result = await getDirectory(join(root, 'filter-folder'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['visible-folder']);
    assert.deepEqual(
      result.data.items.map((item) => item.type),
      ['directory'],
    );
  });

  it('keeps a dot-prefixed file that is not hidden', async () => {
    await makeEntry('dot-file/.HomePilotViewerState.json', '{}');

    const result = await getDirectory(join(root, 'dot-file'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['.HomePilotViewerState.json']);
  });

  it('hides a dot-prefixed file once the hidden attribute is set', async () => {
    const stateFile = await makeEntry('dot-file-hidden/.HomePilotViewerState.json', '{}');
    setHidden(stateFile);

    const result = await getDirectory(join(root, 'dot-file-hidden'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), []);
  });

  it('makes the content of a hidden folder unreachable through the listing', async () => {
    await makeEntry('hidden-parent/visible-child.txt');
    setHidden(join(root, 'hidden-parent'));

    const parent = await getDirectory(root);
    const parentNames = names(parent);
    assert.ok(!parentNames.includes('hidden-parent'));

    const direct = await getDirectory(join(root, 'hidden-parent'));
    assert.equal(direct.status, 200);
    assert.deepEqual(names(direct), ['visible-child.txt']);
  });

  it('handles Japanese file and folder names', async () => {
    await makeEntry('日本語/可視フォルダ.txt');
    setHidden(await makeEntry('日本語/不可視フォルダ.txt', 'テスト'));

    const result = await getDirectory(join(root, '日本語'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['可視フォルダ.txt']);
  });

  it('handles spaces, quotes and PowerShell metacharacters in path names', async () => {
    const dirName = "O'Brien & Sons (_docs) $t";
    await makeEntry(`${dirName}/visible one.txt`);
    setHidden(await makeEntry(`${dirName}/hidden one.txt`));

    const result = await getDirectory(join(root, dirName));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['visible one.txt']);
  });

  it('does not execute commands embedded in a directory name', async () => {
    // If the path were concatenated into a PowerShell -Command string, the
    // New-Item below would run and create the marker file. The path is handed
    // over through the environment instead, so nothing is executed.
    // The payload uses neither "\" nor '"' because Windows rejects both in a
    // file name, and it writes to a relative path so it does not need a
    // directory separator.
    const markerName = 'INJECTION_MARKER.txt';
    const marker = join(process.cwd(), markerName);
    const evilDir = `pwn'; New-Item -ItemType File -Name ${markerName}; #`;

    try {
      await makeEntry(`${evilDir}/visible.txt`);
      setHidden(await makeEntry(`${evilDir}/hidden.txt`));

      const result = await getDirectory(join(root, evilDir));

      assert.equal(result.status, 200);
      assert.equal(existsSync(marker), false, 'injected PowerShell command must not run');
      // The probe still resolved the real directory, so filtering still works.
      assert.deepEqual(names(result), ['visible.txt']);
    } finally {
      // Only reached if a regression actually ran the injected command.
      await rm(marker, { force: true });
    }
  });

  it('returns the full listing when the hidden probe fails (fail-open)', async () => {
    await makeEntry('fail-open/visible.txt');
    setHidden(await makeEntry('fail-open/hidden.txt'));

    const previous = process.env.HOMEPILOT_POWERSHELL_BIN;
    process.env.HOMEPILOT_POWERSHELL_BIN = 'homepilot-no-such-powershell-binary';
    try {
      const result = await getDirectory(join(root, 'fail-open'));

      assert.equal(result.status, 200);
      assert.deepEqual(names(result), ['hidden.txt', 'visible.txt']);
    } finally {
      if (previous === undefined) {
        delete process.env.HOMEPILOT_POWERSHELL_BIN;
      } else {
        process.env.HOMEPILOT_POWERSHELL_BIN = previous;
      }
    }
  });

  it('keeps the response shape and the existing item keys unchanged', async () => {
    await makeEntry('shape/visible.txt');

    const result = await getDirectory(join(root, 'shape'));

    assert.equal(result.status, 200);
    assert.deepEqual(Object.keys(result.data).sort(), ['items', 'path']);
    assert.equal(result.data.path, join(root, 'shape'));
    assert.deepEqual(
      Object.keys(result.data.items[0]).sort(),
      ['modifiedAt', 'name', 'path', 'size', 'type'],
    );
  });

  it('keeps the default sort: folders first, then by name', async () => {
    await makeEntry('sorting/b-folder/inside.txt');
    await makeEntry('sorting/a-folder/inside.txt');
    await makeEntry('sorting/b-file.txt');
    await makeEntry('sorting/a-file.txt');

    const result = await getDirectory(join(root, 'sorting'));

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['a-folder', 'b-folder', 'a-file.txt', 'b-file.txt']);
  });

  it('keeps the modified sort order', async () => {
    const oldest = await makeEntry('sorting-modified/oldest.txt');
    const middle = await makeEntry('sorting-modified/middle.txt');
    const newest = await makeEntry('sorting-modified/newest.txt');

    await utimes(oldest, new Date('2024-01-01T00:00:00Z'), new Date('2024-01-01T00:00:00Z'));
    await utimes(middle, new Date('2024-06-01T00:00:00Z'), new Date('2024-06-01T00:00:00Z'));
    await utimes(newest, new Date('2025-01-01T00:00:00Z'), new Date('2025-01-01T00:00:00Z'));

    const result = await getDirectory(join(root, 'sorting-modified'), 'modified');

    assert.equal(result.status, 200);
    assert.deepEqual(names(result), ['newest.txt', 'middle.txt', 'oldest.txt']);
  });
});

describe('GET /api/fs/directory (existing error handling)', () => {
  it('returns 404 for a directory that does not exist', async () => {
    const result = await getDirectory(join(root, 'does-not-exist'));

    assert.equal(result.status, 404);
    assert.equal(result.data.error.code, 'NOT_FOUND');
  });

  it('returns 403 for a path outside the root', async () => {
    const result = await getDirectory(resolve(root, '..', 'outside'));

    assert.equal(result.status, 403);
    assert.equal(result.data.error.code, 'FORBIDDEN');
  });

  it('returns 400 when the path is not a directory', async () => {
    const file = await makeEntry('not-a-directory.txt');

    const result = await getDirectory(file);

    assert.equal(result.status, 400);
    assert.equal(result.data.error.code, 'INVALID_REQUEST');
  });

  it('returns 400 when the path parameter is missing', async () => {
    const response = createResponse();
    const url = new URL('http://localhost/api/fs/directory');
    await handlers.handleDirectory({}, response, url);

    assert.equal(response.statusCode, 400);
    assert.equal(JSON.parse(response.body).error.code, 'INVALID_REQUEST');
  });
});
