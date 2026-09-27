import { join } from 'node:path';
import { homedir } from 'node:os';

// HomePilot keeps its own state outside ROOT_PATH on purpose. ROOT_PATH is the
// folder the user browses from the PWA/G2, so a state file living there shows up
// in the listings and can be edited or deleted by accident. It is also the
// reason Windows can break the Gateway: a file the user marked as Hidden under
// ROOT_PATH cannot be written by Node (fs.writeFile fails with EPERM), which
// used to take the whole process down through an unhandled rejection.
//
// HOMEPILOT_VIEWER_STATE_DIR keeps overriding the location. The default is the
// per-user application data folder, which is writable and never inside
// ROOT_PATH.
function defaultViewerStateDir() {
  const base = process.env.LOCALAPPDATA || homedir();
  return join(base, 'HomePilot');
}

export const CONFIG = {
  HOST: '127.0.0.1',
  PORT: 51887,
  ROOT_PATH: process.env.HOMEPILOT_ROOT || 'C:\\hp1',
  VIEWER_STATE_DIR: process.env.HOMEPILOT_VIEWER_STATE_DIR || defaultViewerStateDir(),
  VIEWER_STATE_FILE: '',  // initialized below
  MAX_HISTORY_ENTRIES: Math.max(1, parseInt(process.env.HISTORY_MAX_ENTRIES || '30', 10) || 30),
  MAX_FILE_SIZE: 10 * 1024 * 1024,
  OPENCODE_HOST: '127.0.0.1',
  OPENCODE_PORT: 4096,
  WORKER_URL: process.env.HOMEPILOT_WORKER_URL || '',
  WORKER_SECRET_TOKEN: process.env.HOMEPILOT_WORKER_SECRET_TOKEN || '',
  MAX_AUDIO_SIZE: 5 * 1024 * 1024,
  WORKER_TIMEOUT: 60_000,
  ALLOWED_AUDIO_TYPES: new Set([
    'audio/webm',
    'audio/mp4',
    'audio/wav',
  ]),
  TEXT_EXTENSIONS: new Set([
    '.txt', '.md', '.json', '.js', '.ts', '.jsx', '.tsx', '.css', '.html',
    '.xml', '.yaml', '.yml', '.toml', '.ini', '.cfg', '.conf', '.env',
    '.py', '.rb', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go',
    '.rs', '.sh', '.bash', '.zsh', '.ps1', '.bat', '.cmd', '.csv',
    '.sql', '.log', '.gitignore', '.gitattributes', '.editorconfig',
    '.prettierrc', '.eslintrc', '.vue', '.svelte', '.astro',
    '.r', '.R', '.lua', '.pl', '.swift', '.kt', '.kts', '.dart',
    '.gradle', '.sbt', '.cmake', '.makefile', '.dockerfile',
    '.dockerignore', '.npmrc', '.nvmrc', '.babelrc',
    '.lock', '.csv', '.tsv', '.rtf', '.tex', '.latex',
    '.properties', '.gradle', '.MF', '.manifest', '.svg',
  ]),
};

// Initialize VIEWER_STATE_FILE path
CONFIG.VIEWER_STATE_FILE = join(CONFIG.VIEWER_STATE_DIR, '.HomePilotViewerState.json');

// Earlier versions kept the state inside ROOT_PATH. That file is still read so
// an upgrade keeps the existing history and reading positions, but it is never
// written to and never deleted, and its Windows attributes are left untouched.
CONFIG.LEGACY_VIEWER_STATE_FILE = join(CONFIG.ROOT_PATH, '.HomePilotViewerState.json');
