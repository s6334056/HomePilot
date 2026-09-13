import { FileSystemItem } from '../domain/types';

/**
 * Abstract interface for File System operations.
 * Allows seamless switching between MockFileSystemService and GatewayFileSystemService.
 */
export interface FileSystemService {
  getDirectory(path: string): Promise<FileSystemItem[]>;
  readFile(path: string): Promise<string>;
  getItem(path: string): Promise<FileSystemItem | null>;
  getParentPath(path: string): string;
  getRootPath(): string;
  renameItem(path: string, newName: string): Promise<string>;
  deleteItems(paths: string[]): Promise<{ deleted: number }>;
  createFolder(parentPath: string, name: string): Promise<string>;
  getDownloadUrl(path: string): string | null;
  downloadItems(paths: string[], hasDirectory: boolean): Promise<{ blob?: Blob; url?: string }>;
}
