import { FileSystemItem } from '../domain/types';
import { FileSystemService } from './FileSystemService';
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

  public async getDirectory(path: string): Promise<FileSystemItem[]> {
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

    return node.children
      .map((c) => ({ ...c.item }))
      .sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });
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
}
