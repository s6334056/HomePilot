import { FileSystemItem } from '../domain/types';
import { FileSystemService, UploadItem, UploadResult } from './FileSystemService';
import { MOCK_FILE_SYSTEM_ROOT, MockFileSystemNode } from '../domain/mockData';

export class MockFileSystemService implements FileSystemService {
  private root: MockFileSystemNode = MOCK_FILE_SYSTEM_ROOT;

  public getRootPath(): string {
    return this.root.item.path;
  }

  public getParentPath(path: string): string {
    const normalized = path.replace(/\/+$/, '');
    if (normalized === this.getRootPath() || normalized === '' || normalized === '/') {
      return this.getRootPath();
    }
    const lastSlash = normalized.lastIndexOf('/');
    if (lastSlash <= 0) {
      return this.getRootPath();
    }
    return normalized.substring(0, lastSlash);
  }

  private findNode(path: string, current: MockFileSystemNode = this.root): MockFileSystemNode | null {
    const target = path.replace(/\/+$/, '');
    const curr = current.item.path.replace(/\/+$/, '');

    if (curr === target) {
      return current;
    }

    if (current.children) {
      for (const child of current.children) {
        const found = this.findNode(path, child);
        if (found) return found;
      }
    }
    return null;
  }

  public async getDirectory(path: string, sortMode?: 'default' | 'modified'): Promise<FileSystemItem[]> {
    await new Promise((resolve) => setTimeout(resolve, 30));

    const node = this.findNode(path);
    if (!node) {
      throw new Error(`Directory not found: ${path}`);
    }

    if (node.item.type !== 'directory') {
      throw new Error(`Path is not a directory: ${path}`);
    }

    if (!node.children) {
      return [];
    }

    const items = node.children.map((c) => ({ ...c.item }));
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
    await new Promise((resolve) => setTimeout(resolve, 30));

    const node = this.findNode(path);
    if (!node) {
      throw new Error(`File not found: ${path}`);
    }

    if (node.item.type !== 'file') {
      throw new Error(`Path is not a file: ${path}`);
    }

    return node.item.content ?? '(Empty file)';
  }

  public async getItem(path: string): Promise<FileSystemItem | null> {
    const node = this.findNode(path);
    return node ? { ...node.item } : null;
  }

  public async renameItem(path: string, newName: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const node = this.findNode(path);
    if (!node) throw new Error(`Not found: ${path}`);
    const parentPath = path.substring(0, path.lastIndexOf('/'));
    const newPath = parentPath + '/' + newName;
    node.item.name = newName;
    node.item.path = newPath;
    node.item.id = newPath;
    return newPath;
  }

  public async deleteItems(paths: string[]): Promise<{ deleted: number }> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    let deleted = 0;
    for (const p of paths) {
      const parentPath = p.substring(0, p.lastIndexOf('/'));
      const parentNode = this.findNode(parentPath);
      if (parentNode && parentNode.children) {
        const idx = parentNode.children.findIndex((c) => c.item.path === p);
        if (idx >= 0) {
          parentNode.children.splice(idx, 1);
          deleted++;
        }
      }
    }
    return { deleted };
  }

  public async createFolder(parentPath: string, name: string): Promise<string> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const parentNode = this.findNode(parentPath);
    if (!parentNode) throw new Error(`Parent not found: ${parentPath}`);
    if (parentNode.item.type !== 'directory') throw new Error(`Parent is not a directory: ${parentPath}`);
    if (!parentNode.children) parentNode.children = [];

    const newPath = parentPath === '/' ? `/${name}` : `${parentPath}/${name}`;
    const existing = parentNode.children.find((c) => c.item.path === newPath);
    if (existing) throw new Error('A file or directory with that name already exists.');

    const newNode: MockFileSystemNode = {
      item: {
        id: newPath,
        name,
        type: 'directory',
        path: newPath,
        modifiedAt: new Date().toISOString(),
      },
    };
    parentNode.children.push(newNode);
    return newPath;
  }

  public getDownloadUrl(_path: string): string | null {
    return null;
  }

  public async downloadItems(_paths: string[], _hasDirectory: boolean): Promise<{ blob?: Blob; url?: string }> {
    return {};
  }

  private getUniqueName(children: MockFileSystemNode[], name: string): string {
    const extIndex = name.lastIndexOf('.');
    const hasExt = extIndex > 0;
    const ext = hasExt ? name.slice(extIndex) : '';
    const base = hasExt ? name.slice(0, extIndex) : name;

    let candidate = name;
    let i = 2;
    while (children.some((c) => c.item.name === candidate)) {
      candidate = `${base} (${i})${ext}`;
      i++;
    }
    return candidate;
  }

  public async uploadItems(
    parentPath: string,
    files: UploadItem[],
    _onProgress?: (loaded: number, total: number) => void,
    _signal?: AbortSignal,
    options?: { overwrite?: boolean },
  ): Promise<UploadResult> {
    await new Promise((resolve) => setTimeout(resolve, 30));
    const parentNode = this.findNode(parentPath);
    if (!parentNode) throw new Error(`Parent not found: ${parentPath}`);
    if (parentNode.item.type !== 'directory') throw new Error(`Parent is not a directory: ${parentPath}`);
    if (!parentNode.children) parentNode.children = [];

    let uploaded = 0;
    const errors: Array<{ path: string; error: string }> = [];
    for (const item of files) {
      try {
        const content = await item.file.text();
        let finalName = item.file.name;
        const existing = parentNode.children.find((c) => c.item.name === finalName);
        if (existing) {
          if (existing.item.type === 'file' && options?.overwrite) {
            existing.item.content = content;
            existing.item.size = content.length;
            existing.item.modifiedAt = new Date().toISOString();
            uploaded++;
            continue;
          }
          finalName = this.getUniqueName(parentNode.children, finalName);
        }
        const newPath = parentPath === '/' ? `/${finalName}` : `${parentPath}/${finalName}`;
        parentNode.children.push({
          item: {
            id: newPath,
            name: finalName,
            type: 'file',
            path: newPath,
            size: content.length,
            mimeType: item.file.type || 'text/plain',
            modifiedAt: new Date().toISOString(),
            content,
          },
        });
        uploaded++;
      } catch (e: any) {
        errors.push({ path: item.file.name, error: e.message || 'Upload failed' });
      }
    }
    return { uploaded, errors };
  }
}
