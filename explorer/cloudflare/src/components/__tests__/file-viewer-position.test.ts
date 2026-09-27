import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resolveReadingProgress, persistReadingProgress } from '../FileViewer';

const LOCAL_KEY = 'homepilot.localFileViewerPositions';
const FILE_PATH = '/notes/readme.txt';

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

function localPositions(): Record<string, { progress: number; updatedAt: number }> {
  const raw = store.get(LOCAL_KEY);
  return raw ? JSON.parse(raw) : {};
}

let store: Map<string, string>;
// Gateway の最小スタブ（既存の G2 位置テスト同様 `any` で扱う）
let gateway: any;

beforeEach(() => {
  vi.restoreAllMocks();
  store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub(store);
  gateway = {
    getViewerState: vi.fn().mockResolvedValue({
      version: 1,
      positions: { [FILE_PATH]: { progress: 0.5, updatedAt: 123 } },
      history: [],
    }),
    patchPosition: vi.fn().mockResolvedValue(undefined),
  };
});

describe('FileViewer 読書位置 (gatewayService あり = 自宅PC)', () => {
  it('復元は Gateway の共有位置から行う', async () => {
    const progress = await resolveReadingProgress(gateway, false, FILE_PATH);

    expect(progress).toBe(0.5);
    expect(gateway.getViewerState).toHaveBeenCalledTimes(1);
    expect(localPositions()).toEqual({});
  });

  it('保存は Gateway へ行われ、localStorage には書かない', () => {
    persistReadingProgress(gateway, false, FILE_PATH, 0.9);

    expect(gateway.patchPosition).toHaveBeenCalledWith(FILE_PATH, 0.9, expect.any(Number));
    expect(localPositions()).toEqual({});
  });

  it('Gateway がエラーを返してもクラッシュせず null を返す', async () => {
    gateway.getViewerState.mockRejectedValue(new Error('offline'));

    await expect(resolveReadingProgress(gateway, false, FILE_PATH)).resolves.toBeNull();
  });
});

describe('FileViewer 読書位置 (gatewayService なし + localMode = アプリ)', () => {
  it('復元は localStorage から行う', async () => {
    store.set(LOCAL_KEY, JSON.stringify({ [FILE_PATH]: { progress: 0.7, updatedAt: 10 } }));

    await expect(resolveReadingProgress(null, true, FILE_PATH)).resolves.toBe(0.7);
    expect(gateway.getViewerState).not.toHaveBeenCalled();
  });

  it('保存は localStorage の homepilot.localFileViewerPositions に入る', () => {
    persistReadingProgress(null, true, FILE_PATH, 0.7);

    expect(gateway.patchPosition).not.toHaveBeenCalled();
    expect(localPositions()[FILE_PATH].progress).toBe(0.7);
  });

  it('保存位置なしなら何もしない', async () => {
    await expect(resolveReadingProgress(null, false, FILE_PATH)).resolves.toBeNull();
    persistReadingProgress(null, false, FILE_PATH, 0.7);

    expect(localPositions()).toEqual({});
    expect(gateway.getViewerState).not.toHaveBeenCalled();
    expect(gateway.patchPosition).not.toHaveBeenCalled();
  });
});
