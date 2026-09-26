import { describe, it, expect } from 'vitest';
import { ScreenType } from '../../domain/types';
import { GatewayFileSystemService } from '../GatewayFileSystemService';
import { LocalFileSystemService } from '../LocalFileSystemService';
import { MockFileSystemService } from '../MockFileSystemService';
import {
  FILE_SYSTEM_LABELS,
  HOME_SCREEN,
  createFileSystemService,
  defaultConfiguredMode,
  resolveExplorerBackTarget,
} from '../FileSystemSelection';

describe('Home / file system selection', () => {
  it('exposes the Home screen as a ScreenType', () => {
    const screen: ScreenType = HOME_SCREEN;
    expect(screen).toBe('home');
  });

  it('labels every mode', () => {
    expect(FILE_SYSTEM_LABELS.local).toBe('アプリ');
    expect(FILE_SYSTEM_LABELS.gateway).toBe('自宅PC');
    expect(FILE_SYSTEM_LABELS.mock).toBe('モック（開発用）');
  });

  it('creates LocalFileSystemService for "アプリ"', () => {
    const service = createFileSystemService('local');
    expect(service).toBeInstanceOf(LocalFileSystemService);
    expect(service.getRootPath()).toBe('/');
  });

  it('creates MockFileSystemService for the mock mode', () => {
    const service = createFileSystemService('mock');
    expect(service).toBeInstanceOf(MockFileSystemService);
    expect(service.getRootPath()).toBe('/home');
  });

  it('creates an uninitialized GatewayFileSystemService for "自宅PC"', () => {
    const service = createFileSystemService('gateway');
    expect(service).toBeInstanceOf(GatewayFileSystemService);
    expect((service as GatewayFileSystemService).isAvailable).toBe(false);
    expect(service.getRootPath()).toBe('');
  });

  it('derives the reconnect mode from the configuration', () => {
    expect(['gateway', 'mock']).toContain(defaultConfiguredMode());
  });
});

describe('resolveExplorerBackTarget', () => {
  it('goes Home from the Local root', () => {
    const service = createFileSystemService('local');
    expect(resolveExplorerBackTarget(service, '/')).toBe('home');
  });

  it('goes to the parent inside Local', () => {
    const service = createFileSystemService('local');
    expect(resolveExplorerBackTarget(service, '/docs')).toBe('parent');
  });

  it('goes Home from the Mock root', () => {
    const service = createFileSystemService('mock');
    expect(resolveExplorerBackTarget(service, '/home')).toBe('home');
  });

  it('goes to the parent inside Mock', () => {
    const service = createFileSystemService('mock');
    expect(resolveExplorerBackTarget(service, '/home/docs')).toBe('parent');
  });

  it('goes Home from the Gateway root', () => {
    const service = createFileSystemService('gateway');
    expect(resolveExplorerBackTarget(service, service.getRootPath())).toBe('home');
  });
});
