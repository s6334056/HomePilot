import { FileViewHistoryEntry } from '../../domain/types';
import { GatewayFileSystemService } from '../../services/GatewayFileSystemService';

/**
 * G2ViewerHistoryStore manages file viewing history via Gateway API.
 * No localStorage fallback — Gateway is the Single Source of Truth.
 */

export async function getG2History(
  gatewayService: GatewayFileSystemService,
): Promise<FileViewHistoryEntry[]> {
  try {
    const state = await gatewayService.getViewerState();
    return state.history || [];
  } catch {
    return [];
  }
}

export async function addG2ToHistory(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<void> {
  try {
    await gatewayService.patchHistory(filePath, Date.now());
  } catch {
    // Gateway unavailable — silently ignore
  }
}

export async function removeG2FromHistory(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<void> {
  try {
    await gatewayService.deleteHistory(filePath);
  } catch {
    // Gateway unavailable — silently ignore
  }
}
