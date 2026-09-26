import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CopyInProgressIndicator } from '../../components/CopyInProgressIndicator';
import { ContextActionMenu } from '../../components/ContextActionMenu';
import { FileSystemService } from '../FileSystemService';
import { FileSystemItem } from '../../domain/types';
import { LocalFileSystemService } from '../LocalFileSystemService';
import { copyFiles, planItemsCopy } from '../FileSystemCopy';
import {
  COPY_IN_PROGRESS_MESSAGE,
  COPY_TO_DEVICE_LABEL,
  isCopyToDeviceDisabled,
  withCopyIndicator,
} from '../CopyToDeviceUi';

// ── Source fixture: a tiny read-only file system ───────────────

interface FakeNode {
  type: 'file' | 'directory';
  content?: string;
  children?: string[];
}

const SOURCE_NODES: Record<string, FakeNode> = {
  '/': { type: 'directory', children: ['/readme.txt', '/project'] },
  '/readme.txt': { type: 'file', content: 'root readme' },
  '/project': { type: 'directory', children: ['/project/a.txt', '/project/src'] },
  '/project/a.txt': { type: 'file', content: 'project a' },
  '/project/src': { type: 'directory', children: ['/project/src/main.ts'] },
  '/project/src/main.ts': { type: 'file', content: 'export const main = 1;' },
};

function nameOf(path: string): string {
  return path === '/' ? '' : path.slice(path.lastIndexOf('/') + 1);
}

function toItem(path: string): FileSystemItem | null {
  const node = SOURCE_NODES[path];
  if (!node) return null;
  return { id: path, name: nameOf(path), type: node.type, path };
}

const unused = () => {
  throw new Error('unused on the source side');
};

function createSourceService(): FileSystemService {
  return {
    getRootPath: () => '/',
    getParentPath: (p: string) => {
      const i = p.lastIndexOf('/');
      return i <= 0 ? '/' : p.slice(0, i);
    },
    getItem: async (p: string) => toItem(p),
    getDirectory: async (p: string) => {
      const node = SOURCE_NODES[p];
      if (!node || node.type !== 'directory') throw new Error(`Directory not found: ${p}`);
      return (node.children ?? []).map((c) => toItem(c)!);
    },
    readFile: async (p: string) => {
      const node = SOURCE_NODES[p];
      if (!node || node.type !== 'file') throw new Error(`File not found: ${p}`);
      return node.content ?? '';
    },
    writeFile: unused,
    createFolder: unused,
    renameItem: unused,
    deleteItems: unused,
    moveItems: unused,
    copyItems: unused,
    getDownloadUrl: () => null,
    downloadItems: async () => ({}),
    uploadItems: async () => ({ uploaded: 0, errors: [] }),
  };
}

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

function useFailingLocalStorage(): void {
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => null,
    setItem: () => {
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    },
    removeItem: () => undefined,
    clear: () => undefined,
  };
}

let originalLocalStorage: unknown;

/** Runs `body` with a recording indicator, returning the recorded events. */
async function withRecordingIndicator(body: () => Promise<void>): Promise<string[]> {
  const events: string[] = [];
  await withCopyIndicator(
    () => events.push('show'),
    () => events.push('hide'),
    body,
  );
  return events;
}

beforeEach(() => {
  originalLocalStorage = (globalThis as { localStorage?: unknown }).localStorage;
  useWritableLocalStorage();
});

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = originalLocalStorage;
});

// ── ケース3: 二重実行防止 ──────────────────────────────────────

describe('isCopyToDeviceDisabled', () => {
  it('offers the copy while idle with a selection', () => {
    expect(
      isCopyToDeviceDisabled({ isExplorerReady: true, selectedCount: 2, isCopying: false }),
    ).toBe(false);
  });

  it('blocks a second run while a copy is in progress', () => {
    expect(
      isCopyToDeviceDisabled({ isExplorerReady: true, selectedCount: 2, isCopying: true }),
    ).toBe(true);
  });

  it('blocks without a selection and before the explorer is ready', () => {
    expect(
      isCopyToDeviceDisabled({ isExplorerReady: true, selectedCount: 0, isCopying: false }),
    ).toBe(true);
    expect(
      isCopyToDeviceDisabled({ isExplorerReady: false, selectedCount: 2, isCopying: false }),
    ).toBe(true);
  });

  it('renders the menu entry disabled while copying', () => {
    const item = {
      label: COPY_TO_DEVICE_LABEL,
      disabled: isCopyToDeviceDisabled({
        isExplorerReady: true,
        selectedCount: 3,
        isCopying: true,
      }),
      onClick: () => undefined,
    };

    const html = renderToStaticMarkup(
      createElement(ContextActionMenu, {
        isOpen: true,
        items: [item],
        onClose: () => undefined,
        triggerRect: {} as unknown as DOMRect,
      }),
    );

    expect(html).toContain(COPY_TO_DEVICE_LABEL);
    expect(html).toContain('hp-context-menu-item--disabled');
    expect(html).toContain('disabled=""');
  });
});

// ── 表示: 「この端末へコピーしています…」 ──────────────────────

describe('CopyInProgressIndicator', () => {
  it('shows the copying message with a spinner while a copy runs', () => {
    const html = renderToStaticMarkup(
      createElement(CopyInProgressIndicator, { isVisible: true }),
    );

    expect(COPY_IN_PROGRESS_MESSAGE).toBe('この端末へコピーしています…');
    expect(html).toContain(COPY_IN_PROGRESS_MESSAGE);
    expect(html).toContain('hp-toast--processing');
    expect(html).toContain('spin');
    expect(html).toContain('role="status"');
  });

  it('renders nothing before the copy starts and after it ends', () => {
    expect(renderToStaticMarkup(createElement(CopyInProgressIndicator, { isVisible: false }))).toBe(
      '',
    );
  });
});

// ── ケース1 / ケース2: state 遷移 ──────────────────────────────

describe('withCopyIndicator', () => {
  it('case 1 - goes up before the work and down once it succeeded', async () => {
    const events = await withRecordingIndicator(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });

    expect(events).toEqual(['show', 'hide']);
  });

  it('returns whatever the wrapped operation resolved with', async () => {
    const value = await withCopyIndicator(
      () => undefined,
      () => undefined,
      async () => 'done',
    );

    expect(value).toBe('done');
  });

  it('case 2 - comes back down when the operation fails, and rethrows', async () => {
    const events: string[] = [];

    await expect(
      withCopyIndicator(
        () => events.push('show'),
        () => events.push('hide'),
        async () => {
          throw new Error('boom');
        },
      ),
    ).rejects.toThrow('boom');

    expect(events).toEqual(['show', 'hide']);
  });

  it('case 1 - brackets a real file copy', async () => {
    const source = createSourceService();
    const target = new LocalFileSystemService();

    const events = await withRecordingIndicator(async () => {
      const plan = await planItemsCopy(source, target, ['/readme.txt']);
      await copyFiles(source, target, plan);
    });

    expect(events).toEqual(['show', 'hide']);
    expect(await target.readFile('/readme.txt')).toBe('root readme');
  });

  it('case 2 - brackets a failing copy: error surfaces, indicator drops', async () => {
    const source = createSourceService();
    const target = new LocalFileSystemService();
    const plan = await planItemsCopy(source, target, ['/readme.txt']);

    useFailingLocalStorage();
    const events: string[] = [];

    await expect(
      withCopyIndicator(
        () => events.push('show'),
        () => events.push('hide'),
        () => copyFiles(source, target, plan),
      ),
    ).rejects.toThrow('Local storage save failed');

    expect(events).toEqual(['show', 'hide']);
  });

  it('case 4 - stays up across a whole folder copy and never lingers', async () => {
    const source = createSourceService();
    const target = new LocalFileSystemService();
    const events: string[] = [];
    let hiddenBeforeCopyFinished = false;

    await withCopyIndicator(
      () => events.push('show'),
      () => events.push('hide'),
      async () => {
        const plan = await planItemsCopy(source, target, ['/project']);
        await copyFiles(source, target, plan);
        hiddenBeforeCopyFinished = events.includes('hide');
      },
    );

    expect(events).toEqual(['show', 'hide']);
    expect(hiddenBeforeCopyFinished).toBe(false);
    expect((await target.getItem('/project'))!.type).toBe('directory');
    expect((await target.getItem('/project/src'))!.type).toBe('directory');
    expect(await target.readFile('/project/a.txt')).toBe('project a');
    expect(await target.readFile('/project/src/main.ts')).toBe('export const main = 1;');
  });
});
