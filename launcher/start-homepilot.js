import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import qrcode from 'qrcode-terminal';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const HOME_ROOT = resolve(__dirname, '..');

// --- Load .env file ---
function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return {};
  const env = {};
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch {
    return {};
  }
  for (const raw of content.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) continue;
    const key = line.slice(0, eqIndex).trim();
    let value = line.slice(eqIndex + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const envFile = loadEnvFile(join(__dirname, '.env'));

const GATEWAY_DIR = join(HOME_ROOT, 'gateway');
const GATEWAY_SCRIPT = join(GATEWAY_DIR, 'src', 'index.js');
const CLOUDFLARED_PATH = join(HOME_ROOT, 'tools', 'cloudflared.exe');

const GATEWAY_HOST = '127.0.0.1';
const GATEWAY_PORT = 51887;
const GATEWAY_URL = `http://${GATEWAY_HOST}:${GATEWAY_PORT}`;

const OPENCODE_HOST = '127.0.0.1';
const OPENCODE_PORT = 4096;
const OPENCODE_URL = `http://${OPENCODE_HOST}:${OPENCODE_PORT}`;

const GATEWAY_STARTUP_TIMEOUT = 10_000;
const TUNNEL_URL_TIMEOUT = 30_000;
const OPENCODE_STARTUP_TIMEOUT = 15_000;

// Parse command-line arguments for root folder
// Usage: node start-homepilot.js [root-folder]
// Example: node start-homepilot.js C:\hp1
// .env file is also checked as fallback
const ROOT_FOLDER = process.argv[2] || process.env.HOMEPILOT_ROOT || envFile.ROOT_PATH || 'C:\\hp1';
const WORKER_URL = process.env.HOMEPILOT_WORKER_URL || envFile.HOMEPILOT_WORKER_URL || '';
const WORKER_SECRET_TOKEN = process.env.HOMEPILOT_WORKER_SECRET_TOKEN || envFile.HOMEPILOT_WORKER_SECRET_TOKEN || '';

let gatewayToken = null;
let tunnelUrl = null;
let gatewayListenAddress = null;
let gatewayReady = false;
let tunnelReady = false;
let opencodeReady = false;
let gatewayProcess = null;
let opencodeProcess = null;
let cloudflaredProcess = null;
let shuttingDown = false;
let gatewayTimeout = null;
let tunnelTimeout = null;
let opencodeTimeout = null;

// --- Validate root folder ---
if (!existsSync(ROOT_FOLDER)) {
  console.error('');
  console.error('========================================');
  console.error('  HomePilot - Root folder not found');
  console.error('========================================');
  console.error('');
  console.error(`The specified root folder does not exist:`);
  console.error(`  ${ROOT_FOLDER}`);
  console.error('');
  console.error('Please create the folder before starting HomePilot.');
  console.error('');
  console.error('Usage:');
  console.error('  start-homepilot.bat [root-folder]');
  console.error('');
  console.error('Example:');
  console.error('  start-homepilot.bat C:\\hp1');
  process.exit(1);
}

// --- Validate cloudflared ---
if (!existsSync(CLOUDFLARED_PATH)) {
  console.error('');
  console.error('cloudflared.exe was not found.');
  console.error('');
  console.error('Expected:');
  console.error(`  ${CLOUDFLARED_PATH}`);
  process.exit(1);
}

// --- Validate .env configuration ---
const missingVars = [];
if (!WORKER_URL) missingVars.push('HOMEPILOT_WORKER_URL');
if (!WORKER_SECRET_TOKEN) missingVars.push('HOMEPILOT_WORKER_SECRET_TOKEN');
if (missingVars.length > 0) {
  console.error('');
  console.error('========================================');
  console.error('  HomePilot - Configuration missing');
  console.error('========================================');
  console.error('');
  console.error('The following variables are not set:');
  for (const v of missingVars) {
    console.error(`  - ${v}`);
  }
  console.error('');
  console.error('Create launcher/.env with these values:');
  console.error('');
  console.error('  HOMEPILOT_WORKER_URL=http://127.0.0.1:8787');
  console.error('  HOMEPILOT_WORKER_SECRET_TOKEN=your-token');
  console.error('  ROOT_PATH=C:\\hp1');
  console.error('');
  process.exit(1);
}

// --- Start Gateway ---
function startGateway() {
  console.log('Starting HomePilot Gateway...');

  gatewayProcess = spawn('node', [GATEWAY_SCRIPT], {
    cwd: GATEWAY_DIR,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: {
      ...process.env,
      HOMEPILOT_ROOT: ROOT_FOLDER,
      HOMEPILOT_WORKER_URL: WORKER_URL,
      HOMEPILOT_WORKER_SECRET_TOKEN: WORKER_SECRET_TOKEN,
    },
  });

  gatewayProcess.stdout.on('data', onGatewayOutput);
  gatewayProcess.stderr.on('data', onGatewayOutput);

  gatewayProcess.on('close', (code) => {
    if (!shuttingDown) {
      console.error('');
      console.error(`HomePilot Gateway could not start.`);
      if (code !== 0 && code !== null) {
        console.error(`Process exited with code ${code}.`);
      }
      console.error('Port 51887 may already be in use.');
      shutdown();
    }
  });

  gatewayProcess.on('error', (err) => {
    if (!shuttingDown) {
      console.error('');
      console.error('HomePilot Gateway could not start.');
      console.error(err.message);
      shutdown();
    }
  });

  gatewayTimeout = setTimeout(() => {
    if (!gatewayReady) {
      console.error('');
      console.error('HomePilot Gateway failed to start within 10 seconds.');
      console.error('Port 51887 may already be in use.');
      shutdown();
    }
  }, GATEWAY_STARTUP_TIMEOUT);
}

function onGatewayOutput(data) {
  const text = data.toString();

  const lines = text.split('\n');
  for (const line of lines) {
    if (line.trim()) {
      console.log(`[Gateway] ${line}`);
    }
  }

  const listenMatch = text.match(/HomePilot Gateway listening on (http:\/\/\S+)/);
  if (listenMatch) {
    gatewayListenAddress = listenMatch[1];
  }

  const tokenMatch = text.match(/^Token:\s*(\S+)/m);
  if (tokenMatch) {
    gatewayToken = tokenMatch[1];
  }

  checkGatewayReady();
}

function checkGatewayReady() {
  if (!gatewayReady && gatewayToken && gatewayListenAddress) {
    gatewayReady = true;
    if (gatewayTimeout) {
      clearTimeout(gatewayTimeout);
      gatewayTimeout = null;
    }
    console.log('Gateway is ready. Starting OpenCode Server...');
    startOpenCodeServer();
  }
}

// --- Start OpenCode Server ---
function startOpenCodeServer() {
  const isWindows = process.platform === 'win32';

  opencodeProcess = spawn('opencode', ['serve'], {
    cwd: ROOT_FOLDER,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: isWindows,
    env: {
      ...process.env,
      HOMEPILOT_ROOT: ROOT_FOLDER,
    },
  });

  opencodeProcess.stdout.on('data', onOpenCodeOutput);
  opencodeProcess.stderr.on('data', onOpenCodeOutput);

  opencodeProcess.on('close', (code) => {
    if (!shuttingDown && !opencodeReady) {
      console.error('');
      console.error('OpenCode Server exited unexpectedly.');
      if (code !== 0 && code !== null) {
        console.error(`Exit code: ${code}`);
      }
      shutdown();
    }
  });

  opencodeProcess.on('error', (err) => {
    if (!shuttingDown) {
      console.error('');
      console.error('Failed to start OpenCode Server.');
      console.error(err.message);
      console.error('');
      console.error('Make sure "opencode" command is available in PATH.');
      shutdown();
    }
  });

  opencodeTimeout = setTimeout(() => {
    if (!opencodeReady) {
      console.error('');
      console.error('OpenCode Server failed to start within 15 seconds.');
      shutdown();
    }
  }, OPENCODE_STARTUP_TIMEOUT);
}

function onOpenCodeOutput(data) {
  const text = data.toString();

  // Check for OpenCode Server ready indicators
  if (!opencodeReady && (text.includes('Listening on') || text.includes('Server ready') || text.includes(`:${OPENCODE_PORT}`))) {
    opencodeReady = true;
    if (opencodeTimeout) {
      clearTimeout(opencodeTimeout);
      opencodeTimeout = null;
    }
    console.log('OpenCode Server is ready. Starting Quick Tunnel...');
    startCloudflared();
  }
}

// --- Start cloudflared ---
function startCloudflared() {
  cloudflaredProcess = spawn(CLOUDFLARED_PATH, ['tunnel', '--url', GATEWAY_URL], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  cloudflaredProcess.stdout.on('data', onCloudflaredOutput);
  cloudflaredProcess.stderr.on('data', onCloudflaredOutput);

  cloudflaredProcess.on('close', (code) => {
    if (!shuttingDown) {
      console.error('');
      console.error('cloudflared process exited unexpectedly.');
      if (code !== 0 && code !== null) {
        console.error(`Exit code: ${code}`);
      }
      shutdown();
    }
  });

  cloudflaredProcess.on('error', (err) => {
    if (!shuttingDown) {
      console.error('');
      console.error('Failed to start cloudflared.');
      console.error(err.message);
      shutdown();
    }
  });

  tunnelTimeout = setTimeout(() => {
    if (!tunnelReady) {
      console.error('');
      console.error('HomePilot Quick Tunnel URL could not be detected within 30 seconds.');
      console.error('Please check your Internet connection.');
      shutdown();
    }
  }, TUNNEL_URL_TIMEOUT);
}

function onCloudflaredOutput(data) {
  if (tunnelReady) return;

  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  if (match) {
    tunnelUrl = match[0];
    tunnelReady = true;
    if (tunnelTimeout) {
      clearTimeout(tunnelTimeout);
      tunnelTimeout = null;
    }
    showReady();
  }
}

// --- Display ---
function showReady() {
  const address = gatewayListenAddress || GATEWAY_URL;

  const qrData = JSON.stringify({
    type: 'homepilot-connection',
    version: 1,
    url: tunnelUrl,
    token: gatewayToken,
  });

  console.log('');
  console.log('========================================');
  console.log('        HomePilot');
  console.log('========================================');
  console.log('');
  console.log('HomePilot Gateway');
  console.log('-----------------');
  console.log(`  Root     : ${ROOT_FOLDER}`);
  console.log(`  Gateway  : ${address}`);
  console.log(`  OpenCode : ${OPENCODE_URL}`);
  console.log(`  Token    : ${gatewayToken}`);
  console.log(`  Worker   : ${WORKER_URL}`);
  console.log('');
  console.log('Quick Tunnel');
  console.log('  Status : READY');
  console.log(`  URL    : ${tunnelUrl}`);
  console.log('');
  console.log('Connection JSON');
  console.log(qrData);
  console.log('');
  console.log('Connection QR');
  console.log('');

  qrcode.generate(qrData, { small: true }, (qr) => {
    console.log(qr);
    console.log('');
    console.log('----------------------------------------');
    console.log('HomePilot is ready.');
    console.log('----------------------------------------');
    console.log('');
    console.log('Scan the QR code with your phone to connect.');
    console.log('Keep this window open while using HomePilot.');
    console.log('');
    console.log('Press Ctrl+C to stop HomePilot.');
  });
}

// --- Shutdown ---
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  if (gatewayTimeout) {
    clearTimeout(gatewayTimeout);
    gatewayTimeout = null;
  }
  if (tunnelTimeout) {
    clearTimeout(tunnelTimeout);
    tunnelTimeout = null;
  }
  if (opencodeTimeout) {
    clearTimeout(opencodeTimeout);
    opencodeTimeout = null;
  }

  console.log('');
  console.log('Stopping HomePilot...');

  if (cloudflaredProcess && !cloudflaredProcess.killed) {
    console.log('Stopping Quick Tunnel...');
    cloudflaredProcess.kill();
  }

  if (opencodeProcess && !opencodeProcess.killed) {
    console.log('Stopping OpenCode Server...');
    opencodeProcess.kill();
  }

  if (gatewayProcess && !gatewayProcess.killed) {
    console.log('Stopping Gateway...');
    gatewayProcess.kill();
  }

  let pending = 0;
  const onChildExit = () => {
    pending--;
    if (pending <= 0) {
      console.log('HomePilot stopped.');
      process.exit(0);
    }
  };

  if (cloudflaredProcess && !cloudflaredProcess.killed) {
    pending++;
    cloudflaredProcess.on('close', onChildExit);
  }
  if (opencodeProcess && !opencodeProcess.killed) {
    pending++;
    opencodeProcess.on('close', onChildExit);
  }
  if (gatewayProcess && !gatewayProcess.killed) {
    pending++;
    gatewayProcess.on('close', onChildExit);
  }

  if (pending === 0) {
    console.log('HomePilot stopped.');
    process.exit(0);
  }

  setTimeout(() => {
    process.exit(0);
  }, 3000);
}

// --- Signal handling ---
process.on('SIGINT', () => {
  shutdown();
});

process.on('SIGTERM', () => {
  shutdown();
});

process.on('uncaughtException', (err) => {
  console.error('Unexpected error:', err.message);
  shutdown();
});

// --- Start ---
startGateway();
