/**
 * LocalReadingPositionStore keeps the FileViewer reading position of the
 * browser Local filesystem (アプリ) in localStorage.
 *
 * - The value is a scroll progress ratio (0.0 ~ 1.0), the same shape the
 *   Gateway shared position uses. Pixel offsets are never stored.
 * - Storage is kept completely separate from the Gateway positions
 *   (PC の .HomePilotViewerState.json), so a Local path and a PC path that
 *   look identical are never mixed up.
 * - PWA and G2 read and write the same key, so a position saved in one is
 *   restored in the other.
 * - No TTL. At most MAX_ENTRIES are kept; older entries are dropped by
 *   `updatedAt` when the limit is exceeded.
 */

const STORAGE_KEY = 'homepilot.localFileViewerPositions';

export const LOCAL_READING_POSITION_MAX_ENTRIES = 100;

export interface LocalReadingPosition {
  progress: number;
  updatedAt: number;
}

interface PositionStore {
  [filePath: string]: LocalReadingPosition;
}

function isPosition(value: unknown): value is LocalReadingPosition {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.progress === 'number' &&
    Number.isFinite(entry.progress) &&
    entry.progress >= 0 &&
    entry.progress <= 1 &&
    typeof entry.updatedAt === 'number' &&
    Number.isFinite(entry.updatedAt)
  );
}

function loadStore(): PositionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const store: PositionStore = {};
    for (const [filePath, value] of Object.entries(parsed)) {
      if (filePath && isPosition(value)) store[filePath] = value;
    }
    return store;
  } catch {
    // Missing or corrupted storage — treat as empty
    return {};
  }
}

function saveStore(store: PositionStore): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

function trim(store: PositionStore): void {
  const paths = Object.keys(store);
  if (paths.length <= LOCAL_READING_POSITION_MAX_ENTRIES) return;
  paths.sort((a, b) => store[a].updatedAt - store[b].updatedAt);
  for (const path of paths.slice(0, paths.length - LOCAL_READING_POSITION_MAX_ENTRIES)) {
    delete store[path];
  }
}

/** Returns the stored progress ratio, or null when nothing is stored. */
export function getLocalReadingPosition(filePath: string): number | null {
  const entry = loadStore()[filePath];
  return entry ? entry.progress : null;
}

/** Stores the progress ratio (0.0 ~ 1.0) for a Local file. */
export function saveLocalReadingPosition(filePath: string, progress: number): void {
  if (typeof filePath !== 'string' || filePath === '') return;
  if (typeof progress !== 'number' || !Number.isFinite(progress)) return;
  const store = loadStore();
  store[filePath] = {
    progress: Math.min(1, Math.max(0, progress)),
    updatedAt: Date.now(),
  };
  trim(store);
  saveStore(store);
}
