// scripts/download-browser.js
// Tai Chromium cua Playwright vao thu muc pw-browsers/ (thay vi cache mac dinh
// cua may) de electron-builder dong goi kem theo app qua "extraResources".
// Chay truoc buoc "electron-builder" trong lenh `npm run dist`.

const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BROWSERS_DIR = path.join(ROOT, 'pw-browsers');
// cli.js khong nam trong "exports" cua package.json Playwright nen phai tro
// thang toi file vat ly thay vi dung require.resolve('playwright/cli.js').
const PLAYWRIGHT_CLI = path.join(ROOT, 'node_modules', 'playwright', 'cli.js');

const env = { ...process.env, PLAYWRIGHT_BROWSERS_PATH: BROWSERS_DIR };

// `install chromium` cung tai kem "chromium headless shell": can giu lai vi
// config.json (run.headless) cho phep chay headless:true, va Playwright dung
// rieng binary nay cho che do headless mac dinh.
const result = spawnSync(process.execPath, [PLAYWRIGHT_CLI, 'install', 'chromium'], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 0);
