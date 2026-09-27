import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  formatBytes,
  formatUsageValue,
  getLocalFileSystemUsage,
  getSiteStorageUsage,
} from '../StorageUsage';

const STORAGE_KEY = 'homepilot.localFileSystem';
const encoder = new TextEncoder();

let store: Map<string, string>;

function installLocalStorage(map: Map<string, string>): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (key: string) => (map.has(key) ? map.get(key)! : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => {
      map.clear();
    },
  };
}

beforeEach(() => {
  store = new Map<string, string>();
  installLocalStorage(store);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── A: アプリローカル保存データ（JSON 文字列の UTF-8 バイト数） ──

describe('A: homepilot.localFileSystem の JSON サイズ', () => {
  it('保存済み JSON 文字列の UTF-8 バイト数を返す', () => {
    const json = JSON.stringify({
      '/': { type: 'directory', name: '', parent: '' },
      '/memo.txt': { type: 'file', name: 'memo.txt', parent: '/', content: 'buy milk', size: 8 },
    });
    store.set(STORAGE_KEY, json);

    const usage = getLocalFileSystemUsage();
    expect(usage.fileSystemBytes).toBe(encoder.encode(json).length);
  });

  it('未保存なら 0 を返す', () => {
    expect(getLocalFileSystemUsage().fileSystemBytes).toBe(0);
  });

  it('日本語などマルチバイト文字を含む場合は UTF-8 バイト数になる', () => {
    const json = JSON.stringify({
      '/': { type: 'directory', name: '', parent: '' },
      '/メモ.txt': { type: 'file', name: 'メモ.txt', parent: '/', content: 'こんにちは', size: 15 },
    });
    store.set(STORAGE_KEY, json);

    const bytes = getLocalFileSystemUsage().fileSystemBytes!;
    expect(bytes).toBe(encoder.encode(json).length);
    expect(bytes).toBeGreaterThan(json.length);
  });

  it('他の HomePilot キーは数えない', () => {
    const json = JSON.stringify({ '/': { type: 'directory', name: '', parent: '' } });
    store.set(STORAGE_KEY, json);
    store.set('homepilot.localFileHistory', 'x'.repeat(1000));
    store.set('homepilot.localFileViewerPositions', 'y'.repeat(1000));

    expect(getLocalFileSystemUsage().fileSystemBytes).toBe(encoder.encode(json).length);
  });

  it('localStorage が読めない場合は null', () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => undefined,
      removeItem: () => undefined,
      clear: () => undefined,
    };

    expect(getLocalFileSystemUsage().fileSystemBytes).toBeNull();
  });
});

// ── B: 保存しているファイルの内容合計 ──

describe('B: ファイル内容サイズの合計', () => {
  function writeEntries(entries: unknown): void {
    store.set(STORAGE_KEY, JSON.stringify(entries));
  }

  it('複数ファイルの size を合計する', () => {
    writeEntries({
      '/': { type: 'directory', name: '', parent: '' },
      '/a.txt': { type: 'file', name: 'a.txt', parent: '/', content: 'hello', size: 5 },
      '/b.txt': { type: 'file', name: 'b.txt', parent: '/', content: '0123456789', size: 10 },
      '/c.txt': { type: 'file', name: 'c.txt', parent: '/', content: 'こんにちは', size: 15 },
    });

    expect(getLocalFileSystemUsage().fileContentBytes).toBe(30);
  });

  it('directory は合計しない', () => {
    writeEntries({
      '/': { type: 'directory', name: '', parent: '' },
      '/docs': { type: 'directory', name: 'docs', parent: '/', size: 999 },
      '/docs/a.txt': { type: 'file', name: 'a.txt', parent: '/docs', content: 'abc', size: 3 },
    });

    expect(getLocalFileSystemUsage().fileContentBytes).toBe(3);
  });

  it('size が無い file は content の UTF-8 バイト数で補完する', () => {
    writeEntries({
      '/': { type: 'directory', name: '', parent: '' },
      '/ascii.txt': { type: 'file', name: 'ascii.txt', parent: '/', content: 'abc' },
      '/jp.txt': { type: 'file', name: 'jp.txt', parent: '/', content: 'こんにちは' },
    });

    expect(getLocalFileSystemUsage().fileContentBytes).toBe(3 + 15);
  });

  it('size が無い file で content も無ければ 0 扱い', () => {
    writeEntries({
      '/': { type: 'directory', name: '', parent: '' },
      '/weird.txt': { type: 'file', name: 'weird.txt', parent: '/' },
    });

    expect(getLocalFileSystemUsage().fileContentBytes).toBe(0);
  });

  it('0バイトのファイルを正しく扱える', () => {
    writeEntries({
      '/': { type: 'directory', name: '', parent: '' },
      '/empty.txt': { type: 'file', name: 'empty.txt', parent: '/', content: '', size: 0 },
      '/b.txt': { type: 'file', name: 'b.txt', parent: '/', content: 'xy', size: 2 },
    });

    expect(getLocalFileSystemUsage().fileContentBytes).toBe(2);
  });

  it('未保存なら 0、壊れた JSON は null', () => {
    expect(getLocalFileSystemUsage().fileContentBytes).toBe(0);

    store.set(STORAGE_KEY, '{not-json');
    const broken = getLocalFileSystemUsage();
    expect(broken.fileContentBytes).toBeNull();
    expect(broken.fileSystemBytes).toBe(encoder.encode('{not-json').length);
  });
});

// ── C: navigator.storage.estimate().usage ──

describe('C: サイト全体のストレージ使用量', () => {
  it('usage を取得できる', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ usage: 12345, quota: 999999999 }),
      },
    });

    expect(await getSiteStorageUsage()).toBe(12345);
  });

  it('quota は使わず usage のみ返す', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({ quota: 42424242 }),
      },
    });

    expect(await getSiteStorageUsage()).toBeNull();
  });

  it('navigator.storage が無くても壊れない', async () => {
    vi.stubGlobal('navigator', {});

    expect(await getSiteStorageUsage()).toBeNull();
  });

  it('navigator 自体が無くても壊れない', async () => {
    vi.stubGlobal('navigator', undefined);

    expect(await getSiteStorageUsage()).toBeNull();
  });

  it('estimate() が reject しても壊れない', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: () => Promise.reject(new TypeError('storage is disabled')),
      },
    });

    expect(await getSiteStorageUsage()).toBeNull();
  });

  it('usage が取得できない場合は null', async () => {
    vi.stubGlobal('navigator', {
      storage: {
        estimate: async () => ({}),
      },
    });

    expect(await getSiteStorageUsage()).toBeNull();
  });
});

// ── 表示単位 ──

describe('表示単位', () => {
  it('バイトから B / KB / MB / GB へ変換する', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('未取得・取得中は日本語で表現する', () => {
    expect(formatUsageValue(undefined)).toBe('取得中...');
    expect(formatUsageValue(null)).toBe('取得できません');
    expect(formatUsageValue(0)).toBe('0 B');
  });
});
