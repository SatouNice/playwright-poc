// scripts/start-electron.js
// Mo Electron o che do production (dung giao dien da build san trong renderer/dist).
// Dung script rieng thay vi goi thang `electron .` de con don dep bien moi truong.

const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const env = { ...process.env };

// Terminal cua VS Code / Claude Code dat san bien nay -> electron.exe se chay
// nhu Node thuan va khong mo duoc cua so nao.
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(require('electron'), ['.'], {
  cwd: ROOT,
  stdio: 'inherit',
  env,
  shell: false,
});

child.on('close', (code) => process.exit(code ?? 0));
