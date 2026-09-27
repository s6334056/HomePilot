const STORAGE_KEY = 'homepilot.g2StartupScreen';

export type G2StartupScreen = 'explorer' | 'agent' | 'history' | 'home';

export const DEFAULT_G2_STARTUP_SCREEN: G2StartupScreen = 'explorer';

function isG2StartupScreen(v: unknown): v is G2StartupScreen {
  return v === 'explorer' || v === 'agent' || v === 'history' || v === 'home';
}

export function loadG2StartupScreen(): G2StartupScreen {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_G2_STARTUP_SCREEN;
    const parsed = JSON.parse(raw);
    if (!isG2StartupScreen(parsed)) return DEFAULT_G2_STARTUP_SCREEN;
    return parsed;
  } catch {
    return DEFAULT_G2_STARTUP_SCREEN;
  }
}

export function saveG2StartupScreen(screen: G2StartupScreen): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(screen));
  } catch {
    // localStorage full or unavailable
  }
}

/**
 * Decide which page G2 Runtime should show at startup.
 * Falls back to the Explorer when the requested screen is unavailable
 * (no Gateway connection / no Agent controller) so the glasses always
 * land on a usable page.
 *
 * 'home' は既存値 (explorer/agent/history) と後方互換を保ちつつ追加した値。
 * Home はローカルファイルシステムのみで完結するため capability 条件を持たない。
 */
export function resolveG2StartupPage(
  screen: G2StartupScreen,
  capabilities: { hasGateway: boolean; hasAgent: boolean },
): 'explorer' | 'agent' | 'history' | 'home' {
  if (screen === 'home') return 'home';
  if (screen === 'history' && capabilities.hasGateway) return 'history';
  if (screen === 'agent' && capabilities.hasAgent) return 'agent';
  return 'explorer';
}
