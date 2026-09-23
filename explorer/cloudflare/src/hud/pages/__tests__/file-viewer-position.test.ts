import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  FileViewerPage,
  G2_VIEWER_LINES,
  computeG2RestorePosition,
} from '../file-viewer-page';
import { getG2SharedPosition } from '../../services/g2-shared-position-store';
import type { FileSystemItem } from '../../../domain/types';

const FILE_PATH = '/notes/readme.txt';
const TOTAL_WRAPPED_LINES = 100;
// max scrollable position: 100 - 9 visible lines
const MAX_POSITION = TOTAL_WRAPPED_LINES - G2_VIEWER_LINES;

function makeFile(): FileSystemItem {
  return { id: FILE_PATH, name: 'readme.txt', type: 'file', path: FILE_PATH };
}

function makeWrappedLines() {
  return Array.from({ length: TOTAL_WRAPPED_LINES }, (_, i) => ({
    text: `line ${i}`,
    logicalLineIndex: i,
    isFirstOfLogical: true,
  }));
}

describe('FileViewerPage shared position save (先頭へ/末尾へ)', () => {
  let page: FileViewerPage;
  let internal: Record<string, any>;
  let patchPosition: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    patchPosition = vi.fn().mockResolvedValue(undefined);
    const gateway = { patchPosition } as any;
    page = new FileViewerPage(
      makeFile(),
      {} as any,
      async () => true,
      undefined,
      undefined,
      gateway,
    );
    internal = page as unknown as Record<string, any>;
    internal.wrappedLines = makeWrappedLines();
    internal.scrollPosition = 40;
  });

  it('先頭へ saves progress=0 as the shared position', async () => {
    await page.onMenuItemClick('top');

    expect(internal.scrollPosition).toBe(0);
    expect(patchPosition).toHaveBeenCalledTimes(1);
    expect(patchPosition).toHaveBeenCalledWith(FILE_PATH, 0, expect.any(Number));
  });

  it('先頭へ overwrites a stale pending save with progress=0', async () => {
    // Simulate a recent scroll whose debounced save is still pending
    internal.saveCurrentPosition();
    expect(patchPosition).not.toHaveBeenCalled();

    await page.onMenuItemClick('top');

    expect(patchPosition).toHaveBeenCalledTimes(1);
    expect(patchPosition.mock.calls[0][1]).toBe(0);
    // No timer must remain after the explicit flush
    expect(internal.positionSaveTimer).toBeNull();
    expect(internal.pendingPositionSave).toBeNull();
  });

  it('末尾へ saves progress=1 as the shared position', async () => {
    internal.scrollPosition = 10;

    await page.onMenuItemClick('bottom');

    expect(internal.scrollPosition).toBe(MAX_POSITION);
    expect(patchPosition).toHaveBeenCalledTimes(1);
    expect(patchPosition).toHaveBeenCalledWith(FILE_PATH, 1, expect.any(Number));
  });

  it('normal scroll saves remain debounced and keep the scrolled progress', async () => {
    vi.useFakeTimers();
    try {
      internal.scrollPosition = 46;
      internal.saveCurrentPosition();
      expect(patchPosition).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(2000);

      expect(patchPosition).toHaveBeenCalledTimes(1);
      expect(patchPosition).toHaveBeenCalledWith(
        FILE_PATH,
        46 / MAX_POSITION,
        expect.any(Number),
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('shared position progress=0 round trip', () => {
  it('getG2SharedPosition returns 0 (not null) for a stored progress of 0', async () => {
    const gateway = {
      getViewerState: vi.fn().mockResolvedValue({
        positions: { [FILE_PATH]: { progress: 0, updatedAt: 123 } },
        history: [],
      }),
    } as any;

    const progress = await getG2SharedPosition(gateway, FILE_PATH);
    expect(progress).toBe(0);
    expect(progress).not.toBeNull();
  });

  it('computeG2RestorePosition maps progress=0 to scroll position 0', () => {
    expect(computeG2RestorePosition(0, TOTAL_WRAPPED_LINES, G2_VIEWER_LINES, 95)).toBe(0);
  });
});
