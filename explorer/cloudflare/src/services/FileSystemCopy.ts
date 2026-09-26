import { FileSystemService } from './FileSystemService';

/**
 * Cross-file system copy in either direction — home PC → this device and
 * this device → home PC. The two services are passed in explicitly, so the
 * same code plans and runs both directions.
 *
 * `copyItems()` in `FileSystemService` is a *same* file system operation
 * (copy into a directory of the same service), so it is deliberately not
 * reused here. Instead the two services stay completely independent and the
 * only thing that flows between them is plain file content:
 *
 *     source.readFile(path)  →  content  →  target.writeFile(path, content)
 *
 * The source layout is never carried over — only the selected item's own name
 * decides where it lands, so everything goes straight into the target root:
 *
 *     /some/deep/test.txt        →  <target root>/test.txt
 *     /some/deep/MyNotes/        →  <target root>/MyNotes/   (structure kept)
 *
 * The source side is read through `getDirectory()` / `readFile()`, the target
 * side is written through `createFolder()` / `writeFile()`, so the copied
 * result is an ordinary target file system object (target metadata, target
 * storage) rather than a translated record from the source.
 *
 * Only the wording of the conflict errors follows the direction, via
 * `CopyOptions.targetLabel`.
 */

/** What already occupies the target path. */
export type ExistingTarget = 'none' | 'file' | 'directory';

export type CopyPlanEntryType = 'file' | 'directory';

export interface PlannedPath {
  sourcePath: string;
  targetPath: string;
}

export interface FolderContents {
  /** Every folder to create, the copied folder first and always parent before child. */
  folders: PlannedPath[];
  /** Every file to copy. */
  files: PlannedPath[];
}

export interface CopyPlanItem {
  /** Path in the source file system, e.g. `C:\hp\project\src`. */
  sourcePath: string;
  /** Where it lands on the target: `<target root>/<item name>`, e.g. `/project/src`. */
  targetPath: string;
  /** Item name, for dialogs and notifications. */
  name: string;
  type: CopyPlanEntryType;
  /** What already sits at `targetPath`. Directories are only planned when it is `none`. */
  existing: ExistingTarget;
  /** Set only for `type === 'directory'`. */
  contents?: FolderContents;
}

export interface CopyFileResult {
  sourcePath: string;
  targetPath: string;
}

export interface CopyOptions {
  /**
   * What the destination file system is called in error messages.
   * Defaults to `アプリ`, which keeps the home PC → this device wording
   * exactly as it was before the direction became configurable.
   */
  targetLabel?: string;
}

const DEFAULT_TARGET_LABEL = 'アプリ';

function normalizeSeparators(path: string): string {
  return path.replace(/\\/g, '/');
}

function isWindowsRoot(root: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(root) || root.startsWith('\\');
}

function basename(path: string): string {
  const parts = normalizeSeparators(path).split('/').filter((p) => p !== '');
  return parts.length > 0 ? parts[parts.length - 1] : path;
}

/**
 * Path of `path` relative to `root` as a '/' separated string without a
 * leading '/'. Returns null when `path` is the root itself or lies outside it.
 */
export function relativePathWithin(root: string, path: string): string | null {
  const normPath = normalizeSeparators(path).replace(/\/+$/, '');
  const normRoot = normalizeSeparators(root).replace(/\/+$/, '');
  const caseInsensitive = isWindowsRoot(root);

  // '/' and '' both denote "the very top".
  const prefix = normRoot === '' || normRoot === '/' ? '/' : `${normRoot}/`;
  const haystack = caseInsensitive ? normPath.toLowerCase() : normPath;
  const needle = caseInsensitive ? prefix.toLowerCase() : prefix;

  if (!haystack.startsWith(needle)) return null;
  const relative = normPath.slice(prefix.length);
  return relative === '' ? null : relative;
}

/** Join a '/' separated relative path onto a file system root. */
export function joinRootPath(root: string, relative: string): string {
  const rel = normalizeSeparators(relative).replace(/^\/+/, '');
  const base = root.replace(/[\/\\]+$/, '');
  if (base === '') return `/${rel}`;
  if (isWindowsRoot(root)) return `${base}\\${rel.split('/').join('\\')}`;
  return `${base}/${rel}`;
}

/**
 * Create every missing folder on the way to `dirPath`.
 * `dirPath` itself may be the root, in which case nothing happens.
 */
export async function ensureDirectories(service: FileSystemService, dirPath: string): Promise<void> {
  const root = service.getRootPath();
  const relative = relativePathWithin(root, dirPath);
  if (relative === null) return;

  let current = root;
  for (const segment of relative.split('/')) {
    if (!segment) continue;
    const next = joinRootPath(current, segment);
    const existing = await service.getItem(next);
    if (!existing) {
      await service.createFolder(current, segment);
    } else if (existing.type !== 'directory') {
      throw new Error(`A file already exists where a folder is needed: ${next}`);
    }
    current = next;
  }
}

/**
 * Walk a source folder and map every descendant onto the target root, keeping
 * the folder's own internal structure but dropping where it lived on the
 * source (`relative` already starts at the folder's own name).
 */
async function collectFolderContents(
  source: FileSystemService,
  targetRoot: string,
  sourcePath: string,
  relative: string,
): Promise<FolderContents> {
  const contents: FolderContents = {
    folders: [{ sourcePath, targetPath: joinRootPath(targetRoot, relative) }],
    files: [],
  };

  const children = await source.getDirectory(sourcePath);
  for (const child of children) {
    const childRelative = `${relative}/${child.name}`;
    if (child.type === 'directory') {
      const nested = await collectFolderContents(source, targetRoot, child.path, childRelative);
      contents.folders.push(...nested.folders);
      contents.files.push(...nested.files);
    } else {
      contents.files.push({
        sourcePath: child.path,
        targetPath: joinRootPath(targetRoot, childRelative),
      });
    }
  }

  return contents;
}

/**
 * Resolve where each selected item would land in the target file system and
 * whether something is already there. Reads nothing but the source index and
 * the target index, so nothing is written until the caller starts the copy —
 * obvious conflicts are reported before any data moves.
 *
 * Placement is decided by the item name only — where it sits on the source is
 * irrelevant, so `/aaa/project/` and `/bbb/project/` both target `/project`.
 * Two entries of one selection that would land on the same target path are
 * rejected instead of silently overwriting each other, and a folder that is
 * selected together with one of its own descendants is only copied once.
 *
 * Folder copying is deliberately refused when the target already holds
 * anything under that name: no merging, no deleting, no partial overwrite.
 */
export async function planItemsCopy(
  source: FileSystemService,
  target: FileSystemService,
  sourcePaths: string[],
  options: CopyOptions = {},
): Promise<CopyPlanItem[]> {
  const label = options.targetLabel ?? DEFAULT_TARGET_LABEL;
  const sourceRoot = source.getRootPath();
  const targetRoot = target.getRootPath();

  const selected: Array<{ sourcePath: string; type: CopyPlanEntryType }> = [];
  for (const sourcePath of sourcePaths) {
    if (relativePathWithin(sourceRoot, sourcePath) === null) {
      throw new Error(`コピー元の位置を決められません: ${sourcePath}`);
    }
    const item = await source.getItem(sourcePath);
    if (!item) {
      throw new Error(`コピー元が見つかりません: ${sourcePath}`);
    }
    selected.push({ sourcePath, type: item.type });
  }

  // A selected folder already brings everything below it along.
  const entries = selected.filter(
    (entry) =>
      !selected.some(
        (other) =>
          other.sourcePath !== entry.sourcePath &&
          other.type === 'directory' &&
          relativePathWithin(other.sourcePath, entry.sourcePath) !== null,
      ),
  );

  const claimed = new Map<string, { sourcePath: string; type: CopyPlanEntryType }>();
  const plan: CopyPlanItem[] = [];

  const claim = (
    targetPath: string,
    sourcePath: string,
    name: string,
    type: CopyPlanEntryType,
  ): void => {
    const first = claimed.get(targetPath);
    if (first) {
      const kind = first.type === 'directory' || type === 'directory' ? 'フォルダ' : 'ファイル';
      throw new Error(
        `同じ名前の${kind}が選択されています: ${name}（${first.sourcePath} / ${sourcePath}）`,
      );
    }
    claimed.set(targetPath, { sourcePath, type });
  };

  for (const entry of entries) {
    const name = basename(entry.sourcePath);
    const targetPath = joinRootPath(targetRoot, name);
    const existingItem = await target.getItem(targetPath);

    if (entry.type === 'directory') {
      if (existingItem) {
        const kind = existingItem.type === 'directory' ? 'フォルダ' : 'ファイル';
        throw new Error(`${label}に同名の${kind}があるためコピーできません: ${name}`);
      }
      claim(targetPath, entry.sourcePath, name, 'directory');

      const contents = await collectFolderContents(source, targetRoot, entry.sourcePath, name);
      for (const planned of contents.folders.slice(1)) {
        claim(planned.targetPath, planned.sourcePath, basename(planned.sourcePath), 'directory');
        if (await target.getItem(planned.targetPath)) {
          throw new Error(`${label}にコピー先が既に存在します: ${planned.targetPath}`);
        }
      }
      for (const planned of contents.files) {
        claim(planned.targetPath, planned.sourcePath, basename(planned.sourcePath), 'file');
        if (await target.getItem(planned.targetPath)) {
          throw new Error(`${label}にコピー先が既に存在します: ${planned.targetPath}`);
        }
      }

      plan.push({
        sourcePath: entry.sourcePath,
        targetPath,
        name,
        type: 'directory',
        existing: 'none',
        contents,
      });
    } else {
      claim(targetPath, entry.sourcePath, name, 'file');
      plan.push({
        sourcePath: entry.sourcePath,
        targetPath,
        name,
        type: 'file',
        existing: existingItem ? existingItem.type : 'none',
      });
    }
  }

  return plan;
}

/**
 * Execute a plan: `source.readFile()` → `target.writeFile()` for files,
 * `target.createFolder()` for folders. The source is only ever read — nothing
 * is renamed, moved or deleted there.
 *
 * There is no rollback: a mid-way storage failure leaves whatever was already
 * written in place and surfaces as a rejected promise. Conflicts are therefore
 * checked during planning so the obvious failures happen before the first write.
 */
export async function copyFiles(
  source: FileSystemService,
  target: FileSystemService,
  items: CopyPlanItem[],
  options: CopyOptions = {},
): Promise<CopyFileResult[]> {
  const label = options.targetLabel ?? DEFAULT_TARGET_LABEL;
  const results: CopyFileResult[] = [];

  for (const item of items) {
    if (item.type === 'directory') {
      const contents = item.contents;
      if (!contents) {
        throw new Error(`コピー計画が不正です: ${item.sourcePath}`);
      }

      await ensureDirectories(target, target.getParentPath(item.targetPath));
      for (const folder of contents.folders) {
        const existing = await target.getItem(folder.targetPath);
        if (existing) {
          if (existing.type === 'directory') {
            throw new Error(
              `${label}に同名のフォルダがあるためコピーできません: ${basename(folder.targetPath)}`,
            );
          }
          throw new Error(`${label}にコピー先が既に存在します: ${folder.targetPath}`);
        }
        await target.createFolder(
          target.getParentPath(folder.targetPath),
          basename(folder.targetPath),
        );
      }

      for (const file of contents.files) {
        if (await target.getItem(file.targetPath)) {
          throw new Error(`${label}にコピー先が既に存在します: ${file.targetPath}`);
        }
        const content = await source.readFile(file.sourcePath);
        await target.writeFile(file.targetPath, content);
      }

      results.push({ sourcePath: item.sourcePath, targetPath: item.targetPath });
    } else {
      if (item.existing !== 'none') {
        throw new Error(`${label}に同名のファイルがあるためコピーできません: ${item.name}`);
      }
      const content = await source.readFile(item.sourcePath);
      await ensureDirectories(target, target.getParentPath(item.targetPath));
      await target.writeFile(item.targetPath, content);
      results.push({ sourcePath: item.sourcePath, targetPath: item.targetPath });
    }
  }

  return results;
}
