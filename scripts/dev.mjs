import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const WEB_DIR = path.join(ROOT_DIR, 'web');

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const serverProc = spawn(process.execPath, ['--watch', 'server/index.js'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
});

const viteProc = spawn(npmCmd, ['run', 'dev'], {
  cwd: WEB_DIR,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (!serverProc.killed) serverProc.kill();
  if (!viteProc.killed) viteProc.kill();
  process.exit(code);
}

serverProc.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

viteProc.on('exit', (code) => {
  if (!shuttingDown) shutdown(code ?? 0);
});

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
