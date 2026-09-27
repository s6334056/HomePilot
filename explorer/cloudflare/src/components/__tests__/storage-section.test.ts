import { beforeEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { StorageSection } from '../StorageSection';
import { SettingsModal } from '../SettingsModal';
import { formatBytes } from '../../services/StorageUsage';

const LOCAL_FS_KEY = 'homepilot.localFileSystem';

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

const LOCAL_FS_JSON = JSON.stringify({
  '/': { type: 'directory', name: '', parent: '' },
  '/a.txt': { type: 'file', name: 'a.txt', parent: '/', content: 'hello', size: 5 },
  '/b.txt': { type: 'file', name: 'b.txt', parent: '/', content: 'こんにちは', size: 15 },
});

function renderStorageSection(info: Parameters<typeof StorageSection>[0]['info']): string {
  return renderToStaticMarkup(createElement(StorageSection, { info }));
}

function renderSettingsModal(): string {
  return renderToStaticMarkup(
    createElement(SettingsModal, {
      isOpen: true,
      onClose: () => undefined,
      onReconnect: () => undefined,
      isBridgeAvailable: false,
      g2RuntimeState: 'inactive',
      onStartG2Runtime: () => undefined,
      onStopG2Runtime: () => undefined,
    }),
  );
}

beforeEach(() => {
  store = new Map<string, string>();
  store.set(LOCAL_FS_KEY, LOCAL_FS_JSON);
  installLocalStorage(store);
});

describe('StorageSection 表示', () => {
  it('3項目（A/B/C）をそれぞれ別の意味で表示する', () => {
    const html = renderStorageSection({
      fileSystemBytes: 2048,
      fileContentBytes: 20,
      siteUsageBytes: 5 * 1024 * 1024,
    });

    expect(html).toContain('ストレージ');
    expect(html).toContain('アプリローカル保存データ');
    expect(html).toContain('保存しているファイルの内容合計');
    expect(html).toContain('このサイトのストレージ使用量（ブラウザ概算）');

    expect(html).toContain(formatBytes(2048));
    expect(html).toContain(formatBytes(20));
    expect(html).toContain(formatBytes(5 * 1024 * 1024));
  });

  it('C がブラウザ概算値であることが分かる', () => {
    const html = renderStorageSection({
      fileSystemBytes: 1,
      fileContentBytes: 1,
      siteUsageBytes: 1,
    });

    expect(html).toContain('ブラウザ概算');
    expect(html).toContain('概算値');
    expect(html).toContain('HomePilot固有の容量ではありません');
  });

  it('残容量・上限・使用率を表示していない', () => {
    const html = renderStorageSection({
      fileSystemBytes: 100,
      fileContentBytes: 50,
      siteUsageBytes: 200,
    });

    expect(html).not.toContain('残容量');
    expect(html).not.toContain('残り');
    expect(html).not.toContain('quota');
    expect(html).not.toContain('使用率');
    expect(html).not.toContain('あと');
  });

  it('未取得の値は安全な表示にする', () => {
    const html = renderStorageSection({
      fileSystemBytes: null,
      fileContentBytes: null,
      siteUsageBytes: null,
    });

    expect(html).toContain('取得できません');
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('undefined');
  });

  it('取得前は「取得中...」と表示する', () => {
    const html = renderStorageSection({
      fileSystemBytes: 10,
      fileContentBytes: 10,
      siteUsageBytes: undefined,
    });

    expect(html).toContain('取得中...');
  });
});

describe('SettingsModal への表示', () => {
  it('ストレージの3項目を表示する', () => {
    const html = renderSettingsModal();

    expect(html).toContain('ストレージ');
    expect(html).toContain('アプリローカル保存データ');
    expect(html).toContain('保存しているファイルの内容合計');
    expect(html).toContain('このサイトのストレージ使用量（ブラウザ概算）');
  });

  it('A / B を localStorage の実データから表示する', () => {
    const html = renderSettingsModal();

    expect(html).toContain(formatBytes(new TextEncoder().encode(LOCAL_FS_JSON).length));
    expect(html).toContain(formatBytes(5 + 15));
  });

  it('残容量を表示していない', () => {
    const html = renderSettingsModal();

    expect(html).not.toContain('残容量');
    expect(html).not.toContain('あと');
    expect(html).not.toContain('quota');
  });
});
