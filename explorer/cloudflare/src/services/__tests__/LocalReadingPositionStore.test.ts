import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  LOCAL_READING_POSITION_MAX_ENTRIES,
  getLocalReadingPosition,
  saveLocalReadingPosition,
} from '../LocalReadingPositionStore';

const STORAGE_KEY = 'homepilot.localFileViewerPositions';

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

function rawStore(): Record<string, { progress: number; updatedAt: number }> {
  const raw = store.get(STORAGE_KEY);
  return raw ? JSON.parse(raw) : {};
}

function seedEntries(count: number, baseUpdatedAt = 1000): void {
  const entries: Record<string, { progress: number; updatedAt: number }> = {};
  for (let i = 0; i < count; i++) {
    entries[`/file-${i}.txt`] = { progress: i / count, updatedAt: baseUpdatedAt + i };
  }
  store.set(STORAGE_KEY, JSON.stringify(entries));
}

beforeEach(() => {
  vi.restoreAllMocks();
  store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub(store);
});

describe('LocalReadingPositionStore 保存と読み込み', () => {
  it('保存 → 読み込み', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    saveLocalReadingPosition('/notes/readme.txt', 0.6);

    expect(getLocalReadingPosition('/notes/readme.txt')).toBe(0.6);
    expect(rawStore()).toEqual({
      '/notes/readme.txt': { progress: 0.6, updatedAt: 1700000000000 },
    });
  });

  it('保存先キーは homepilot.localFileViewerPositions（Gateway の位置とは別領域）', () => {
    saveLocalReadingPosition('/a.txt', 0.25);

    expect(store.has(STORAGE_KEY)).toBe(true);
    expect(store.has('homepilot.fileViewerPositions')).toBe(false);
    expect(store.size).toBe(1);
  });

  it('未保存の path は null を返す', () => {
    expect(getLocalReadingPosition('/never-saved.txt')).toBeNull();
  });

  it('progress = 0 は 0 として返る（null ではない）', () => {
    saveLocalReadingPosition('/a.txt', 0);

    expect(getLocalReadingPosition('/a.txt')).toBe(0);
    expect(getLocalReadingPosition('/a.txt')).not.toBeNull();
  });

  it('progress = 1 は 1 として返る', () => {
    saveLocalReadingPosition('/a.txt', 1);

    expect(getLocalReadingPosition('/a.txt')).toBe(1);
  });

  it('同じ path への再保存は上書きする（件数は増えない）', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);

    saveLocalReadingPosition('/a.txt', 0.2);
    saveLocalReadingPosition('/a.txt', 0.8);

    expect(Object.keys(rawStore())).toEqual(['/a.txt']);
    expect(getLocalReadingPosition('/a.txt')).toBe(0.8);
  });

  it('再保存すると updatedAt が更新される', () => {
    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(9000);

    saveLocalReadingPosition('/a.txt', 0.2);
    const first = rawStore()['/a.txt'].updatedAt;
    saveLocalReadingPosition('/a.txt', 0.8);
    const second = rawStore()['/a.txt'].updatedAt;

    expect(first).toBe(1000);
    expect(second).toBe(9000);
    expect(second).toBeGreaterThan(first);
  });

  it('異なる path は独立して保持される', () => {
    saveLocalReadingPosition('/pc/a.txt', 0.3);
    saveLocalReadingPosition('/local/a.txt', 0.7);

    expect(getLocalReadingPosition('/pc/a.txt')).toBe(0.3);
    expect(getLocalReadingPosition('/local/a.txt')).toBe(0.7);
  });
});

describe('LocalReadingPositionStore 件数制限（TTLなし・最大100件）', () => {
  it(`${LOCAL_READING_POSITION_MAX_ENTRIES} 件まではどれも削除されない`, () => {
    seedEntries(LOCAL_READING_POSITION_MAX_ENTRIES - 1); // 99件

    saveLocalReadingPosition('/new.txt', 0.5);

    const raw = rawStore();
    expect(Object.keys(raw).length).toBe(LOCAL_READING_POSITION_MAX_ENTRIES);
    expect(raw['/file-0.txt']).toBeDefined();
    expect(raw['/new.txt']).toEqual({ progress: 0.5, updatedAt: expect.any(Number) });
  });

  it('101件目を保存すると最も古い updatedAt のエントリが削除される', () => {
    seedEntries(LOCAL_READING_POSITION_MAX_ENTRIES); // updatedAt: 1000 .. 1099
    vi.spyOn(Date, 'now').mockReturnValue(2000000);

    saveLocalReadingPosition('/new.txt', 0.5);

    const raw = rawStore();
    const paths = Object.keys(raw);
    expect(paths.length).toBe(LOCAL_READING_POSITION_MAX_ENTRIES);
    expect(raw['/new.txt']).toEqual({ progress: 0.5, updatedAt: 2000000 });
    // 最古（updatedAt=1000）が消え、残りは 1001..1099
    expect(raw['/file-0.txt']).toBeUndefined();
    expect(raw['/file-1.txt']).toBeDefined();
    expect(raw['/file-99.txt']).toBeDefined();
  });
});

describe('LocalReadingPositionStore 壊れたデータ', () => {
  it('JSON が壊れていてもクラッシュせず null を返す', () => {
    store.set(STORAGE_KEY, 'not-json{{{');

    expect(getLocalReadingPosition('/a.txt')).toBeNull();
    expect(() => saveLocalReadingPosition('/a.txt', 0.5)).not.toThrow();
    expect(getLocalReadingPosition('/a.txt')).toBe(0.5);
  });

  it('配列・null・スカラーなど想定外の形式を空状態として扱う', () => {
    for (const invalid of ['[1,2,3]', 'null', '"text"', '42', 'true']) {
      store.set(STORAGE_KEY, invalid);
      expect(getLocalReadingPosition('/a.txt')).toBeNull();
      expect(() => saveLocalReadingPosition('/a.txt', 0.5)).not.toThrow();
    }
  });

  it('不正なエントリは読み込み時に無視される', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        '/ok.txt': { progress: 0.4, updatedAt: 10 },
        '/string-progress.txt': { progress: '50%', updatedAt: 10 },
        '/over-progress.txt': { progress: 3, updatedAt: 10 },
        '/missing-updated.txt': { progress: 0.5 },
        '/missing-progress.txt': { updatedAt: 10 },
        '/scalar.txt': 42,
        '/null.txt': null,
        '/object.txt': 'nope',
      }),
    );

    expect(getLocalReadingPosition('/ok.txt')).toBe(0.4);
    expect(getLocalReadingPosition('/string-progress.txt')).toBeNull();
    expect(getLocalReadingPosition('/over-progress.txt')).toBeNull();
    expect(getLocalReadingPosition('/missing-updated.txt')).toBeNull();
    expect(getLocalReadingPosition('/missing-progress.txt')).toBeNull();
    expect(getLocalReadingPosition('/scalar.txt')).toBeNull();
    expect(getLocalReadingPosition('/null.txt')).toBeNull();
    expect(getLocalReadingPosition('/object.txt')).toBeNull();
  });

  it('不正なエントリは次の保存時に取り除かれる', () => {
    store.set(
      STORAGE_KEY,
      JSON.stringify({
        '/ok.txt': { progress: 0.4, updatedAt: 10 },
        '/bad.txt': { progress: 'x', updatedAt: 10 },
      }),
    );

    saveLocalReadingPosition('/new.txt', 0.9);

    expect(Object.keys(rawStore()).sort()).toEqual(['/new.txt', '/ok.txt']);
  });

  it('不正な progress は保存しない', () => {
    saveLocalReadingPosition('/a.txt', Number.NaN);
    saveLocalReadingPosition('/a.txt', Number.POSITIVE_INFINITY);

    expect(rawStore()).toEqual({});

    saveLocalReadingPosition('', 0.5);
    expect(rawStore()).toEqual({});
  });
});
