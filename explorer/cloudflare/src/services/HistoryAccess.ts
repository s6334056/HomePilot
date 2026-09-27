import { FileViewHistoryEntry } from '../domain/types';

export interface HistoryAccess {
  addToHistory(path: string): Promise<void>;
  getHistory(): Promise<FileViewHistoryEntry[]>;
  removeFromHistory(path: string): Promise<void>;
  checkFilesExist(history: FileViewHistoryEntry[]): Promise<Map<string, boolean>>;
}
