import { GatewayFileSystemService } from '../../services/GatewayFileSystemService';

/**
 * G2SharedPositionStore manages reading position via Gateway API.
 * G2 uses logicalLine directly (no pixel conversion needed).
 * No localStorage fallback — Gateway is the Single Source of Truth.
 */

export async function getG2SharedPosition(
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

export async function saveG2SharedPosition(
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
