const STORAGE_KEY = 'homepilot-connection';

export interface ConnectionConfig {
  type: 'homepilot-connection';
  version: number;
  url: string;
  token: string;
}

export interface ResolvedConfig {
  mode: 'gateway' | 'mock';
  gatewayUrl: string;
  gatewayToken: string;
}

function isConnectionConfig(obj: unknown): obj is ConnectionConfig {
  if (typeof obj !== 'object' || obj === null) return false;
  const c = obj as Record<string, unknown>;
  return (
    c.type === 'homepilot-connection' &&
    c.version === 1 &&
    typeof c.url === 'string' &&
    typeof c.token === 'string' &&
    c.url.length > 0 &&
    c.token.length > 0
  );
}

export function loadConnectionConfig(): ConnectionConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!isConnectionConfig(parsed)) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function saveConnectionConfig(config: ConnectionConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function clearConnectionConfig(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function resolveConfig(): ResolvedConfig {
  const saved = loadConnectionConfig();
  if (saved) {
    return {
      mode: 'gateway',
      gatewayUrl: saved.url,
      gatewayToken: saved.token,
    };
  }

  const envMode = import.meta.env.VITE_FILE_SERVICE_MODE || 'mock';
  const envUrl = import.meta.env.VITE_GATEWAY_URL || 'http://127.0.0.1:51887';
  const envToken = import.meta.env.VITE_GATEWAY_TOKEN || '';

  if (envMode === 'gateway' && envToken) {
    return {
      mode: 'gateway',
      gatewayUrl: envUrl,
      gatewayToken: envToken,
    };
  }

  return {
    mode: 'mock',
    gatewayUrl: envUrl,
    gatewayToken: '',
  };
}

export function getStoredUrl(): string {
  const saved = loadConnectionConfig();
  return saved?.url || '';
}

export function getStoredToken(): string {
  const saved = loadConnectionConfig();
  return saved?.token || '';
}

export function isConnected(): boolean {
  const saved = loadConnectionConfig();
  return saved !== null;
}
