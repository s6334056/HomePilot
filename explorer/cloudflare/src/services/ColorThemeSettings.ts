const STORAGE_KEY = 'homepilot.colorTheme';

export type ColorTheme = 'system' | 'light' | 'dark';
export type ResolvedColorTheme = 'light' | 'dark';

export const DEFAULT_COLOR_THEME: ColorTheme = 'dark';

function isColorTheme(v: unknown): v is ColorTheme {
  return v === 'system' || v === 'light' || v === 'dark';
}

export function loadColorTheme(): ColorTheme {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLOR_THEME;
    const parsed = JSON.parse(raw);
    if (!isColorTheme(parsed)) return DEFAULT_COLOR_THEME;
    return parsed;
  } catch {
    return DEFAULT_COLOR_THEME;
  }
}

export function saveColorTheme(theme: ColorTheme): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // localStorage full or unavailable
  }
}

export function resolveColorTheme(
  theme: ColorTheme,
  prefersLight: boolean,
): ResolvedColorTheme {
  if (theme === 'system') return prefersLight ? 'light' : 'dark';
  return theme;
}

function systemPrefersLight(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: light)').matches
  );
}

// Detaches the previous prefers-color-scheme listener, if any.
let detachSystemListener: (() => void) | null = null;

/**
 * Apply the color theme to the document without a page reload.
 * Sets `data-theme="light|dark"` on <html>; index.css switches the
 * CSS custom properties accordingly.
 *
 * While the theme is 'system', follows OS light/dark changes in realtime.
 */
export function applyColorTheme(theme: ColorTheme): void {
  if (typeof document === 'undefined') return;

  if (detachSystemListener) {
    detachSystemListener();
    detachSystemListener = null;
  }

  const root = document.documentElement;
  root.dataset.theme = resolveColorTheme(theme, systemPrefersLight());

  if (
    theme === 'system' &&
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function'
  ) {
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => {
      root.dataset.theme = resolveColorTheme('system', mql.matches);
    };
    mql.addEventListener('change', handler);
    detachSystemListener = () => mql.removeEventListener('change', handler);
  }
}
