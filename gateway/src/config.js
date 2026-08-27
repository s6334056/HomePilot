export const CONFIG = {
  HOST: '127.0.0.1',
  PORT: 51887,
  ROOT_PATH: process.env.HOMEPILOT_ROOT || 'C:\\hp1',
  MAX_FILE_SIZE: 10 * 1024 * 1024,
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
