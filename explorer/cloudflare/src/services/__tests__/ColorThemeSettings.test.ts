import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadColorTheme,
  saveColorTheme,
  resolveColorTheme,
  applyColorTheme,
  DEFAULT_COLOR_THEME,
  type ColorTheme,
} from '../ColorThemeSettings';

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

interface MatchMediaStub {
  media: { matches: boolean };
  setSystemLight: (value: boolean) => void;
  listenerCount: () => number;
}

function installDomStub(prefersLight: boolean): MatchMediaStub {
  const root = { dataset: {} as Record<string, string> };
  const listeners = new Set<() => void>();
  const media = { matches: prefersLight };

  (globalThis as { document?: unknown }).document = {
    documentElement: root,
  };
  (globalThis as { window?: unknown }).window = {
    matchMedia: (_query: string) => ({
      get matches() {
        return media.matches;
      },
      media: '(prefers-color-scheme: light)',
      addEventListener: (_type: string, cb: () => void) => {
        listeners.add(cb);
      },
      removeEventListener: (_type: string, cb: () => void) => {
        listeners.delete(cb);
      },
    }),
  };

  return {
    media,
    setSystemLight: (value: boolean) => {
      media.matches = value;
      for (const cb of listeners) cb();
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = createLocalStorageStub();
  (globalThis as { document?: unknown }).document = undefined;
  (globalThis as { window?: unknown }).window = undefined;
});

describe('ColorThemeSettings persistence', () => {
  it('defaults to dark to keep the current appearance', () => {
    expect(loadColorTheme()).toBe('dark');
    expect(DEFAULT_COLOR_THEME).toBe('dark');
  });

  it('round-trips all supported themes', () => {
    const themes: ColorTheme[] = ['system', 'light', 'dark'];
    for (const theme of themes) {
      saveColorTheme(theme);
      expect(loadColorTheme()).toBe(theme);
    }
  });

  it('falls back to dark on invalid JSON', () => {
    localStorage.setItem('homepilot.colorTheme', 'not-json');
    expect(loadColorTheme()).toBe('dark');
  });

  it('falls back to dark on unknown value', () => {
    localStorage.setItem('homepilot.colorTheme', JSON.stringify('blue'));
    expect(loadColorTheme()).toBe('dark');
  });
});

describe('resolveColorTheme', () => {
  it('passes explicit themes through', () => {
    expect(resolveColorTheme('light', true)).toBe('light');
    expect(resolveColorTheme('light', false)).toBe('light');
    expect(resolveColorTheme('dark', true)).toBe('dark');
    expect(resolveColorTheme('dark', false)).toBe('dark');
  });

  it('follows prefers-color-scheme for system', () => {
    expect(resolveColorTheme('system', true)).toBe('light');
    expect(resolveColorTheme('system', false)).toBe('dark');
  });
});

describe('applyColorTheme', () => {
  it('sets data-theme for explicit light/dark without reloading', () => {
    const stub = installDomStub(false);
    applyColorTheme('light');
    expect(document.documentElement.dataset.theme).toBe('light');
    applyColorTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(stub.listenerCount()).toBe(0);
  });

  it('resolves system against the OS preference', () => {
    installDomStub(true);
    applyColorTheme('system');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('follows realtime OS changes while system is selected', () => {
    const stub = installDomStub(false);
    applyColorTheme('system');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(stub.listenerCount()).toBe(1);

    stub.setSystemLight(true);
    expect(document.documentElement.dataset.theme).toBe('light');
    stub.setSystemLight(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('detaches the system listener when switching to an explicit theme', () => {
    const stub = installDomStub(true);
    applyColorTheme('system');
    expect(stub.listenerCount()).toBe(1);

    applyColorTheme('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(stub.listenerCount()).toBe(0);

    // OS change must no longer affect the explicit selection
    stub.setSystemLight(false);
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('is a no-op without a document (SSR-safe)', () => {
    const spy = vi.fn();
    (globalThis as { document?: unknown }).document = undefined;
    expect(() => applyColorTheme('light')).not.toThrow();
    expect(spy).not.toHaveBeenCalled();
  });
});
