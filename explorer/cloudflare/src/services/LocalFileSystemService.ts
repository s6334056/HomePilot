import { FileSystemItem } from '../domain/types';
import {
  FileSystemService,
  MoveCopyItemResult,
  MoveCopyResult,
  UploadItem,
  UploadResult,
} from './FileSystemService';

const STORAGE_KEY = 'homepilot.localFileSystem';
const ROOT_PATH = '/';

/** A single virtual file or folder. Files carry their content inline. */
interface LocalEntry {
  type: 'file' | 'directory';
  name: string;
  parent: string;
  content?: string;
  size?: number; // bytes
  mimeType?: string;
  modifiedAt?: string; // ISO 8601
}

/** Flat map keyed by path — paths are always absolute and '/' separated. */
type LocalEntries = Record<string, LocalEntry>;

function createRootEntries(): LocalEntries {
  return { [ROOT_PATH]: { type: 'directory', name: '', parent: '' } };
}

function isEntry(value: unknown): value is LocalEntry {
  if (typeof value !== 'object' || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    (entry.type === 'file' || entry.type === 'directory') &&
    typeof entry.name === 'string' &&
    typeof entry.parent === 'string'
  );
}

function isEntries(value: unknown): value is LocalEntries {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entries = value as Record<string, unknown>;
  const root = entries[ROOT_PATH];
  if (!isEntry(root) || root.type !== 'directory') return false;
  return Object.keys(entries).every(
    (key) =>
      (key === ROOT_PATH || (key.startsWith('/') && !key.endsWith('/'))) && isEntry(entries[key]),
  );
}

function loadEntries(): LocalEntries {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createRootEntries();
    const parsed = JSON.parse(raw);
    if (!isEntries(parsed)) return createRootEntries();
    return parsed;
  } catch {
    // localStorage unavailable or corrupted — start from an empty file system.
    return createRootEntries();
  }
}

/**
 * Local paths are always absolute virtual paths rooted at '/'.
 * `memo.txt` → `/memo.txt`, `docs/test.txt` → `/docs/test.txt`,
 * `/docs//test.txt/` → `/docs/test.txt`.
 */
function normalizePath(path: string): string {
  const collapsed = path.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
  const trimmed = collapsed.replace(/\/+$/, '');
  if (trimmed === '') return ROOT_PATH;
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function joinPath(dir: string, name: string): string {
  return dir === ROOT_PATH ? `${ROOT_PATH}${name}` : `${dir}/${name}`;
}

function isValidName(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.trim() !== '' &&
    name !== '.' &&
    name !== '..' &&
    !/[\/\\]/.test(name)
  );
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

const MIME_TYPES: Record<string, string> = {
  '.txt': 'text/plain',
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.xml': 'application/xml',
};

/** Very small extension-based MIME guess for files created on this device. */
function guessMimeType(name: string): string | undefined {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return undefined;
  return MIME_TYPES[name.slice(dot).toLowerCase()];
}

function toItem(path: string, entry: LocalEntry): FileSystemItem {
  return {
    id: path,
    name: entry.name,
    type: entry.type,
    path,
    size: entry.size,
    mimeType: entry.mimeType,
    modifiedAt: entry.modifiedAt,
  };
}

function isInsideDirectory(parentDir: string, targetPath: string): boolean {
  const normParent = normalizePath(parentDir);
  const normTarget = normalizePath(targetPath);
  if (normParent === normTarget) return true;
  return normTarget.startsWith(normParent + '/');
}

/**
 * File system backed by `window.localStorage` only.
 *
 * This is the "アプリ" (this device) side of the FileSystemService
 * abstraction: no Gateway, no IndexedDB, no File System Access API.
 *
 * Every mutation builds a new entries record, persists it, and only then
 * replaces the live state — so a storage quota failure leaves the in-memory
 * file system untouched and surfaces as a normal rejected promise.
 */
export class LocalFileSystemService implements FileSystemService {
  private entries: LocalEntries;

  constructor() {
    this.entries = loadEntries();
  }

  private persist(entries: LocalEntries): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
    } catch (e: any) {
      throw new Error(`Local storage save failed: ${e?.message || e}`);
    }
    this.entries = entries;
  }

  private getEntry(path: string): LocalEntry | undefined {
    return this.entries[normalizePath(path)];
  }

  private childrenOf(entries: LocalEntries, dirPath: string): Array<[string, LocalEntry]> {
    return Object.entries(entries).filter(([, entry]) => entry.parent === dirPath);
  }

  public getRootPath(): string {
    return ROOT_PATH;
  }

  public getParentPath(path: string): string {
    const normalized = normalizePath(path);
    if (normalized === ROOT_PATH) return ROOT_PATH;
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) return ROOT_PATH;
    return normalized.substring(0, lastSlash);
  }

  public async getDirectory(path: string, sortMode?: 'default' | 'modified'): Promise<FileSystemItem[]> {
    const normalized = normalizePath(path);
    const entry = this.entries[normalized];
    if (!entry) {
      throw new Error(`Directory not found: ${path}`);
    }
    if (entry.type !== 'directory') {
      throw new Error(`Path is not a directory: ${path}`);
    }

    const items = this.childrenOf(this.entries, normalized).map(([childPath, child]) => toItem(childPath, child));
    if (sortMode === 'modified') {
      items.sort((a, b) => {
        const aTime = a.modifiedAt ? new Date(a.modifiedAt).getTime() : 0;
        const bTime = b.modifiedAt ? new Date(b.modifiedAt).getTime() : 0;
        if (aTime !== bTime) return bTime - aTime;
        return a.name.localeCompare(b.name);
      });
    } else {
      items.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
    }
    return items;
  }

  public async readFile(path: string): Promise<string> {
    const normalized = normalizePath(path);
    const entry = this.entries[normalized];
    if (!entry) {
      throw new Error(`File not found: ${path}`);
    }
    if (entry.type !== 'file') {
      throw new Error(`Path is not a file: ${path}`);
    }
    return entry.content ?? '';
  }

  public async writeFile(path: string, content: string): Promise<void> {
    const normalized = normalizePath(path);
    const existing = this.entries[normalized];

    if (existing && existing.type === 'directory') {
      throw new Error(`Path is not a file: ${path}`);
    }

    const next: LocalEntries = { ...this.entries };
    if (existing) {
      next[normalized] = {
        ...existing,
        content,
        size: byteLength(content),
        mimeType: guessMimeType(existing.name) ?? existing.mimeType,
        modifiedAt: new Date().toISOString(),
      };
    } else {
      const parent = this.getParentPath(normalized);
      const parentEntry = next[parent];
      if (!parentEntry) {
        throw new Error(`Parent directory not found: ${parent}`);
      }
      if (parentEntry.type !== 'directory') {
        throw new Error(`Parent is not a directory: ${parent}`);
      }
      const name = normalized.substring(normalized.lastIndexOf('/') + 1);
      if (!name) {
        throw new Error(`Invalid file path: ${path}`);
      }
      next[normalized] = {
        type: 'file',
        name,
        parent,
        content,
        size: byteLength(content),
        mimeType: guessMimeType(name),
        modifiedAt: new Date().toISOString(),
      };
    }

    this.persist(next);
  }

  public async getItem(path: string): Promise<FileSystemItem | null> {
    const entry = this.getEntry(path);
    if (!entry) return null;
    return toItem(normalizePath(path), entry);
  }

  public async renameItem(path: string, newName: string): Promise<string> {
    const normalized = normalizePath(path);
    const entry = this.entries[normalized];
    if (!entry) throw new Error(`Not found: ${path}`);
    if (normalized === ROOT_PATH) throw new Error('ルートフォルダは操作できません。');
    if (!isValidName(newName)) throw new Error('Invalid file name.');

    const newPath = joinPath(entry.parent, newName);
    if (newPath === normalized) return newPath;
    if (this.entries[newPath]) {
      throw new Error('A file or directory with that name already exists.');
    }

    this.persist(this.rewriteSubtree(this.entries, normalized, newPath, newName));
    return newPath;
  }

  public async deleteItems(paths: string[]): Promise<{ deleted: number }> {
    let next: LocalEntries | null = null;
    let deleted = 0;

    for (const p of paths) {
      const normalized = normalizePath(p);
      if (normalized === ROOT_PATH) continue;
      const base = next ?? this.entries;
      if (!base[normalized]) continue;
      next = this.removeSubtree(base, normalized);
      deleted++;
    }

    if (next) {
      this.persist(next);
    }
    return { deleted };
  }

  public async createFolder(parentPath: string, name: string): Promise<string> {
    const parent = normalizePath(parentPath);
    const parentEntry = this.entries[parent];
    if (!parentEntry) throw new Error(`Parent not found: ${parentPath}`);
    if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parentPath}`);
    if (!isValidName(name)) throw new Error('Invalid folder name.');

    const newPath = joinPath(parent, name);
    if (this.entries[newPath]) {
      throw new Error('A file or directory with that name already exists.');
    }

    this.persist({
      ...this.entries,
      [newPath]: { type: 'directory', name, parent, modifiedAt: new Date().toISOString() },
    });
    return newPath;
  }

  public async moveItems(paths: string[], destDir: string): Promise<MoveCopyResult> {
    return this.moveCopyItems(paths, destDir, 'move');
  }

  public async copyItems(paths: string[], destDir: string): Promise<MoveCopyResult> {
    return this.moveCopyItems(paths, destDir, 'copy');
  }

  private async moveCopyItems(paths: string[], destDir: string, mode: 'move' | 'copy'): Promise<MoveCopyResult> {
    const dest = normalizePath(destDir);
    const destEntry = this.entries[dest];
    if (!destEntry) throw new Error(`Destination not found: ${destDir}`);
    if (destEntry.type !== 'directory') throw new Error(`Destination is not a directory: ${destDir}`);

    let working = { ...this.entries };
    const results: MoveCopyItemResult[] = [];
    let processed = 0;
    let skipped = 0;
    let failed = 0;

    for (const source of paths) {
      try {
        const normalizedSource = normalizePath(source);
        const entry = working[normalizedSource];
        if (!entry) {
          results.push({ source, status: 'failed', error: 'File or directory not found.' });
          failed++;
          continue;
        }
        if (normalizedSource === ROOT_PATH) {
          results.push({ source, status: 'failed', error: 'ルートフォルダは操作できません。' });
          failed++;
          continue;
        }
        if (entry.type === 'directory' && isInsideDirectory(normalizedSource, dest)) {
          results.push({
            source,
            status: 'failed',
            error: 'フォルダ自身またはその配下へは移動・複製できません。',
          });
          failed++;
          continue;
        }
        if (mode === 'move' && entry.parent === dest) {
          results.push({ source, status: 'skipped', error: '移動先が同じ場所です。' });
          skipped++;
          continue;
        }

        const uniqueName = this.getUniqueName(working, dest, entry.name);
        const destPath = joinPath(dest, uniqueName);

        if (mode === 'move') {
          working = this.rewriteSubtree(working, normalizedSource, destPath, uniqueName);
          results.push({ source, dest: destPath, status: 'moved' });
        } else {
          working = this.copySubtree(working, normalizedSource, destPath, uniqueName);
          results.push({ source, dest: destPath, status: 'copied' });
        }
        processed++;
      } catch (e: any) {
        results.push({ source, status: 'failed', error: e.message || 'Operation failed' });
        failed++;
      }
    }

    if (processed > 0) {
      this.persist(working);
    }
    return { processed, skipped, failed, results };
  }

  public getDownloadUrl(_path: string): string | null {
    return null;
  }

  public async downloadItems(_paths: string[], _hasDirectory: boolean): Promise<{ blob?: Blob; url?: string }> {
    return {};
  }

  public async uploadItems(
    parentPath: string,
    files: UploadItem[],
    _onProgress?: (loaded: number, total: number) => void,
    _signal?: AbortSignal,
    options?: { overwrite?: boolean },
  ): Promise<UploadResult> {
    const parent = normalizePath(parentPath);
    const parentEntry = this.entries[parent];
    if (!parentEntry) throw new Error(`Parent not found: ${parentPath}`);
    if (parentEntry.type !== 'directory') throw new Error(`Parent is not a directory: ${parentPath}`);

    let working = { ...this.entries };
    let uploaded = 0;
    const errors: Array<{ path: string; error: string }> = [];

    for (const item of files) {
      try {
        const content = await item.file.text();
        let name = item.file.name;
        const existingPath = joinPath(parent, name);
        const existing = working[existingPath];
        if (existing) {
          if (existing.type === 'file' && options?.overwrite) {
            working = {
              ...working,
              [existingPath]: {
                ...existing,
                content,
                size: byteLength(content),
                modifiedAt: new Date().toISOString(),
              },
            };
            uploaded++;
            continue;
          }
          name = this.getUniqueName(working, parent, name);
        }
        const newPath = joinPath(parent, name);
        working = {
          ...working,
          [newPath]: {
            type: 'file',
            name,
            parent,
            content,
            size: byteLength(content),
            mimeType: item.file.type || 'text/plain',
            modifiedAt: new Date().toISOString(),
          },
        };
        uploaded++;
      } catch (e: any) {
        errors.push({ path: item.file.name, error: e.message || 'Upload failed' });
      }
    }

    if (uploaded > 0) {
      this.persist(working);
    }
    return { uploaded, errors };
  }

  // ── Path helpers ──────────────────────────────────────────

  /** Moves `oldPath` (and everything below it) to `newPath`, returning a new record. */
  private rewriteSubtree(
    entries: LocalEntries,
    oldPath: string,
    newPath: string,
    newName?: string,
  ): LocalEntries {
    const next: LocalEntries = {};
    const prefix = oldPath + '/';

    for (const [key, entry] of Object.entries(entries)) {
      let nextKey = key;
      if (key === oldPath) nextKey = newPath;
      else if (key.startsWith(prefix)) nextKey = newPath + key.slice(oldPath.length);

      const nextEntry: LocalEntry = {
        ...entry,
        parent: key === oldPath ? this.getParentPath(newPath) : this.rebasePath(entry.parent, oldPath, newPath),
      };
      if (key === oldPath && newName !== undefined) {
        nextEntry.name = newName;
      }
      next[nextKey] = nextEntry;
    }
    return next;
  }

  /** Clones `oldPath` (and everything below it) to `newPath`, keeping the source. */
  private copySubtree(
    entries: LocalEntries,
    oldPath: string,
    newPath: string,
    newName: string,
  ): LocalEntries {
    const next: LocalEntries = { ...entries };
    const prefix = oldPath + '/';

    for (const [key, entry] of Object.entries(entries)) {
      if (key === oldPath) {
        next[newPath] = {
          ...entry,
          name: newName,
          parent: this.getParentPath(newPath),
        };
      } else if (key.startsWith(prefix)) {
        const nextKey = newPath + key.slice(oldPath.length);
        next[nextKey] = { ...entry, parent: this.rebasePath(entry.parent, oldPath, newPath) };
      }
    }
    return next;
  }

  private removeSubtree(entries: LocalEntries, path: string): LocalEntries {
    const next: LocalEntries = {};
    const prefix = path + '/';
    for (const [key, entry] of Object.entries(entries)) {
      if (key === path || key.startsWith(prefix)) continue;
      next[key] = entry;
    }
    return next;
  }

  private rebasePath(parent: string, oldPath: string, newPath: string): string {
    if (parent === oldPath) return newPath;
    if (parent.startsWith(oldPath + '/')) return newPath + parent.slice(oldPath.length);
    return parent;
  }

  private getUniqueName(entries: LocalEntries, destDir: string, name: string): string {
    const children = this.childrenOf(entries, destDir);
    const extIndex = name.lastIndexOf('.');
    const hasExt = extIndex > 0;
    const ext = hasExt ? name.slice(extIndex) : '';
    const base = hasExt ? name.slice(0, extIndex) : name;

    let candidate = name;
    let i = 2;
    while (children.some(([, entry]) => entry.name === candidate)) {
      candidate = `${base} (${i})${ext}`;
      i++;
    }
    return candidate;
  }
}
