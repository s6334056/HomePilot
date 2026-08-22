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
}
