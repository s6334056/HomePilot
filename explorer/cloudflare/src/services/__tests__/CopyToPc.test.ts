import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GatewayFileSystemService } from '../GatewayFileSystemService';
import { LocalFileSystemService } from '../LocalFileSystemService';
import { FileSystemService } from '../FileSystemService';
import { copyFiles, planItemsCopy, CopyPlanItem } from '../FileSystemCopy';
import { createInitializedGatewayService } from '../FileSystemSelection';
import { COPY_TO_PC_LABEL, COPY_TO_PC_UI, withCopyIndicator } from '../CopyToDeviceUi';
import { CopyInProgressIndicator } from '../../components/CopyInProgressIndicator';

const PC_ROOT = 'C:\\hp';
const LABEL = COPY_TO_PC_UI.target;

/** Absolute path on the home PC. */
function pc(relative: string): string {
  return relative === '' ? PC_ROOT : `${PC_ROOT}\\${relative}`;
}

// ── Home PC fixture (the copy destination) ─────────────────────
//
// C:\hp
//  ├─ readme.txt        ← 同名ファイル (case 7)
//  ├─ docs/test.txt     ← 同名ディレクトリ, Local側はファイル (case 9)
//  └─ project/a.txt     ← 同名フォルダ (case 8)

interface Tree {
  [name: string]: string | Tree;
}

const PC_TREE: Tree = {
  'readme.txt': 'readme on the home PC',
  docs: { 'test.txt': 'hello from the home PC' },
  project: { 'a.txt': 'project a on the PC' },
};

interface PcEntry {
  name: string;
  type: 'file' | 'directory';
  path: string;
}

interface PcFs {
  files: Record<string, string>;
  dirs: Record<string, PcEntry[]>;
}

function sortEntries(entries: PcEntry[]): PcEntry[] {
  return [...entries].sort((a, b) =>
    a.type !== b.type ? (a.type === 'directory' ? -1 : 1) : a.name.localeCompare(b.name),
  );
}

function buildPc(tree: Tree, dirAbs: string, store: PcFs): void {
  store.dirs[dirAbs] = [];
  for (const [name, value] of Object.entries(tree)) {
    const childAbs = `${dirAbs}\\${name}`;
    if (typeof value === 'string') {
      store.files[childAbs] = value;
      store.dirs[dirAbs].push({ name, type: 'file', path: childAbs });
    } else {
      store.dirs[dirAbs].push({ name, type: 'directory', path: childAbs });
      buildPc(value, childAbs, store);
    }
  }
  store.dirs[dirAbs] = sortEntries(store.dirs[dirAbs]);
}

function snapshot(store: PcFs): string {
  return JSON.stringify({ files: store.files, dirs: store.dirs });
}

interface GatewayCall {
  method: string;
  href: string;
}

/**
 * In-memory home PC behind the real gateway endpoints: the reads plus the two
 * writes the copy needs (`POST /api/fs/file`, `POST /api/fs/mkdir`), each with
 * the same parent/exists rules as the gateway handlers.
 */
function stubGatewayFetch(store: PcFs): GatewayCall[] {
  const calls: GatewayCall[] = [];
  const respond = (body: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
  const decodePath = (href: string) => decodeURIComponent(href.split('path=')[1].split('&')[0]);
  const parentOf = (path: string) => {
    const i = path.lastIndexOf('\\');
    return i <= 0 ? '' : path.slice(0, i);
  };
  const nameOf = (path: string) => path.slice(path.lastIndexOf('\\') + 1);
  const addEntry = (parent: string, entry: PcEntry) => {
    store.dirs[parent] = sortEntries([...(store.dirs[parent] ?? []), entry]);
  };

  (globalThis as { fetch?: unknown }).fetch = async (
    url: unknown,
    init: { method?: string; body?: string } = {},
  ) => {
    const href = String(url);
    const method = init.method || 'GET';
    calls.push({ method, href });

    if (href.includes('/api/fs/root')) return respond({ path: PC_ROOT });

    if (href.includes('/api/fs/directory?path=')) {
      const path = decodePath(href);
      if (store.dirs[path]) return respond({ path, items: store.dirs[path] });
      if (Object.prototype.hasOwnProperty.call(store.files, path)) {
        return respond({ error: { message: 'The specified path is not a directory.' } }, 400);
      }
      return respond({ error: { message: 'Directory not found.' } }, 404);
    }

    if (href.includes('/api/fs/file?path=')) {
      const path = decodePath(href);
      if (Object.prototype.hasOwnProperty.call(store.files, path)) {
        return respond({ path, content: store.files[path] });
      }
      return respond({ error: { message: 'File not found.' } }, 404);
    }

    if (method === 'POST' && href.endsWith('/api/fs/file')) {
      const body = JSON.parse(init.body || '{}');
      const path: string = body.path;
      const parent = parentOf(path);
      if (!store.dirs[parent]) {
        return respond({ error: { message: 'Parent directory not found.' } }, 404);
      }
      if (!Object.prototype.hasOwnProperty.call(store.files, path)) {
        addEntry(parent, { name: nameOf(path), type: 'file', path });
      }
      store.files[path] = body.content;
      return respond({ ok: true, path });
    }

    if (method === 'POST' && href.endsWith('/api/fs/mkdir')) {
      const body = JSON.parse(init.body || '{}');
      const parent: string = body.parentPath;
      if (!store.dirs[parent]) {
        return respond({ error: { message: 'Parent directory not found.' } }, 404);
      }
      const dest = `${parent}\\${body.name}`;
      if (store.dirs[dest] || Object.prototype.hasOwnProperty.call(store.files, dest)) {
        return respond({ error: { message: 'Already exists.' } }, 409);
      }
      store.dirs[dest] = [];
      addEntry(parent, { name: body.name, type: 'directory', path: dest });
      return respond({ ok: true, path: dest });
    }

    throw new Error(`Unexpected gateway request: ${method} ${href}`);
  };

  return calls;
}

// ── This device fixture (the copy source) ─────────────────────
//
// /
//  ├─ memo.txt
//  ├─ readme.txt          ← 同名ファイル (case 7)
//  ├─ docs                ← ファイル, PC側はディレクトリ (case 9)
//  ├─ project/x.txt       ← 同名フォルダ (case 8)
//  ├─ aaa/{only.txt, bbb/deep.txt}
//  ├─ work/{a.txt, b.txt, empty/, src/{main.ts, lib/util.ts}}
//  ├─ a/test.txt
//  └─ b/test.txt

const LOCAL_DIRS = [
  'aaa',
  'aaa/bbb',
  'work',
  'work/empty',
  'work/src',
  'work/src/lib',
  'project',
  'a',
  'b',
];

const LOCAL_FILES: Array<[string, string]> = [
  ['/memo.txt', 'memo from this device'],
  ['/readme.txt', 'local readme'],
  ['/docs', 'local docs file'],
  ['/aaa/only.txt', 'aaa only'],
  ['/aaa/bbb/deep.txt', 'deep in aaa'],
  ['/work/a.txt', 'work a'],
  ['/work/b.txt', 'work b'],
  ['/work/src/main.ts', 'export const main = 1;'],
  ['/work/src/lib/util.ts', 'export const util = 2;'],
  ['/project/x.txt', 'project x'],
  ['/a/test.txt', 'test from a'],
  ['/b/test.txt', 'test from b'],
];

function useWritableLocalStorage(): void {
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
}

async function createLocalFixture(): Promise<LocalFileSystemService> {
  const service = new LocalFileSystemService();
  for (const dir of LOCAL_DIRS) {
    const idx = dir.lastIndexOf('/');
    const parent = idx < 0 ? '/' : `/${dir.slice(0, idx)}`;
    await service.createFolder(parent, dir.slice(idx + 1));
  }
  for (const [path, content] of LOCAL_FILES) {
    await service.writeFile(path, content);
  }
  return service;
}

function createPcFixture(): PcFs {
  const store: PcFs = { files: {}, dirs: {} };
  buildPc(PC_TREE, PC_ROOT, store);
  return store;
}

let local: LocalFileSystemService;
let pcStore: PcFs;
let calls: GatewayCall[];
let target: GatewayFileSystemService;
let originalFetch: unknown;
let originalLocalStorage: unknown;

beforeEach(async () => {
  originalFetch = (globalThis as { fetch?: unknown }).fetch;
  originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  useWritableLocalStorage();
  local = await createLocalFixture();
  pcStore = createPcFixture();
  calls = stubGatewayFetch(pcStore);
  target = new GatewayFileSystemService('http://127.0.0.1:51887', 'test-token');
  await target.initialize();
  expect(target.getRootPath()).toBe(PC_ROOT);
});

afterEach(() => {
  (globalThis as { fetch?: unknown }).fetch = originalFetch;
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

/** Plans `paths` against the home PC with the Step 13 wording. */
function plan(paths: string[]): Promise<CopyPlanItem[]> {
  return planItemsCopy(local, target, paths, { targetLabel: LABEL });
}

/** Runs a plan against the home PC with the Step 13 wording. */
function run(items: CopyPlanItem[]): Promise<unknown> {
  return copyFiles(local, target, items, { targetLabel: LABEL });
}

async function captureError(work: Promise<unknown>): Promise<string> {
  try {
    await work;
  } catch (e: any) {
    return e?.message || String(e);
  }
  throw new Error('expected the operation to fail, but it succeeded');
}

describe('CopyToPc: Local → PC copy planning & execution', () => {
  it('case 1: Localの単一ファイル → PC root', async () => {
    const items = await plan(['/memo.txt']);
    expect(items).toEqual([
      {
        sourcePath: '/memo.txt',
        targetPath: pc('memo.txt'),
        name: 'memo.txt',
        type: 'file',
        existing: 'none',
      },
    ]);

    await run(items);

    expect(pcStore.files[pc('memo.txt')]).toBe('memo from this device');
    expect(await target.readFile(pc('memo.txt'))).toBe('memo from this device');
  });

  it('case 2: Localの単一フォルダ → PC root', async () => {
    const items = await plan(['/aaa']);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      sourcePath: '/aaa',
      targetPath: pc('aaa'),
      name: 'aaa',
      type: 'directory',
      existing: 'none',
    });

    await run(items);

    expect(await target.getItem(pc('aaa'))).not.toBeNull();
    expect(await target.readFile(pc('aaa\\only.txt'))).toBe('aaa only');
    expect(await target.readFile(pc('aaa\\bbb\\deep.txt'))).toBe('deep in aaa');
  });

  it('case 3: フォルダ内部のネスト構造維持', async () => {
    const items = await plan(['/work']);
    await run(items);

    expect(await target.getItem(pc('work'))).not.toBeNull();
    expect(await target.getItem(pc('work\\src'))).not.toBeNull();
    expect(await target.getItem(pc('work\\src\\lib'))).not.toBeNull();
    expect(await target.readFile(pc('work\\src\\main.ts'))).toBe('export const main = 1;');
    expect(await target.readFile(pc('work\\src\\lib\\util.ts'))).toBe('export const util = 2;');
  });

  it('case 4: 空フォルダのコピー', async () => {
    const items = await plan(['/work/empty']);
    expect(items).toHaveLength(1);
    expect(items[0].targetPath).toBe(pc('empty'));

    await run(items);

    const emptyDir = await target.getItem(pc('empty'));
    expect(emptyDir).not.toBeNull();
    expect(emptyDir!.type).toBe('directory');
    const listing = await target.getDirectory(pc('empty'));
    expect(listing).toEqual([]);
  });

  it('case 5: 複数ファイルのコピー', async () => {
    const items = await plan(['/work/a.txt', '/work/b.txt']);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.targetPath)).toEqual([pc('a.txt'), pc('b.txt')]);

    await run(items);

    expect(await target.readFile(pc('a.txt'))).toBe('work a');
    expect(await target.readFile(pc('b.txt'))).toBe('work b');
  });

  it('case 6: 複数フォルダのコピー', async () => {
    const items = await plan(['/aaa', '/work']);
    expect(items).toHaveLength(2);

    await run(items);

    expect(await target.getItem(pc('aaa'))).not.toBeNull();
    expect(await target.getItem(pc('work'))).not.toBeNull();
    expect(await target.readFile(pc('aaa\\only.txt'))).toBe('aaa only');
    expect(await target.readFile(pc('work\\a.txt'))).toBe('work a');
  });

  it('case 7: 同名ファイルがPC側に存在 → 拒否', async () => {
    // readme.txt exists in PC_TREE as a file
    const items = await plan(['/readme.txt']);
    expect(items).toHaveLength(1);
    expect(items[0].existing).toBe('file');

    // As per Step 13 spec, any existing item (file or folder) at target is rejected and cannot be copied.
    // copyFiles enforces this and must not overwrite the PC-side file.
    const err = await captureError(run(items));
    expect(err).toContain(`${LABEL}に同名のファイルがあるためコピーできません: readme.txt`);

    // PC file remains unchanged
    expect(pcStore.files[pc('readme.txt')]).toBe('readme on the home PC');
  });

  it('case 8: 同名フォルダがPC側に存在 → 拒否', async () => {
    // project exists as a folder on PC
    const err = await captureError(plan(['/project']));
    expect(err).toContain(`${LABEL}に同名のフォルダがあるためコピーできません: project`);
    // PC side unchanged
    expect(pcStore.files[pc('project\\a.txt')]).toBe('project a on the PC');
  });

  it('case 9: PC側に同名ディレクトリがあり、Local側が同名ファイル → 拒否', async () => {
    // docs is a directory on PC, file on Local
    const items = await plan(['/docs']);
    expect(items).toHaveLength(1);
    expect(items[0].existing).toBe('directory');

    // As per Step 13 spec, rejected without copy
    const conflict = items.find((p) => p.existing !== 'none');
    expect(conflict).toBeDefined();
    expect(conflict!.existing).toBe('directory');
    expect(conflict!.name).toBe('docs');
  });

  it('case 10: 同一操作内でコピー先が衝突 → 拒否', async () => {
    // /a/test.txt and /b/test.txt both map to pc('test.txt')
    const err = await captureError(plan(['/a/test.txt', '/b/test.txt']));
    expect(err).toContain('同じ名前のファイルが選択されています: test.txt');
  });

  it('case 11: コピー前にエラーが判明した場合、PC側に部分的な書き込みをしない', async () => {
    const pcBefore = snapshot(pcStore);

    // conflict plan fails before any run()
    await expect(plan(['/a/test.txt', '/b/test.txt'])).rejects.toThrow();

    expect(snapshot(pcStore)).toBe(pcBefore);
    const postCalls = calls.filter((c) => c.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });

  it('case 12: Local側の元ファイル・元フォルダが変更されない', async () => {
    const items = await plan(['/memo.txt', '/work']);
    await run(items);

    // Verify Local source is unchanged
    expect(await local.readFile('/memo.txt')).toBe('memo from this device');
    expect(await local.readFile('/work/a.txt')).toBe('work a');
    expect(await local.readFile('/work/src/main.ts')).toBe('export const main = 1;');
  });

  it('case 13: コピー中インジケータが表示され、成功・失敗の両方で解除される', async () => {
    const events: string[] = [];

    // Success case
    await withCopyIndicator(
      () => events.push('show'),
      () => events.push('hide'),
      async () => {
        const items = await plan(['/memo.txt']);
        await run(items);
      },
    );
    expect(events).toEqual(['show', 'hide']);

    // Failure case
    events.length = 0;
    await expect(
      withCopyIndicator(
        () => events.push('show'),
        () => events.push('hide'),
        async () => {
          throw new Error('fail');
        },
      ),
    ).rejects.toThrow('fail');
    expect(events).toEqual(['show', 'hide']);

    // UI render test with "to-pc" message
    const html = renderToStaticMarkup(
      createElement(CopyInProgressIndicator, {
        isVisible: true,
        message: COPY_TO_PC_UI.inProgress,
      }),
    );
    expect(html).toContain(COPY_TO_PC_UI.inProgress);
    expect(COPY_TO_PC_LABEL).toBe('自宅PCへコピー');
  });

  it('case 14: createInitializedGatewayService creates ready service', async () => {
    const service: FileSystemService = await createInitializedGatewayService();
    expect(service).toBeInstanceOf(GatewayFileSystemService);
    expect((service as GatewayFileSystemService).isAvailable).toBe(true);
    expect(service.getRootPath()).toBe(PC_ROOT);
  });

  it('case 15: 同名フォルダがPC側に存在 → planItemsCopy がエラーを投げる（従来どおり拒否）', async () => {
    // project exists as a folder on PC
    const err = await captureError(plan(['/project']));
    expect(err).toContain(`${LABEL}に同名のフォルダがあるためコピーできません: project`);
    // PC side unchanged
    expect(pcStore.files[pc('project\\a.txt')]).toBe('project a on the PC');
    const postCalls = calls.filter((c) => c.method === 'POST');
    expect(postCalls).toHaveLength(0);
  });
});
