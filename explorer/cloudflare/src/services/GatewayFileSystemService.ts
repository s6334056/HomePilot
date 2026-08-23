import { FileSystemItem } from '../domain/types';
import { FileSystemService } from './FileSystemService';

export class GatewayFileSystemService implements FileSystemService {
  private baseUrl: string;
  private token: string;
  private rootPath: string;
  private _isAvailable: boolean = false;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
    this.rootPath = '';
  }

  async initialize(): Promise<void> {
    try {
      const res = await this.request('/api/fs/root');
      if (!res.ok) throw new Error(`Failed to initialize gateway: ${res.status}`);
      const data = await res.json();
      this.rootPath = data.path;
      this._isAvailable = true;
    } catch (e) {
      console.warn('[GatewayFileSystemService] Gateway unavailable:', e);
      this.rootPath = '';
      this._isAvailable = false;
    }
  }

  get isAvailable(): boolean {
    return this._isAvailable;
  }

  getRootPath(): string {
    return this.rootPath;
  }

  getParentPath(path: string): string {
    const normalized = path.replace(/[\/\\]+$/, '');
    if (normalized === this.rootPath || normalized === '' || normalized === '/') {
      return this.rootPath;
    }

    const isWindows = /^[A-Z]:\\/i.test(normalized) || normalized.startsWith('\\');
    const lastSep = isWindows ? normalized.lastIndexOf('\\') : normalized.lastIndexOf('/');

    if (lastSep <= 0) {
      return this.rootPath;
    }

    return normalized.substring(0, lastSep);
  }

  async getDirectory(path: string): Promise<FileSystemItem[]> {
    const encoded = encodeURIComponent(path);
    const res = await this.request(`/api/fs/directory?path=${encoded}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to read directory: ${res.status}`);
    }

    return (data.items || []).map((item: any) => ({
      id: item.path,
      name: item.name,
      type: item.type,
      path: item.path,
      size: item.size ?? undefined,
      modifiedAt: item.modifiedAt ?? undefined,
    }));
  }

  async readFile(path: string): Promise<string> {
    const encoded = encodeURIComponent(path);
    const res = await this.request(`/api/fs/file?path=${encoded}`);
    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to read file: ${res.status}`);
    }

    return data.content || '';
  }

  async getItem(path: string): Promise<FileSystemItem | null> {
    try {
      const encoded = encodeURIComponent(path);
      const dirRes = await this.request(`/api/fs/directory?path=${encoded}`);

      if (dirRes.ok) {
        return {
          id: path,
          name: path.split(/[\/\\]/).pop() || '',
          type: 'directory',
          path,
        };
      }

      const fileRes = await this.request(`/api/fs/file?path=${encoded}`);
      if (fileRes.ok) {
        return {
          id: path,
          name: path.split(/[\/\\]/).pop() || '',
          type: 'file',
          path,
        };
      }

      if (fileRes.status === 413 || fileRes.status === 415) {
        return {
          id: path,
          name: path.split(/[\/\\]/).pop() || '',
          type: 'file',
          path,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  private async request(endpoint: string): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
  }
}
