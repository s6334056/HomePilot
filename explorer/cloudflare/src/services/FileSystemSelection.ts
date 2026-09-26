import { FileSystemService } from './FileSystemService';
import { GatewayFileSystemService } from './GatewayFileSystemService';
import { LocalFileSystemService } from './LocalFileSystemService';
import { MockFileSystemService } from './MockFileSystemService';
import { resolveConfig } from './ConnectionConfig';
import { ScreenType } from '../domain/types';

/**
 * Which file system the Explorer is currently browsing.
 *
 * - 'local'   アプリ (LocalFileSystemService, localStorage backed)
 * - 'gateway' 自宅PC (GatewayFileSystemService, Home Pilot Gateway)
 * - 'mock'    開発用モック (MockFileSystemService)
 *
 * `null` means no file system is selected yet — the user is on the Home screen.
 */
export type FileSystemMode = 'local' | 'gateway' | 'mock';

/** Screen shown before a file system is selected. */
export const HOME_SCREEN: ScreenType = 'home';

export const FILE_SYSTEM_LABELS: Record<FileSystemMode, string> = {
  local: 'アプリ',
  gateway: '自宅PC',
  mock: 'モック（開発用）',
};

/** The mock entry is only offered when the app is configured as mock. */
export function shouldShowMockOption(): boolean {
  return resolveConfig().mode === 'mock';
}

/** Mode implied by the build/localStorage configuration (gateway when configured, otherwise mock). */
export function defaultConfiguredMode(): FileSystemMode {
  return resolveConfig().mode === 'gateway' ? 'gateway' : 'mock';
}

export function createFileSystemService(mode: FileSystemMode): FileSystemService {
  if (mode === 'local') {
    return new LocalFileSystemService();
  }
  if (mode === 'gateway') {
    const config = resolveConfig();
    return new GatewayFileSystemService(config.gatewayUrl, config.gatewayToken);
  }
  return new MockFileSystemService();
}

/**
 * A gateway connection that is ready to be used as a copy destination.
 *
 * `initialize()` has to finish first: until it does `getRootPath()` reports an
 * empty string, and every planned path would be built against no root at all.
 * The caller must not start planning or copying before this resolves.
 */
export async function createInitializedGatewayService(): Promise<GatewayFileSystemService> {
  const service = createFileSystemService('gateway');
  if (!(service instanceof GatewayFileSystemService)) {
    throw new Error('自宅PC（Gateway）を作成できませんでした。');
  }
  await service.initialize();
  if (!service.isAvailable || !service.getRootPath()) {
    throw new Error('自宅PC（Gateway）に接続できませんでした。');
  }
  return service;
}

/**
 * Whether the Explorer back button should leave the file system (Home)
 * instead of moving to the parent directory.
 */
export function resolveExplorerBackTarget(
  service: FileSystemService,
  path: string,
): 'home' | 'parent' {
  const parent = service.getParentPath(path);
  return parent === path ? 'home' : 'parent';
}
