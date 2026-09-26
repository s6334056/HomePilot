import { describe, it, expect, beforeEach } from 'vitest';
import { LocalFileSystemService } from '../LocalFileSystemService';

const STORAGE_KEY = 'homepilot.localFileSystem';

function createLocalStorageStub(store: Map<string, string>) {
  return {
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

function useLocalStorage(store: Map<string, string>): void {
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub(store);
}

function useFullLocalStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => `${key}=full`,
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

let store: Map<string, string>;
let service: LocalFileSystemService;

beforeEach(() => {
  store = new Map<string, string>();
  useLocalStorage(store);
  service = new LocalFileSystemService();
});

describe('LocalFileSystemService writeFile / readFile', () => {
  it('writes a new file and reads it back', async () => {
    await service.writeFile('/memo.txt', 'こんにちは世界');

    expect(await service.readFile('/memo.txt')).toBe('こんにちは世界');
  });

  it('overwrites an existing file', async () => {
    await service.writeFile('/memo.txt', 'v1');
    await service.writeFile('/memo.txt', 'v2');

    expect(await service.readFile('/memo.txt')).toBe('v2');
    expect((await service.getDirectory('/')).map((i) => i.name)).toEqual(['memo.txt']);
  });

  it('creates an empty file with writeFile(path, "")', async () => {
    await service.writeFile('/empty.txt', '');

    const item = await service.getItem('/empty.txt');
    expect(item).not.toBeNull();
    expect(item!.type).toBe('file');
    expect(await service.readFile('/empty.txt')).toBe('');
  });

  it('rejects a write into a missing parent directory', async () => {
    await expect(service.writeFile('/missing/file.txt', 'x')).rejects.toThrow(
      'Parent directory not found',
    );
  });

  it('rejects a write onto a directory', async () => {
    await service.createFolder('/', 'docs');

    await expect(service.writeFile('/docs', 'x')).rejects.toThrow('Path is not a file');
  });
});

describe('LocalFileSystemService localStorage persistence', () => {
  it('persists written files under a single HomePilot key', async () => {
    await service.createFolder('/', 'notes');
    await service.writeFile('/notes/todo.txt', 'buy milk');

    expect([...store.keys()]).toEqual([STORAGE_KEY]);
    expect(store.get(STORAGE_KEY)).toContain('buy milk');

    const reloaded = new LocalFileSystemService();
    expect(await reloaded.readFile('/notes/todo.txt')).toBe('buy milk');
  });

  it('keeps the in-memory state untouched when saving fails', async () => {
    await service.writeFile('/keep.txt', 'original');
    useFullLocalStorage();

    await expect(service.writeFile('/keep.txt', 'changed')).rejects.toThrow(
      'Local storage save failed',
    );
    await expect(service.writeFile('/new.txt', 'x')).rejects.toThrow('Local storage save failed');

    expect(await service.readFile('/keep.txt')).toBe('original');
    expect(await service.getItem('/new.txt')).toBeNull();
  });

  it('recovers from corrupted stored data', async () => {
    store.set(STORAGE_KEY, '{not-json');

    const recovered = new LocalFileSystemService();
    expect((await recovered.getDirectory('/')).length).toBe(0);
    await recovered.writeFile('/fresh.txt', 'ok');
    expect(await recovered.readFile('/fresh.txt')).toBe('ok');
  });
});

describe('LocalFileSystemService Explorer operations', () => {
  it('lists directories like the other file services', async () => {
    await service.createFolder('/', 'docs');
    await service.writeFile('/docs/a.txt', 'a');

    const rootItems = await service.getDirectory('/');
    expect(rootItems.map((i) => ({ name: i.name, type: i.type }))).toEqual([
      { name: 'docs', type: 'directory' },
    ]);

    const docItems = await service.getDirectory('/docs');
    expect(docItems.map((i) => i.path)).toEqual(['/docs/a.txt']);
    expect(service.getParentPath('/docs/a.txt')).toBe('/docs');
    expect(service.getRootPath()).toBe('/');
  });

  it('renames items and rewrites descendant paths', async () => {
    await service.createFolder('/', 'docs');
    await service.writeFile('/docs/a.txt', 'a');

    const newPath = await service.renameItem('/docs', 'notes');

    expect(newPath).toBe('/notes');
    expect(await service.readFile('/notes/a.txt')).toBe('a');
    expect(await service.getItem('/docs')).toBeNull();
  });

  it('deletes items with their contents', async () => {
    await service.createFolder('/', 'docs');
    await service.writeFile('/docs/a.txt', 'a');

    const result = await service.deleteItems(['/docs']);
    expect(result.deleted).toBe(1);
    expect(await service.getItem('/docs')).toBeNull();
    expect(await service.getItem('/docs/a.txt')).toBeNull();
  });

  it('moves and copies items between folders', async () => {
    await service.createFolder('/', 'docs');
    await service.createFolder('/', 'archive');
    await service.writeFile('/docs/a.txt', 'a');

    const moved = await service.moveItems(['/docs/a.txt'], '/archive');
    expect(moved.processed).toBe(1);
    expect(await service.readFile('/archive/a.txt')).toBe('a');
    expect(await service.getItem('/docs/a.txt')).toBeNull();
    expect((await service.getDirectory('/archive')).map((i) => i.path)).toEqual(['/archive/a.txt']);

    const copied = await service.copyItems(['/archive/a.txt'], '/docs');
    expect(copied.processed).toBe(1);
    expect(await service.readFile('/docs/a.txt')).toBe('a');
    expect(await service.readFile('/archive/a.txt')).toBe('a');
    expect((await service.getDirectory('/docs')).map((i) => i.path)).toEqual(['/docs/a.txt']);
  });
});
