import { FileViewHistoryEntry } from '../domain/types';
import { HistoryAccess } from './HistoryAccess';
import { LocalFileSystemService } from './LocalFileSystemService';

const STORAGE_KEY = 'homepilot.localFileHistory';

export const LOCAL_HISTORY_MAX_ENTRIES = 30;

function isHistoryEntry(value: unknown): value is FileViewHistoryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.path === 'string' && typeof entry.lastViewedAt === 'number';
}

export function getHistory(): FileViewHistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

function save(history: FileViewHistoryEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch {
    // localStorage unavailable — silently ignore
  }
}

export function addToHistory(path: string): void {
  const next = getHistory().filter((entry) => entry.path !== path);
  next.unshift({ path, lastViewedAt: Date.now() });
  save(next.slice(0, LOCAL_HISTORY_MAX_ENTRIES));
}

export function removeFromHistory(path: string): void {
  const current = getHistory();
  const next = current.filter((entry) => entry.path !== path);
  if (next.length !== current.length) {
    save(next);
  }
}

export function clearHistory(): void {
  save([]);
}

export async function checkHistoryFilesExist(
  service: LocalFileSystemService,
  history: FileViewHistoryEntry[],
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const checks = history.map(async (entry) => {
    const item = await service.getItem(entry.path);
    results.set(entry.path, item !== null);
  });
  await Promise.allSettled(checks);
  return results;
}

export function createLocalHistoryAccess(service: LocalFileSystemService): HistoryAccess {
  return {
    addToHistory: async (path) => {
      addToHistory(path);
    },
    getHistory: async () => getHistory(),
    removeFromHistory: async (path) => {
      removeFromHistory(path);
    },
    checkFilesExist: (history) => checkHistoryFilesExist(service, history),
  };
}
