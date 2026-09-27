import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LOCAL_HISTORY_MAX_ENTRIES,
  addToHistory,
  clearHistory,
  createLocalHistoryAccess,
  getHistory,
  removeFromHistory,
} from '../LocalHistoryStore';
import { LocalFileSystemService } from '../LocalFileSystemService';

const HISTORY_KEY = 'homepilot.localFileHistory';
const FS_KEY = 'homepilot.localFileSystem';

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

let store: Map<string, string>;

beforeEach(() => {
  vi.restoreAllMocks();
  store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub(store);
});

describe('LocalHistoryStore 空状態', () => {
  it('returns an empty history when nothing is stored', () => {
    expect(getHistory()).toEqual([]);
    expect(store.has(HISTORY_KEY)).toBe(false);
  });
});

describe('LocalHistoryStore 保存と再読み込み', () => {
  it('persists entries under homepilot.localFileHistory', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    addToHistory('/memo.txt');

    expect(JSON.parse(store.get(HISTORY_KEY)!)).toEqual([
      { path: '/memo.txt', lastViewedAt: 1700000000000 },
    ]);
    expect(now).toHaveBeenCalled();
  });

  it('keeps the file system storage key untouched', () => {
    const fsEntries = { '/': { type: 'directory', name: '', parent: '' } };
    store.set(FS_KEY, JSON.stringify(fsEntries));

    addToHistory('/memo.txt');

    expect(store.get(FS_KEY)).toBe(JSON.stringify(fsEntries));
  });

  it('reloads history written directly to localStorage', () => {
    store.set(
      HISTORY_KEY,
      JSON.stringify([
        { path: '/a.txt', lastViewedAt: 2 },
        { path: '/b.txt', lastViewedAt: 1 },
      ]),
    );

    expect(getHistory()).toEqual([
      { path: '/a.txt', lastViewedAt: 2 },
      { path: '/b.txt', lastViewedAt: 1 },
    ]);
  });
});

describe('LocalHistoryStore 追加と並び順', () => {
  it('places the newest entry first', () => {
    addToHistory('/a.txt');
    addToHistory('/b.txt');

    expect(getHistory().map((e) => e.path)).toEqual(['/b.txt', '/a.txt']);
  });

  it('moves a re-viewed path to the top without duplicating it', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1000);
    addToHistory('/a.txt');
    now.mockReturnValue(2000);
    addToHistory('/b.txt');
    now.mockReturnValue(3000);
    addToHistory('/a.txt');

    expect(getHistory()).toEqual([
      { path: '/a.txt', lastViewedAt: 3000 },
      { path: '/b.txt', lastViewedAt: 2000 },
    ]);
  });

  it('never records the same path twice', () => {
    addToHistory('/a.txt');
    addToHistory('/a.txt');
    addToHistory('/a.txt');

    const history = getHistory();
    expect(history).toHaveLength(1);
    expect(history[0].path).toBe('/a.txt');
  });
});

describe('LocalHistoryStore 最大件数', () => {
  it('keeps at most 30 entries', () => {
    for (let i = 1; i <= LOCAL_HISTORY_MAX_ENTRIES; i++) {
      addToHistory(`/f${String(i).padStart(3, '0')}.txt`);
    }

    const history = getHistory();
    expect(history).toHaveLength(LOCAL_HISTORY_MAX_ENTRIES);
    expect(history[0].path).toBe('/f030.txt');
    expect(history[LOCAL_HISTORY_MAX_ENTRIES - 1].path).toBe('/f001.txt');
  });

  it('drops the oldest entry when a 31st is added', () => {
    for (let i = 1; i <= LOCAL_HISTORY_MAX_ENTRIES + 1; i++) {
      addToHistory(`/f${String(i).padStart(3, '0')}.txt`);
    }

    const history = getHistory();
    expect(history).toHaveLength(LOCAL_HISTORY_MAX_ENTRIES);
    expect(history.map((e) => e.path)).not.toContain('/f001.txt');
    expect(history[0].path).toBe('/f031.txt');
    expect(history[LOCAL_HISTORY_MAX_ENTRIES - 1].path).toBe('/f002.txt');
  });
});

describe('LocalHistoryStore 削除', () => {
  it('removes only the selected entry', () => {
    addToHistory('/a.txt');
    addToHistory('/b.txt');

    removeFromHistory('/a.txt');

    expect(getHistory().map((e) => e.path)).toEqual(['/b.txt']);
  });

  it('leaves the file system storage untouched when removing history', () => {
    const fsEntries = { '/': { type: 'directory', name: '', parent: '' }, '/memo.txt': { type: 'file', name: 'memo.txt', parent: '/' } };
    store.set(FS_KEY, JSON.stringify(fsEntries));
    addToHistory('/memo.txt');

    removeFromHistory('/memo.txt');

    expect(getHistory()).toEqual([]);
    expect(store.get(FS_KEY)).toBe(JSON.stringify(fsEntries));
  });

  it('clears every entry with clearHistory', () => {
    addToHistory('/a.txt');
    addToHistory('/b.txt');

    clearHistory();

    expect(getHistory()).toEqual([]);
  });
});

describe('LocalHistoryStore 壊れたlocalStorageデータ', () => {
  it('returns an empty history for corrupted JSON', () => {
    store.set(HISTORY_KEY, '{not json');

    expect(getHistory()).toEqual([]);
  });

  it('returns an empty history when the stored value is not an array', () => {
    store.set(HISTORY_KEY, JSON.stringify({ path: '/a.txt', lastViewedAt: 1 }));

    expect(getHistory()).toEqual([]);
  });

  it('drops malformed entries but keeps valid ones', () => {
    store.set(
      HISTORY_KEY,
      JSON.stringify([
        { path: '/a.txt', lastViewedAt: 1 },
        { path: '/missing-timestamp.txt' },
        { lastViewedAt: 2 },
        'not-an-object',
        null,
        { path: '/b.txt', lastViewedAt: 'yesterday' },
      ]),
    );

    expect(getHistory()).toEqual([{ path: '/a.txt', lastViewedAt: 1 }]);
  });

  it('returns an empty history when localStorage.getItem throws', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    };

    expect(getHistory()).toEqual([]);
    expect(() => addToHistory('/a.txt')).not.toThrow();
  });
});

describe('createLocalHistoryAccess', () => {
  it('records, lists and removes history through localStorage', async () => {
    const access = createLocalHistoryAccess(new LocalFileSystemService());

    await access.addToHistory('/memo.txt');
    expect((await access.getHistory()).map((e) => e.path)).toEqual(['/memo.txt']);

    await access.removeFromHistory('/memo.txt');
    expect(await access.getHistory()).toEqual([]);
  });

  it('reports an existing local file as available', async () => {
    const service = new LocalFileSystemService();
    await service.writeFile('/memo.txt', 'こんにちは');
    const access = createLocalHistoryAccess(service);

    const existence = await access.checkFilesExist([{ path: '/memo.txt', lastViewedAt: 1 }]);

    expect(existence.get('/memo.txt')).toBe(true);
  });

  it('reports a deleted local file as not found while keeping the history entry', async () => {
    const service = new LocalFileSystemService();
    await service.writeFile('/memo.txt', 'こんにちは');
    const access = createLocalHistoryAccess(service);
    await access.addToHistory('/memo.txt');

    await service.deleteItems(['/memo.txt']);

    const existence = await access.checkFilesExist([{ path: '/memo.txt', lastViewedAt: 1 }]);
    expect(existence.get('/memo.txt')).toBe(false);
    expect((await access.getHistory()).map((e) => e.path)).toEqual(['/memo.txt']);
  });

  it('keeps the old path after rename', async () => {
    const service = new LocalFileSystemService();
    await service.writeFile('/memo.txt', 'こんにちは');
    const access = createLocalHistoryAccess(service);
    await access.addToHistory('/memo.txt');

    await service.renameItem('/memo.txt', 'note.txt');

    const existence = await access.checkFilesExist([{ path: '/memo.txt', lastViewedAt: 1 }]);
    expect(existence.get('/memo.txt')).toBe(false);
    expect((await access.getHistory()).map((e) => e.path)).toEqual(['/memo.txt']);
  });

  it('reports every entry of a mixed history', async () => {
    const service = new LocalFileSystemService();
    await service.writeFile('/exists.txt', 'x');
    const access = createLocalHistoryAccess(service);

    const existence = await access.checkFilesExist([
      { path: '/exists.txt', lastViewedAt: 2 },
      { path: '/gone.txt', lastViewedAt: 1 },
    ]);

    expect(existence.get('/exists.txt')).toBe(true);
    expect(existence.get('/gone.txt')).toBe(false);
  });
});
