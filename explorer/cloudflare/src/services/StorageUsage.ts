import { LOCAL_FS_STORAGE_KEY } from './LocalFileSystemService';

/**
 * 設定画面の「ストレージ」表示に使う値を読むだけのヘルパー。
 *
 * - A: `homepilot.localFileSystem` の JSON 文字列そのものの UTF-8 バイト数
 * - B: Local FileSystem に登録された file の内容サイズ合計 (size、無ければ content)
 * - C: `navigator.storage.estimate().usage`（ブラウザが返すサイト全体の概算値）
 *
 * 保存方式の変更は行わない。読み取りのみ。
 */

export interface LocalStorageUsage {
  /** A: homepilot.localFileSystem の JSON 文字列の UTF-8 バイト数（読めなければ null） */
  fileSystemBytes: number | null;
  /** B: file エントリの内容サイズ合計（読めなければ null） */
  fileContentBytes: number | null;
}

export interface StorageUsageInfo extends LocalStorageUsage {
  /**
   * C: `navigator.storage.estimate().usage`。
   * undefined = まだ取得中、null = 取得できなかった。
   */
  siteUsageBytes?: number | null;
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

/** ファイル1件のサイズ。size が無ければ content の UTF-8 バイト数で補完する。 */
function entryBytes(size: unknown, content: unknown): number {
  if (typeof size === 'number' && Number.isFinite(size) && size >= 0) return size;
  if (typeof content === 'string') return utf8ByteLength(content);
  return 0;
}

function sumFileContentBytes(entries: unknown): number {
  if (typeof entries !== 'object' || entries === null || Array.isArray(entries)) {
    throw new Error('Local file system data is not an object.');
  }
  let total = 0;
  for (const value of Object.values(entries as Record<string, unknown>)) {
    if (typeof value !== 'object' || value === null) continue;
    const entry = value as { type?: unknown; size?: unknown; content?: unknown };
    if (entry.type !== 'file') continue;
    total += entryBytes(entry.size, entry.content);
  }
  return total;
}

/** A + B。localStorage が読めない場合のみ null を返す。未保存は 0。 */
export function getLocalFileSystemUsage(): LocalStorageUsage {
  let raw: string | null;
  try {
    raw = localStorage.getItem(LOCAL_FS_STORAGE_KEY);
  } catch {
    return { fileSystemBytes: null, fileContentBytes: null };
  }
  if (raw === null) return { fileSystemBytes: 0, fileContentBytes: 0 };

  let fileContentBytes: number | null;
  try {
    fileContentBytes = sumFileContentBytes(JSON.parse(raw));
  } catch {
    fileContentBytes = null;
  }
  return {
    fileSystemBytes: utf8ByteLength(raw),
    fileContentBytes,
  };
}

/**
 * C。API が無い環境・非 secure context・エラー時は null（表示は「取得できません」）。
 * `quota` は localStorage の残容量ではないため取得しない。
 */
export async function getSiteStorageUsage(): Promise<number | null> {
  try {
    const storage = (typeof navigator === 'undefined' ? undefined : navigator)?.storage;
    if (!storage || typeof storage.estimate !== 'function') return null;
    const estimate = await storage.estimate();
    const usage = estimate?.usage;
    return typeof usage === 'number' && Number.isFinite(usage) ? usage : null;
  } catch {
    return null;
  }
}

/** 1024 単位。内部はバイトのまま持ち、表示時だけ変換する。 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** undefined = 取得中、null = 取得できません。 */
export function formatUsageValue(bytes: number | null | undefined): string {
  if (bytes === undefined) return '取得中...';
  if (bytes === null) return '取得できません';
  return formatBytes(bytes);
}
