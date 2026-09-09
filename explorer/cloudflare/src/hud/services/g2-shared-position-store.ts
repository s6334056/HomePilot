import { GatewayFileSystemService } from '../../services/GatewayFileSystemService';

/**
 * G2SharedPositionStore manages reading position via Gateway API.
 * Position is stored as a scroll progress ratio (0.0 ~ 1.0).
 * No localStorage fallback — Gateway is the Single Source of Truth.
 */

export async function getG2SharedPosition(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<number | null> {
  try {
    const state = await gatewayService.getViewerState();
    const entry = state.positions[filePath];
    return entry?.progress ?? null;
  } catch {
    return null;
  }
}

export async function saveG2SharedPosition(
  gatewayService: GatewayFileSystemService,
  filePath: string,
  progress: number,
): Promise<void> {
  try {
    await gatewayService.patchPosition(filePath, progress, Date.now());
  } catch {
    // Gateway unavailable — silently ignore
  }
}
