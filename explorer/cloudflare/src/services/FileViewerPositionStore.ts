export type ViewerType = 'g2' | 'pwa';

export interface FileViewerPosition {
  position: number;
  updatedAt: number;
}

interface PositionStore {
  [key: string]: FileViewerPosition;
}

const STORAGE_KEY = 'homepilot.fileViewerPositions';
const TTL_MS = 180 * 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 100;

function makeKey(viewerType: ViewerType, filePath: string): string {
  return `${viewerType}|${filePath}`;
}

function loadStore(): PositionStore {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed;
  } catch {
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

function cleanup(store: PositionStore): PositionStore {
  const now = Date.now();
  const entries = Object.entries(store);

  const valid = entries.filter(([, v]) => {
    if (typeof v !== 'object' || v === null) return false;
    if (typeof v.position !== 'number' || typeof v.updatedAt !== 'number') return false;
    return now - v.updatedAt < TTL_MS;
  });

  if (valid.length > MAX_ENTRIES) {
    valid.sort((a, b) => a[1].updatedAt - b[1].updatedAt);
    while (valid.length > MAX_ENTRIES) {
      valid.shift();
    }
  }

  const cleaned: PositionStore = {};
  for (const [k, v] of valid) {
    cleaned[k] = v;
  }
  return cleaned;
}

export function getReadingPosition(viewerType: ViewerType, filePath: string): number | null {
  const store = loadStore();
  const key = makeKey(viewerType, filePath);
  const entry = store[key];
  if (!entry || typeof entry.position !== 'number') return null;
  return entry.position;
}

export function saveReadingPosition(
  viewerType: ViewerType,
  filePath: string,
  position: number,
): void {
  const store = loadStore();
  const cleaned = cleanup(store);
  const key = makeKey(viewerType, filePath);
  cleaned[key] = { position, updatedAt: Date.now() };
  saveStore(cleaned);
}
