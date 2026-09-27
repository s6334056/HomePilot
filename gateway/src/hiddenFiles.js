import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

// Windows exposes the Hidden property as the FILE_ATTRIBUTE_HIDDEN file
// attribute. Node's standard APIs do not surface it: fs.Stats has no field for
// it and fs.Dirent only carries name/type predicates, so the attribute is
// queried through PowerShell instead.
//
// SECURITY: the directory is never embedded in PowerShell source code. It is
// handed over through the HPDIR environment variable, the command itself is a
// fixed script passed with -EncodedCommand, and execFile() is called without
// `shell: true`, so neither the argument vector nor the environment is ever
// re-parsed by a shell. Building a -Command string by concatenating the path
// is a command injection and must never be done here.
const POWERSHELL_SCRIPT = [
  // Without this the child process writes the file names in the console code
  // page and non-ASCII paths come back as mojibake.
  '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;',
  'Get-ChildItem -LiteralPath $env:HPDIR -Force -Attributes Hidden',
  '| ForEach-Object { $_.FullName }',
].join(' ');

const ENCODED_SCRIPT = Buffer.from(POWERSHELL_SCRIPT, 'utf16le').toString('base64');

// Measured on Windows 11 / Node 24: a PowerShell process costs roughly 350-800ms
// no matter how many entries the directory holds, so the cost is process startup
// rather than enumeration. The timeout is generous enough to never fire on a
// slow machine while still keeping a hung child from stalling a request forever.
const EXEC_TIMEOUT_MS = 10_000;
// Only hidden entries are printed, so real output stays small. The cap keeps a
// pathological directory from growing the child's stdout without bound.
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

// Overridable so tests can force a failing PowerShell and assert the fail-open
// behaviour. Not a user-facing setting.
const POWERSHELL_BIN_ENV = 'HOMEPILOT_POWERSHELL_BIN';

const EXTENDED_PREFIX = '\\\\?\\';
const EXTENDED_UNC_PREFIX = '\\\\?\\UNC\\';
const EXTENDED_DRIVE_PATTERN = /^[A-Za-z]:[\\/]/;

/**
 * Removes the Windows extended-length prefix "\\?\" from a path.
 *
 * PowerShell cannot resolve that form for -LiteralPath: it reports nothing as
 * hidden instead of failing, which would silently expose hidden entries. The
 * prefix is therefore stripped before the path is handed to PowerShell.
 *
 * Only the two prefixes that map cleanly back to a normal path are stripped:
 * drive-letter paths and extended UNC paths. A plain UNC share
 * ("\\server\share") is unrelated to the extended form and is left untouched,
 * and so is anything else such as "\\?\Volume{...}" whose prefix is part of the
 * path.
 */
export function stripExtendedPathPrefix(filePath) {
  if (typeof filePath !== 'string' || !filePath.startsWith(EXTENDED_PREFIX)) {
    return filePath;
  }

  if (filePath.startsWith(EXTENDED_UNC_PREFIX)) {
    return '\\\\' + filePath.slice(EXTENDED_UNC_PREFIX.length);
  }

  const withoutPrefix = filePath.slice(EXTENDED_PREFIX.length);
  return EXTENDED_DRIVE_PATTERN.test(withoutPrefix) ? withoutPrefix : filePath;
}

/**
 * Returns the paths of the hidden entries directly inside `dirPath`, lower-cased
 * so they can be compared against Windows paths case-insensitively.
 *
 * This never rejects. When the hidden attribute cannot be determined the result
 * is an empty set, which leaves the listing unfiltered (fail-open): this feature
 * exists to prevent accidental edits, not to control access, so keeping the
 * Explorer usable is more important than hiding a few extra entries. Any failure
 * is logged so it is never swallowed silently.
 *
 * @param {string} dirPath Absolute path of an existing directory.
 * @returns {Promise<Set<string>>} Lower-cased full paths of hidden entries.
 */
export async function getHiddenEntryPaths(dirPath) {
  if (process.platform !== 'win32') {
    return new Set();
  }

  try {
    const target = stripExtendedPathPrefix(dirPath);

    const { stdout } = await execFileAsync(
      process.env[POWERSHELL_BIN_ENV] || 'powershell',
      [
        '-NoProfile',
        '-NonInteractive',
        '-OutputFormat',
        'Text',
        '-EncodedCommand',
        ENCODED_SCRIPT,
      ],
      {
        encoding: 'utf-8',
        timeout: EXEC_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER_BYTES,
        windowsHide: true,
        env: { ...process.env, HPDIR: target },
      },
    );

    return new Set(
      stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .map((line) => line.trim().toLowerCase()),
    );
  } catch (error) {
    console.error(`[HiddenFiles] Failed to read hidden attributes: ${error.message}`);
    return new Set();
  }
}
