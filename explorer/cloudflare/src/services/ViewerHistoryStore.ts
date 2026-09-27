import { FileViewHistoryEntry } from '../domain/types';
import { GatewayFileSystemService } from './GatewayFileSystemService';
import { HistoryAccess } from './HistoryAccess';

/**
 * ViewerHistoryStore manages file viewing history via Gateway API.
 * No localStorage fallback — Gateway is the Single Source of Truth.
 */

export async function getHistory(
  gatewayService: GatewayFileSystemService,
): Promise<FileViewHistoryEntry[]> {
  try {
    const state = await gatewayService.getViewerState();
    return state.history || [];
  } catch {
    return [];
  }
}

export async function addToHistory(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<void> {
  try {
    await gatewayService.patchHistory(filePath, Date.now());
  } catch {
    // Gateway unavailable — silently ignore
  }
}

export async function removeFromHistory(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<void> {
  try {
    await gatewayService.deleteHistory(filePath);
  } catch {
    // Gateway unavailable — silently ignore
  }
}

export async function checkHistoryFilesExist(
  gatewayService: GatewayFileSystemService,
  history: FileViewHistoryEntry[],
): Promise<Map<string, boolean>> {
  const results = new Map<string, boolean>();
  const checks = history.map(async (entry) => {
    const exists = await gatewayService.fileExists(entry.path);
    results.set(entry.path, exists);
  });
  await Promise.allSettled(checks);
  return results;
}

export function createGatewayHistoryAccess(
  gatewayService: GatewayFileSystemService,
): HistoryAccess {
  return {
    addToHistory: (path) => addToHistory(gatewayService, path),
    getHistory: () => getHistory(gatewayService),
    removeFromHistory: (path) => removeFromHistory(gatewayService, path),
    checkFilesExist: (history) => checkHistoryFilesExist(gatewayService, history),
  };
}
