const LAST_CHECKED_KEY = 'homepilot-session-lastChecked';
const PROCESSING_KEY = 'homepilot-processing-sessions';
const SETTINGS_KEY = 'homepilot-agent-settings';
const PROCESSING_TTL_MS = 24 * 60 * 60 * 1000;

export interface ProcessingEntry {
  startedAt: number;
}

export interface AgentSettings {
  selectedProjectID: string;
  selectedProviderID: string;
  selectedModelID: string;
}

function safeGetJSON<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function safeSetJSON(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage quota exceeded or unavailable
  }
}

/**
 * AgentStateStore provides persistent state storage for Agent processing
 * and unread tracking, shared between PWA and G2 via localStorage.
 *
 * Uses the same localStorage keys as useOpenCode.ts to ensure
 * PWA and G2 stay synchronized on:
 * - sessionLastChecked: which sessions have been viewed
 * - processingSessions: which sessions are in-progress
 *
 * Both apps run in the same browser origin, so localStorage is shared.
 */
export class AgentStateStore {
  private lastCheckedCache: Record<string, number> | null = null;
  private processingCache: Record<string, ProcessingEntry> | null = null;

  // ── LastChecked ──────────────────────────────────────────────

  loadLastChecked(): Record<string, number> {
    if (this.lastCheckedCache) return this.lastCheckedCache;
    const raw = safeGetJSON<Record<string, unknown>>(LAST_CHECKED_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      this.lastCheckedCache = {};
      return this.lastCheckedCache;
    }
    const result: Record<string, number> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === 'number') result[k] = v;
    }
    this.lastCheckedCache = result;
    return result;
  }

  saveLastChecked(map: Record<string, number>): void {
    this.lastCheckedCache = map;
    safeSetJSON(LAST_CHECKED_KEY, map);
  }

  setLastChecked(sessionID: string, timestamp: number): void {
    const map = this.loadLastChecked();
    map[sessionID] = timestamp;
    this.saveLastChecked(map);
  }

  removeLastChecked(sessionID: string): void {
    const map = this.loadLastChecked();
    delete map[sessionID];
    this.saveLastChecked(map);
  }

  // ── Processing Sessions ──────────────────────────────────────

  loadProcessing(): Record<string, ProcessingEntry> {
    if (this.processingCache) return this.processingCache;
    const raw = safeGetJSON<Record<string, unknown>>(PROCESSING_KEY);
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      this.processingCache = {};
      return this.processingCache;
    }
    const now = Date.now();
    const result: Record<string, ProcessingEntry> = {};
    for (const [k, v] of Object.entries(raw)) {
      const entry = v as ProcessingEntry;
      if (
        entry &&
        typeof entry.startedAt === 'number' &&
        now - entry.startedAt < PROCESSING_TTL_MS
      ) {
        result[k] = entry;
      }
    }
    this.processingCache = result;
    return result;
  }

  saveProcessing(map: Record<string, ProcessingEntry>): void {
    this.processingCache = map;
    safeSetJSON(PROCESSING_KEY, map);
  }

  markProcessing(sessionID: string): void {
    const map = this.loadProcessing();
    map[sessionID] = { startedAt: Date.now() };
    this.saveProcessing(map);
  }

  clearProcessing(sessionID: string): void {
    const map = this.loadProcessing();
    delete map[sessionID];
    this.saveProcessing(map);
  }

  // ── Agent Settings ───────────────────────────────────────────

  loadSettings(): AgentSettings {
    const raw = safeGetJSON<AgentSettings>(SETTINGS_KEY);
    if (raw) return raw;
    return {
      selectedProjectID: 'global',
      selectedProviderID: 'opencode',
      selectedModelID: 'mimo-v2.5-free',
    };
  }

  saveSettings(settings: AgentSettings): void {
    safeSetJSON(SETTINGS_KEY, settings);
  }

  // ── Bulk operations ──────────────────────────────────────────

  getProcessingIDs(): string[] {
    return Object.keys(this.loadProcessing());
  }

  /**
   * Clean up lastChecked entries for sessions that no longer exist.
   */
  pruneLastChecked(activeSessionIDs: Set<string>): void {
    const map = this.loadLastChecked();
    let changed = false;
    for (const id of Object.keys(map)) {
      if (!activeSessionIDs.has(id)) {
        delete map[id];
        changed = true;
      }
    }
    if (changed) this.saveLastChecked(map);
  }
}
