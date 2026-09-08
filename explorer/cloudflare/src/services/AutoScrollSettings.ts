const STORAGE_KEY = 'homepilot.autoScroll';

export type AutoScrollInterval = 20 | 30 | 40;
export type AutoScrollAmount = 'small' | 'normal' | 'large';

export interface AutoScrollSettings {
  interval: AutoScrollInterval;
  amount: AutoScrollAmount;
}

const DEFAULT_SETTINGS: AutoScrollSettings = {
  interval: 30,
  amount: 'normal',
};

function isAutoScrollInterval(v: unknown): v is AutoScrollInterval {
  return v === 20 || v === 30 || v === 40;
}

function isAutoScrollAmount(v: unknown): v is AutoScrollAmount {
  return v === 'small' || v === 'normal' || v === 'large';
}

function isAutoScrollSettings(obj: unknown): obj is AutoScrollSettings {
  if (typeof obj !== 'object' || obj === null) return false;
  const s = obj as Record<string, unknown>;
  return isAutoScrollInterval(s.interval) && isAutoScrollAmount(s.amount);
}

export function loadAutoScrollSettings(): AutoScrollSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    if (!isAutoScrollSettings(parsed)) return { ...DEFAULT_SETTINGS };
    return parsed;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveAutoScrollSettings(settings: AutoScrollSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // localStorage full or unavailable
  }
}
