import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveG2InitialPage } from '../g2-runtime';
import {
  type G2StartupScreen,
  loadG2StartupScreen,
  saveG2StartupScreen,
} from '../../services/G2StartupScreenSettings';

const ALL_SCREENS: G2StartupScreen[] = ['explorer', 'history', 'agent', 'home'];

const CONNECTED = { hasGateway: true, hasAgent: true } as const;
const DISCONNECTED = { hasGateway: false, hasAgent: false } as const;

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

afterEach(() => {
  (globalThis as { localStorage?: unknown }).localStorage = undefined;
});

describe('G2起動画面の決定 (Gateway接続あり)', () => {
  it.each(ALL_SCREENS)('startupScreen=%s → %s', (screen) => {
    expect(resolveG2InitialPage(screen, CONNECTED)).toBe(screen);
  });

  it('Agent が無い場合は agent 設定でも従来どおり explorer にフォールバックする', () => {
    expect(resolveG2InitialPage('agent', { hasGateway: true, hasAgent: false })).toBe('explorer');
  });
});

describe('G2起動画面の決定 (Gateway接続なし)', () => {
  it.each(ALL_SCREENS)('startupScreen=%s → home', (screen) => {
    expect(resolveG2InitialPage(screen, DISCONNECTED)).toBe('home');
  });

  it('設定値 homepilot.g2StartupScreen を書き換えない', () => {
    saveG2StartupScreen('explorer');
    expect(resolveG2InitialPage('explorer', DISCONNECTED)).toBe('home');
    expect(loadG2StartupScreen()).toBe('explorer');
    expect(localStorage.getItem('homepilot.g2StartupScreen')).toBe('"explorer"');
  });
});

describe('G2起動画面の決定 (設定読み込み)', () => {
  it('保存済み設定がある場合はそれを採用する（Gateway接続時）', () => {
    saveG2StartupScreen('history');
    expect(resolveG2InitialPage(loadG2StartupScreen(), CONNECTED)).toBe('history');

    saveG2StartupScreen('agent');
    expect(resolveG2InitialPage(loadG2StartupScreen(), CONNECTED)).toBe('agent');

    saveG2StartupScreen('home');
    expect(resolveG2InitialPage(loadG2StartupScreen(), CONNECTED)).toBe('home');
  });

  it('保存済み設定がある場合も Gateway 接続なしなら home へフォールバックする', () => {
    saveG2StartupScreen('history');
    expect(resolveG2InitialPage(loadG2StartupScreen(), DISCONNECTED)).toBe('home');
  });

  it('未設定ならデフォルト explorer（Gateway接続時）', () => {
    expect(loadG2StartupScreen()).toBe('explorer');
    expect(resolveG2InitialPage(loadG2StartupScreen(), CONNECTED)).toBe('explorer');
  });
});
