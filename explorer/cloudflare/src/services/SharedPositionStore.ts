import { GatewayFileSystemService } from './GatewayFileSystemService';

/**
 * SharedPositionStore manages reading position via Gateway API.
 * No localStorage fallback — Gateway is the Single Source of Truth.
 * If Gateway is unavailable, position operations silently fail.
 */

export async function getSharedPosition(
  gatewayService: GatewayFileSystemService,
  filePath: string,
): Promise<number | null> {
  try {
    const state = await gatewayService.getViewerState();
    const entry = state.positions[filePath];
    return entry?.logicalLine ?? null;
  } catch {
    return null;
  }
}

export async function saveSharedPosition(
  gatewayService: GatewayFileSystemService,
  filePath: string,
  logicalLine: number,
): Promise<void> {
  try {
    await gatewayService.patchPosition(filePath, logicalLine, Date.now());
  } catch {
    // Gateway unavailable — silently ignore
  }
}
