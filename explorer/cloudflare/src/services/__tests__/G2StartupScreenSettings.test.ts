import { describe, it, expect, beforeEach } from 'vitest';
import {
  loadG2StartupScreen,
  saveG2StartupScreen,
  resolveG2StartupPage,
  DEFAULT_G2_STARTUP_SCREEN,
  type G2StartupScreen,
} from '../G2StartupScreenSettings';

function createLocalStorageStub() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
});

describe('G2StartupScreenSettings persistence', () => {
  it('defaults to explorer when nothing is stored', () => {
    expect(loadG2StartupScreen()).toBe('explorer');
    expect(DEFAULT_G2_STARTUP_SCREEN).toBe('explorer');
  });

  it('round-trips all supported screens', () => {
    const screens: G2StartupScreen[] = ['explorer', 'agent', 'history'];
    for (const screen of screens) {
      saveG2StartupScreen(screen);
      expect(loadG2StartupScreen()).toBe(screen);
    }
  });

  it('falls back to explorer on invalid JSON', () => {
    localStorage.setItem('homepilot.g2StartupScreen', '{not-json');
    expect(loadG2StartupScreen()).toBe('explorer');
  });

  it('falls back to explorer on unknown value', () => {
    localStorage.setItem('homepilot.g2StartupScreen', JSON.stringify('invalid'));
    expect(loadG2StartupScreen()).toBe('explorer');
  });
});

describe('resolveG2StartupPage', () => {
  it('returns explorer for the default setting', () => {
    expect(
      resolveG2StartupPage('explorer', { hasGateway: true, hasAgent: true }),
    ).toBe('explorer');
  });

  it('returns history when history is selected and Gateway is available', () => {
    expect(
      resolveG2StartupPage('history', { hasGateway: true, hasAgent: false }),
    ).toBe('history');
  });

  it('falls back to explorer for history without Gateway', () => {
    expect(
      resolveG2StartupPage('history', { hasGateway: false, hasAgent: true }),
    ).toBe('explorer');
  });

  it('returns agent when agent is selected and the controller is available', () => {
    expect(
      resolveG2StartupPage('agent', { hasGateway: true, hasAgent: true }),
    ).toBe('agent');
  });

  it('falls back to explorer for agent without the agent controller', () => {
    expect(
      resolveG2StartupPage('agent', { hasGateway: true, hasAgent: false }),
    ).toBe('explorer');
  });
});
