import { FileSystemItem, SharedViewerState } from '../domain/types';
import { FileSystemService, UploadItem, UploadResult } from './FileSystemService';

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

  // ── Viewer State API ──────────────────────────────────────

  async getViewerState(): Promise<SharedViewerState> {
    const res = await this.request('/api/viewer-state');
    if (!res.ok) throw new Error(`Failed to get viewer state: ${res.status}`);
    return res.json();
  }

  async patchPosition(filePath: string, progress: number, updatedAt: number): Promise<void> {
    const res = await this.requestWithBody('PATCH', '/api/viewer-state/position', {
      filePath, progress, updatedAt,
    });
    if (!res.ok) throw new Error(`Failed to patch position: ${res.status}`);
  }

  async patchHistory(path: string, lastViewedAt: number): Promise<void> {
    const res = await this.requestWithBody('PATCH', '/api/viewer-state/history', {
      path, lastViewedAt,
    });
    if (!res.ok) throw new Error(`Failed to patch history: ${res.status}`);
  }

  async deleteHistory(path: string): Promise<void> {
    const encoded = encodeURIComponent(path);
    const res = await this.request(`/api/viewer-state/history?path=${encoded}`, 'DELETE');
    if (!res.ok) throw new Error(`Failed to delete history: ${res.status}`);
  }

  async fileExists(path: string): Promise<boolean> {
    try {
      const encoded = encodeURIComponent(path);
      const res = await this.request(`/api/fs/file?path=${encoded}`);
      // 200, 413, 415 = file exists (just can't read it fully)
      return res.ok || res.status === 413 || res.status === 415;
    } catch {
      return false;
    }
  }

  // ── Filesystem Operations ────────────────────────────────

  async renameItem(path: string, newName: string): Promise<string> {
    const res = await this.requestWithBody('POST', '/api/fs/rename', { path, newName });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to rename: ${res.status}`);
    }
    return data.path;
  }

  async deleteItems(paths: string[]): Promise<{ deleted: number }> {
    const res = await this.requestWithBody('POST', '/api/fs/delete', { paths });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to delete: ${res.status}`);
    }
    return { deleted: data.deleted };
  }

  async createFolder(parentPath: string, name: string): Promise<string> {
    const res = await this.requestWithBody('POST', '/api/fs/mkdir', { parentPath, name });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || `Failed to create folder: ${res.status}`);
    }
    return data.path;
  }

  getDownloadUrl(path: string): string | null {
    if (!this._isAvailable) return null;
    const encoded = encodeURIComponent(path);
    return `${this.baseUrl}/api/fs/download?path=${encoded}&token=${this.token}`;
  }

  async downloadItems(paths: string[], hasDirectory: boolean): Promise<{ blob?: Blob; url?: string }> {
    if (paths.length === 1 && !hasDirectory) {
      const url = this.getDownloadUrl(paths[0]);
      return { url: url || undefined };
    }
    const res = await this.requestWithBody('POST', '/api/fs/download', { paths });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error?.message || `Failed to download: ${res.status}`);
    }
    return { blob: await res.blob() };
  }

  async uploadItems(
    parentPath: string,
    files: UploadItem[],
    onProgress?: (loaded: number, total: number) => void,
    signal?: AbortSignal,
  ): Promise<UploadResult> {
    const formData = new FormData();
    formData.append('destPath', parentPath);

    for (const item of files) {
      formData.append('files', item.file, item.relativePath);
    }

    return new Promise<UploadResult>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open(
        'POST',
        `${this.baseUrl}/api/fs/upload?token=${encodeURIComponent(this.token)}`,
      );

      if (signal) {
        if (signal.aborted) {
          xhr.abort();
          reject(new DOMException('Aborted', 'AbortError'));
          return;
        }
        signal.addEventListener('abort', () => xhr.abort(), { once: true });
      }

      xhr.upload.onprogress = (e) => {
        if (onProgress && e.lengthComputable) {
          onProgress(e.loaded, e.total);
        }
      };

      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve({ uploaded: data.uploaded || 0, errors: data.errors || [] });
          } else {
            reject(new Error(data.error?.message || `Upload failed: ${xhr.status}`));
          }
        } catch {
          reject(new Error(`Upload failed: ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed: network error'));
      xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));

      xhr.send(formData);
    });
  }

  private async request(endpoint: string, method: string = 'GET'): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
      },
    });
  }

  private async requestWithBody(method: string, endpoint: string, body: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  }
}
