import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { GatewayFileSystemService } from '../GatewayFileSystemService';
import { LocalFileSystemService } from '../LocalFileSystemService';
import { FileSystemService } from '../FileSystemService';
import {
  copyFiles,
  ensureDirectories,
  joinRootPath,
  planItemsCopy,
  relativePathWithin,
} from '../FileSystemCopy';

const STORAGE_KEY = 'homepilot.localFileSystem';
const PC_ROOT = 'C:\\hp';

// ── Source fixture ─────────────────────────────────────────────
// C:\hp
//  ├─ readme.txt / memo.txt
//  ├─ docs/test.txt
//  ├─ work/{a,b}.txt
//  ├─ memo/c.txt
//  ├─ project/            ← ケース1/3/4/5/8
//  │   ├─ a.txt / b.txt
//  │   ├─ empty/
//  │   ├─ src/{main.ts, lib/util.ts}
//  │   └─ docs/readme.md
//  ├─ aaa/{test.txt, project/only.txt, bbb/project/deep.txt}
//  └─ bbb/{test.txt, project/other.txt}

interface Tree {
  [name: string]: string | Tree;
}

const PC_TREE: Tree = {
  'readme.txt': 'readme at the root',
  'memo.txt': 'root memo',
  docs: { 'test.txt': 'hello from the home PC' },
  work: { 'a.txt': 'work a', 'b.txt': 'work b' },
  memo: { 'c.txt': 'memo c' },
  project: {
    'a.txt': 'project a',
    'b.txt': 'project b',
    empty: {},
    src: {
      'main.ts': 'export const main = 1;',
      lib: { 'util.ts': 'export const util = 2;' },
    },
    docs: { 'readme.md': '# project docs' },
  },
  aaa: {
    'test.txt': 'content from aaa',
    project: { 'only.txt': 'aaa project' },
    bbb: { project: { 'deep.txt': 'deep project' } },
  },
  bbb: {
    'test.txt': 'content from bbb',
    project: { 'other.txt': 'bbb project' },
  },
};

const PC_FILES: Record<string, string> = {};
const PC_DIRS: Record<string, Array<{ name: string; type: 'file' | 'directory'; path: string }>> = {};

function buildTree(tree: Tree, dirAbs: string): void {
  const items: Array<{ name: string; type: 'file' | 'directory'; path: string }> = [];
  for (const [name, value] of Object.entries(tree)) {
    const childAbs = `${dirAbs}\\${name}`;
    if (typeof value === 'string') {
      PC_FILES[childAbs] = value;
      items.push({ name, type: 'file', path: childAbs });
    } else {
      items.push({ name, type: 'directory', path: childAbs });
      buildTree(value, childAbs);
    }
  }
  // Same ordering the real gateway returns: folders first, then alphabetical.
  items.sort((a, b) =>
    a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name),
  );
  PC_DIRS[dirAbs] = items;
}
buildTree(PC_TREE, PC_ROOT);

const PC_FILE = 'C:\\hp\\docs\\test.txt';
const PC_FILE_AT_ROOT = 'C:\\hp\\readme.txt';
const PC_ROOT_FILE = 'C:\\hp\\memo.txt';
const PC_SAME_NAME_A = 'C:\\hp\\aaa\\test.txt';
const PC_SAME_NAME_B = 'C:\\hp\\bbb\\test.txt';
const PC_MULTI = ['C:\\hp\\work\\a.txt', 'C:\\hp\\work\\b.txt', 'C:\\hp\\memo\\c.txt'];
const PC_PROJECT = 'C:\\hp\\project';
const PC_DEEP_PROJECT = 'C:\\hp\\aaa\\bbb\\project';
const PC_AAA_PROJECT = 'C:\\hp\\aaa\\project';
const PC_BBB_PROJECT = 'C:\\hp\\bbb\\project';

interface GatewayCall {
  url: string;
  method: string;
}

function stubGatewayFetch(): GatewayCall[] {
  const calls: GatewayCall[] = [];
  const respond = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const decodePath = (href: string) => decodeURIComponent(href.split('path=')[1].split('&')[0]);

  (globalThis as { fetch?: unknown }).fetch = async (url: unknown, init?: { method?: string }) => {
    const href = String(url);
    const method = init?.method || 'GET';
    calls.push({ url: href, method });

    if (href.includes('/api/fs/root')) return respond({ path: PC_ROOT });

    if (href.includes('/api/fs/directory?path=')) {
      const path = decodePath(href);
      if (PC_DIRS[path]) return respond({ path, items: PC_DIRS[path] });
      if (Object.prototype.hasOwnProperty.call(PC_FILES, path)) {
        return respond({ error: { message: 'The specified path is not a directory.' } }, 400);
      }
      return respond({ error: { message: 'Directory not found.' } }, 404);
    }

    if (href.includes('/api/fs/file?path=')) {
      const path = decodePath(href);
      if (Object.prototype.hasOwnProperty.call(PC_FILES, path)) {
        return respond({ content: PC_FILES[path] });
      }
      return respond({ error: { message: `not found: ${path}` } }, 404);
    }

    throw new Error(`Unexpected gateway request: ${method} ${href}`);
  };

  return calls;
}

function useWritableLocalStorage(): Map<string, string> {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
  return store;
}

/** Storage that accepts `successfulWrites` saves and then reports a quota error. */
function useFailingLocalStorageAfter(successfulWrites: number): void {
  const store = new Map<string, string>();
  let writes = 0;
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      if (writes >= successfulWrites) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      writes++;
      store.set(key, String(value));
    },
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

type MaybeFetch = typeof globalThis.fetch;

let store: Map<string, string>;
let calls: GatewayCall[];
let originalFetch: MaybeFetch | undefined;
let originalLocalStorage: unknown;

async function createGateway(): Promise<GatewayFileSystemService> {
  const gateway = new GatewayFileSystemService('http://pc.local:51887', 'token');
  await gateway.initialize();
  return gateway;
}

async function localNames(local: LocalFileSystemService, dir = '/'): Promise<string[]> {
  return (await local.getDirectory(dir)).map((i) => `${i.type === 'directory' ? '/' : ''}${i.name}`);
}

async function captureError(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e: any) {
    return e?.message || String(e);
  }
  return '';
}

beforeEach(() => {
  originalFetch = globalThis.fetch;
  originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  store = useWritableLocalStorage();
  calls = stubGatewayFetch();
});

afterEach(() => {
  (globalThis as { fetch?: MaybeFetch }).fetch = originalFetch;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

describe('relativePathWithin / joinRootPath', () => {
  it('expresses a path inside a Windows root as "/" separated relative segments', () => {
    expect(relativePathWithin(PC_ROOT, PC_FILE)).toBe('docs/test.txt');
    expect(relativePathWithin('C:\\hp', 'c:\\HP\\docs\\test.txt')).toBe('docs/test.txt');
  });

  it('expresses a path inside a unix root', () => {
    expect(relativePathWithin('/home/user', '/home/user/a.txt')).toBe('a.txt');
  });

  it('treats "/" as the very top', () => {
    expect(relativePathWithin('/', '/docs/a.txt')).toBe('docs/a.txt');
    expect(relativePathWithin('/', '/')).toBeNull();
  });

  it('returns null for the root itself and for paths outside the root', () => {
    expect(relativePathWithin(PC_ROOT, PC_ROOT)).toBeNull();
    expect(relativePathWithin(PC_ROOT, 'D:\\other\\a.txt')).toBeNull();
    expect(relativePathWithin(PC_ROOT, 'C:\\hp2\\a.txt')).toBeNull();
    expect(relativePathWithin('', 'C:\\hp\\a.txt')).toBeNull();
  });

  it('joins a relative path onto the target root', () => {
    expect(joinRootPath('/', 'test.txt')).toBe('/test.txt');
    expect(joinRootPath('/', 'docs/test.txt')).toBe('/docs/test.txt');
    expect(joinRootPath('C:\\hp', 'docs/test.txt')).toBe('C:\\hp\\docs\\test.txt');
    expect(joinRootPath('/home/user', 'a.txt')).toBe('/home/user/a.txt');
  });
});

describe('ensureDirectories', () => {
  it('creates every missing folder on the way down', async () => {
    const local = new LocalFileSystemService();

    await ensureDirectories(local, '/docs/notes/2026');

    expect((await local.getItem('/docs'))!.type).toBe('directory');
    expect((await local.getItem('/docs/notes'))!.type).toBe('directory');
    expect((await local.getItem('/docs/notes/2026'))!.type).toBe('directory');
  });

  it('leaves existing folders alone and is a no-op at the root', async () => {
    const local = new LocalFileSystemService();
    await local.createFolder('/', 'docs');

    await ensureDirectories(local, '/docs');
    await ensureDirectories(local, '/');

    expect(await localNames(local)).toEqual(['/docs']);
  });

  it('refuses to continue when a file blocks a folder', async () => {
    const local = new LocalFileSystemService();
    await local.writeFile('/docs', 'i am a file');

    await expect(ensureDirectories(local, '/docs/notes')).rejects.toThrow(
      'A file already exists where a folder is needed',
    );
  });
});

describe('planItemsCopy: file name only decides the target', () => {
  it('case 1 - places a deeply nested file directly in the target root', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const plan = await planItemsCopy(gateway, local, [PC_FILE]);

    expect(plan).toEqual([
      {
        sourcePath: PC_FILE,
        targetPath: '/test.txt',
        name: 'test.txt',
        type: 'file',
        existing: 'none',
      },
    ]);
  });

  it('case 3 - flattens files from different folders into the root', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const plan = await planItemsCopy(gateway, local, PC_MULTI);

    expect(plan.map((p) => p.targetPath)).toEqual(['/a.txt', '/b.txt', '/c.txt']);
    expect(plan.map((p) => p.sourcePath)).toEqual(PC_MULTI);
    expect(plan.every((p) => p.existing === 'none')).toBe(true);
  });

  it('case 2 - rejects two selected files that would land on the same target path', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await expect(planItemsCopy(gateway, local, [PC_SAME_NAME_A, PC_SAME_NAME_B])).rejects.toThrow(
      '同じ名前のファイルが選択されています',
    );
    expect(await local.getItem('/test.txt')).toBeNull();
  });

  it('case 5 - reports an existing file at the target path', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    await local.writeFile('/test.txt', 'old');

    const [item] = await planItemsCopy(gateway, local, [PC_FILE]);

    expect(item.targetPath).toBe('/test.txt');
    expect(item.existing).toBe('file');
  });

  it('reports a folder occupying the target path', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    await local.createFolder('/', 'test.txt');

    const [item] = await planItemsCopy(gateway, local, [PC_FILE]);

    expect(item.existing).toBe('directory');
  });

  it('rejects a source path that is not inside the source root', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await expect(planItemsCopy(gateway, local, ['D:\\elsewhere\\a.txt'])).rejects.toThrow(
      'コピー元の位置を決められません',
    );
  });

  it('rejects the source root itself', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await expect(planItemsCopy(gateway, local, [PC_ROOT])).rejects.toThrow(
      'コピー元の位置を決められません',
    );
  });

  it('rejects a source path that no longer exists', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await expect(planItemsCopy(gateway, local, ['C:\\hp\\missing.txt'])).rejects.toThrow(
      'コピー元が見つかりません',
    );
  });
});

describe('planItemsCopy: folders', () => {
  it('places the folder itself in the target root and maps its contents below it', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const [item] = await planItemsCopy(gateway, local, [PC_PROJECT]);

    expect(item).toMatchObject({
      sourcePath: PC_PROJECT,
      targetPath: '/project',
      name: 'project',
      type: 'directory',
      existing: 'none',
    });
    expect(item.contents!.folders.map((f) => f.targetPath)).toEqual([
      '/project',
      '/project/docs',
      '/project/empty',
      '/project/src',
      '/project/src/lib',
    ]);
    expect(item.contents!.files.map((f) => f.targetPath).sort()).toEqual([
      '/project/a.txt',
      '/project/b.txt',
      '/project/docs/readme.md',
      '/project/src/lib/util.ts',
      '/project/src/main.ts',
    ]);
    // parent always before child
    const folderPaths = item.contents!.folders.map((f) => f.targetPath);
    expect(folderPaths.indexOf('/project/src/lib')).toBeGreaterThan(
      folderPaths.indexOf('/project/src'),
    );
  });

  it('case 2 - a deeply nested folder keeps its own name and drops the source path', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const [item] = await planItemsCopy(gateway, local, [PC_DEEP_PROJECT]);

    expect(item.targetPath).toBe('/project');
    expect(item.contents!.files.map((f) => f.targetPath)).toEqual(['/project/deep.txt']);
    expect(item.contents!.files[0].sourcePath).toBe('C:\\hp\\aaa\\bbb\\project\\deep.txt');
  });

  it('case 6 - refuses when this device already holds that name', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    await local.createFolder('/', 'project');
    await local.writeFile('/project/keep.txt', 'keep me');

    await expect(planItemsCopy(gateway, local, [PC_PROJECT])).rejects.toThrow(
      'アプリに同名のフォルダがあるためコピーできません: project',
    );
    expect(await local.readFile('/project/keep.txt')).toBe('keep me');
  });

  it('refuses when this device holds a file where the folder would go', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    await local.writeFile('/project', 'i am a file');

    await expect(planItemsCopy(gateway, local, [PC_PROJECT])).rejects.toThrow(
      'アプリに同名のファイルがあるためコピーできません: project',
    );
  });

  it('case 7 - rejects two selected folders that would land on the same target path', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await expect(
      planItemsCopy(gateway, local, [PC_AAA_PROJECT, PC_BBB_PROJECT]),
    ).rejects.toThrow('同じ名前のフォルダが選択されています: project');
    expect(await local.getItem('/project')).toBeNull();
  });

  it('copies a selected folder only once when one of its descendants is selected too', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const plan = await planItemsCopy(gateway, local, [
      PC_PROJECT,
      `${PC_PROJECT}\\src`,
      `${PC_PROJECT}\\src\\main.ts`,
    ]);

    expect(plan).toHaveLength(1);
    expect(plan[0].sourcePath).toBe(PC_PROJECT);

    await copyFiles(gateway, local, plan);
    expect(await local.getItem('/src')).toBeNull();
    expect(await local.getItem('/main.ts')).toBeNull();
    expect((await local.getItem('/project/src'))!.type).toBe('directory');
    expect(await local.readFile('/project/src/main.ts')).toBe('export const main = 1;');
  });

  it('plans a file and a folder with different names side by side', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const plan = await planItemsCopy(gateway, local, [PC_PROJECT, PC_ROOT_FILE]);

    expect(plan.map((p) => [p.type, p.targetPath])).toEqual([
      ['directory', '/project'],
      ['file', '/memo.txt'],
    ]);
  });
});

describe('copyFiles: file → this device', () => {
  it('reads the file from the home PC', async () => {
    const gateway = await createGateway();

    expect(await gateway.readFile(PC_FILE)).toBe(PC_FILES[PC_FILE]);
  });

  it('case 1 - stores the content at the target root and reads it back', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const plan = await planItemsCopy(gateway, local, [PC_FILE]);
    const results = await copyFiles(gateway, local, plan);

    expect(results).toEqual([{ sourcePath: PC_FILE, targetPath: '/test.txt' }]);
    expect(store.get(STORAGE_KEY)).toContain(PC_FILES[PC_FILE]);

    const reopened = new LocalFileSystemService();
    expect(await reopened.readFile('/test.txt')).toBe(PC_FILES[PC_FILE]);
  });

  it('case 3 - writes every selected file straight into the root', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, PC_MULTI));

    expect(await local.readFile('/a.txt')).toBe(PC_FILES[PC_MULTI[0]]);
    expect(await local.readFile('/b.txt')).toBe(PC_FILES[PC_MULTI[1]]);
    expect(await local.readFile('/c.txt')).toBe(PC_FILES[PC_MULTI[2]]);

    // The source folder structure must not appear on this device.
    expect(await local.getItem('/work')).toBeNull();
    expect(await local.getItem('/memo')).toBeNull();
    expect(await local.getItem('/docs')).toBeNull();
  });

  it('case 2 - a second copy of the same name is reported via existing field and rejected by copyFiles', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_SAME_NAME_A]));
    expect(await local.readFile('/test.txt')).toBe(PC_FILES[PC_SAME_NAME_A]);

    const second = await planItemsCopy(gateway, local, [PC_SAME_NAME_B]);
    expect(second).toEqual([
      {
        sourcePath: PC_SAME_NAME_B,
        targetPath: '/test.txt',
        name: 'test.txt',
        type: 'file',
        existing: 'file',
      },
    ]);

    // copyFiles rejects existing-file items: the original file must be unchanged.
    const message = await captureError(async () => {
      await copyFiles(gateway, local, second);
    });
    expect(message).toContain('アプリに同名のファイルがあるためコピーできません: test.txt');
    expect(await local.readFile('/test.txt')).toBe(PC_FILES[PC_SAME_NAME_A]);
  });

  it('case 8 - leaves the home PC file untouched', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_FILE, PC_FILE_AT_ROOT]));

    expect(await gateway.readFile(PC_FILE)).toBe(PC_FILES[PC_FILE]);
    expect(await gateway.readFile(PC_FILE_AT_ROOT)).toBe(PC_FILES[PC_FILE_AT_ROOT]);
    expect(calls.map((c) => c.method)).not.toContain('POST');
    expect(calls.map((c) => c.method)).not.toContain('DELETE');
  });

  it('produces an ordinary local file with usable metadata', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_FILE, PC_FILE_AT_ROOT]));

    const item = await local.getItem('/test.txt');
    expect(item).toMatchObject({
      id: '/test.txt',
      name: 'test.txt',
      type: 'file',
      path: '/test.txt',
      mimeType: 'text/plain',
      size: PC_FILES[PC_FILE].length,
    });
    expect(item!.modifiedAt).toBeTruthy();

    const itemAtRoot = await local.getItem('/readme.txt');
    expect(itemAtRoot).toMatchObject({ name: 'readme.txt', type: 'file', mimeType: 'text/plain' });
  });

  it('propagates a localStorage failure to the caller', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    const plan = await planItemsCopy(gateway, local, [PC_FILE_AT_ROOT]);

    useFailingLocalStorageAfter(0);

    await expect(copyFiles(gateway, local, plan)).rejects.toThrow('Local storage save failed');
    expect(await gateway.readFile(PC_FILE_AT_ROOT)).toBe(PC_FILES[PC_FILE_AT_ROOT]);
  });
});

describe('copyFiles: folder → this device', () => {
  it('case 1 - copies a simple folder with its files', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const results = await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));

    expect(results).toEqual([{ sourcePath: PC_PROJECT, targetPath: '/project' }]);
    expect((await local.getItem('/project'))!.type).toBe('directory');
    expect(await local.readFile('/project/a.txt')).toBe('project a');
    expect(await local.readFile('/project/b.txt')).toBe('project b');
  });

  it('case 2 - drops /aaa/bbb and keeps only the folder itself', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_DEEP_PROJECT]));

    expect(await local.readFile('/project/deep.txt')).toBe('deep project');
    expect(await local.getItem('/aaa')).toBeNull();
    expect(await local.getItem('/bbb')).toBeNull();
    expect(await local.getItem('/aaa/bbb/project')).toBeNull();
    expect(await localNames(local)).toEqual(['/project']);
  });

  it('case 3 - keeps the nested structure intact', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));

    expect((await local.getItem('/project/src'))!.type).toBe('directory');
    expect((await local.getItem('/project/src/lib'))!.type).toBe('directory');
    expect((await local.getItem('/project/docs'))!.type).toBe('directory');

    expect(await local.readFile('/project/src/main.ts')).toBe('export const main = 1;');
    expect(await local.readFile('/project/src/lib/util.ts')).toBe('export const util = 2;');
    expect(await local.readFile('/project/docs/readme.md')).toBe('# project docs');
  });

  it('case 4 - copies empty folders too', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));

    const empty = await local.getItem('/project/empty');
    expect(empty).toMatchObject({ type: 'directory', name: 'empty', path: '/project/empty' });
    expect(await local.getDirectory('/project/empty')).toEqual([]);
  });

  it('case 5 - copies a folder and a file side by side', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(
      gateway,
      local,
      await planItemsCopy(gateway, local, [PC_PROJECT, PC_ROOT_FILE]),
    );

    expect((await local.getItem('/project'))!.type).toBe('directory');
    expect(await local.readFile('/memo.txt')).toBe(PC_FILES[PC_ROOT_FILE]);
    expect(await localNames(local)).toEqual(['/project', 'memo.txt']);
  });

  it('case 6 - does not overwrite an existing folder on this device', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    await local.createFolder('/', 'project');
    await local.writeFile('/project/keep.txt', 'keep me');

    const message = await captureError(async () => {
      await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));
    });

    expect(message).toContain('アプリに同名のフォルダがあるためコピーできません: project');
    expect(await localNames(local, '/project')).toEqual(['keep.txt']);
    expect(await local.readFile('/project/keep.txt')).toBe('keep me');
    expect(await local.getItem('/project/a.txt')).toBeNull();
  });

  it('case 7 - never overwrites one selected folder with another', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    const message = await captureError(async () => {
      await copyFiles(
        gateway,
        local,
        await planItemsCopy(gateway, local, [PC_AAA_PROJECT, PC_BBB_PROJECT]),
      );
    });

    expect(message).toContain('同じ名前のフォルダが選択されています');
    expect(await local.getItem('/project')).toBeNull();
    expect(await localNames(local)).toEqual([]);
  });

  it('case 8 - leaves the home PC folder untouched', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));

    const sourceChildren = await gateway.getDirectory(PC_PROJECT);
    expect(sourceChildren.map((i) => i.name).sort()).toEqual(['a.txt', 'b.txt', 'docs', 'empty', 'src']);
    expect(await gateway.readFile('C:\\hp\\project\\src\\lib\\util.ts')).toBe('export const util = 2;');
    expect(await gateway.getDirectory(`${PC_PROJECT}\\empty`)).toEqual([]);
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('case 9 - reports a mid-way storage failure instead of swallowing it', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    const plan = await planItemsCopy(gateway, local, [PC_PROJECT]);

    // The folders are created first, so this fails while the files are written.
    useFailingLocalStorageAfter(6);

    await expect(copyFiles(gateway, local, plan)).rejects.toThrow('Local storage save failed');

    // No rollback — but the home PC side is untouched and the error reached the caller.
    expect((await local.getItem('/project'))!.type).toBe('directory');
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
    expect(await gateway.getDirectory(PC_PROJECT)).toHaveLength(5);
  });

  it('produces ordinary local folders and files', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();

    await copyFiles(gateway, local, await planItemsCopy(gateway, local, [PC_PROJECT]));

    const folder = await local.getItem('/project');
    expect(folder).toMatchObject({
      id: '/project',
      name: 'project',
      type: 'directory',
      path: '/project',
    });
    expect(folder!.modifiedAt).toBeTruthy();

    const file = await local.getItem('/project/docs/readme.md');
    expect(file).toMatchObject({
      id: '/project/docs/readme.md',
      name: 'readme.md',
      type: 'file',
      path: '/project/docs/readme.md',
      mimeType: 'text/markdown',
      size: PC_FILES['C:\\hp\\project\\docs\\readme.md'].length,
    });

    // Everything survives a reload of the device file system.
    const reopened = new LocalFileSystemService();
    expect(await reopened.readFile('/project/src/lib/util.ts')).toBe('export const util = 2;');
  });
});

describe('copyFiles keeps the two services independent', () => {
  it('only ever reads from the source and writes to the target', async () => {
    const gateway = await createGateway();
    const local = new LocalFileSystemService();
    const source: FileSystemService = gateway;
    const target: FileSystemService = local;

    await copyFiles(source, target, await planItemsCopy(source, target, [PC_FILE, PC_PROJECT]));

    expect(await target.readFile('/test.txt')).toBe(PC_FILES[PC_FILE]);
    expect(await target.readFile('/project/a.txt')).toBe('project a');
    expect(await source.getItem(PC_FILE)).not.toBeNull();
    expect(await source.getItem(PC_PROJECT)).not.toBeNull();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });
});
