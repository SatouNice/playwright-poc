// scripts/dev.js
// Mot lenh duy nhat cho che do dev:
//   1. Bat test server gia lap (localhost:3000)
//   2. Bat Vite dev server cho renderer (localhost:5173)
//   3. Doi Vite san sang roi mo Electron, tro vao Vite de co hot-reload
//
// Chay: npm run dev   (Ctrl+C de tat tat ca)

const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const VITE_URL = 'http://localhost:5173';
const children = [];
let shuttingDown = false;

function run(name, command, args, extraEnv = {}) {
  const env = { ...process.env, ...extraEnv };

  // Terminal cua VS Code / Claude Code dat san bien nay; neu de nguyen thi
  // electron.exe se chay nhu Node thuan va khong mo duoc cua so nao.
  delete env.ELECTRON_RUN_AS_NODE;

  const child = spawn(command, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env,
    shell: false,
  });
  child.on('error', (err) => console.error(`[${name}] loi: ${err.message}`));
  children.push({ name, child });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    if (!child.killed) {
      try {
        child.kill();
      } catch {
        /* bo qua */
      }
    }
  }
  process.exit(code);
}

/** Kiem tra 1 port da co ai chiem chua (de khong bat trung test server) */
function isPortInUse(port) {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port, path: '/' }, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve(false);
    });
  });
}

function waitForServer(url, timeoutMs = 30000) {
  const started = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Vite khong khoi dong duoc sau ${timeoutMs / 1000}s`));
        } else {
          setTimeout(tick, 300);
        }
      });
    };
    tick();
  });
}

async function main() {
  if (await isPortInUse(3000)) {
    console.log('[dev] Port 3000 da co server chay san — bo qua buoc bat test server.');
  } else {
    console.log('[dev] Khoi dong test server gia lap (localhost:3000)...');
    run('test-server', process.execPath, [path.join(ROOT, 'test-server', 'server.js')]);
  }

  console.log('[dev] Khoi dong Vite dev server (localhost:5173)...');
  // Khong dung require.resolve('vite/bin/vite.js') vi Vite 6 chan subpath nay
  // qua "exports" trong package.json. Tro thang toi file trong node_modules.
  const viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  run('vite', process.execPath, [viteBin]);

  await waitForServer(VITE_URL);
  console.log('[dev] Vite san sang. Dang mo Electron...');

  const electronPath = getElectronPath();
  const electron = run('electron', electronPath, ['.'], { VITE_DEV_SERVER_URL: VITE_URL });
  electron.on('close', (code) => {
    console.log('[dev] Electron da dong. Dang tat cac tien trinh phu...');
    shutdown(code ?? 0);
  });
}

/**
 * `require('electron')` doc node_modules/electron/path.txt va noi vao thanh duong dan
 * .exe. Neu file path.txt bi ghi lan them CRLF/whitespace o cuoi (vi du do lam lai
 * qua PowerShell Out-File), duong dan bi hong va spawn se bao ENOENT du .exe van ton tai.
 * Kiem tra som o day de bao loi ro rang thay vi de spawn that bai kho hieu.
 */
function getElectronPath() {
  const electronPath = require('electron');
  if (!fs.existsSync(electronPath)) {
    throw new Error(
      `Khong tim thay electron.exe tai: ${electronPath}\n` +
        `Kiem tra node_modules/electron/path.txt co bi thua khoang trang/xuong dong khong.`
    );
  }
  return electronPath;
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

main().catch((err) => {
  console.error(`[dev] ${err.message}`);
  shutdown(1);
});
