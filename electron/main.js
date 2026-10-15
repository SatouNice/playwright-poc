// electron/main.js
// Electron main process: giu credentials trong RAM, doc/validate Excel,
// chay Playwright va gui log real-time ve renderer qua IPC.

const path = require('path');
const fs = require('fs');
const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');

// Ban dong goi (asar) khong co cache Chromium cua may dev, nen phai tro
// Playwright toi ban Chromium duoc dong kem qua "extraResources" (xem
// scripts/download-browser.js va key "build.extraResources" trong package.json).
// Phai dat truoc khi require cac module co "require('playwright')" ben trong.
if (app.isPackaged) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(process.resourcesPath, 'pw-browsers');
}

const { readExcel } = require('./automation/excelReader');
const { groupIntoCases } = require('./automation/caseGrouper');
const { runAutomation } = require('./automation/runner');
const { writeReport } = require('./automation/report');

const CONFIG_PATH = path.join(__dirname, 'automation', 'config.json');
const DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;

/**
 * State chi ton tai trong main process.
 * `password` KHONG BAO GIO duoc gui ve renderer, ghi ra dia hay dua vao log.
 */
const state = {
  credentials: null, // { userId, password } — chi trong RAM
  remember: false,
  excel: null, // { filePath, fileName, rows, columns }
  running: false,
  stopRequested: false,
  lastRun: null, // { results, summary }
};

let mainWindow = null;

function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function storageStatePath() {
  return path.join(app.getPath('userData'), 'session-state.json');
}

function screenshotDir() {
  return path.join(app.getPath('userData'), 'screenshots');
}

function videoDir() {
  return path.join(app.getPath('userData'), 'videos');
}

/**
 * Xoa video / anh chup cu hon `run.keepMediaDays` ngay.
 *
 * LY DO: moi dong Excel sinh 1 video quay lai man hinh dang hien ten, ngay sinh
 * va so giay chung minh cua khach hang; anh chup loi cung vay. Truoc day khong
 * co co che don nao nen nhung file nay tich tu vo han tren may nhan vien.
 * Chay luc khoi dong app, truoc khi co lan chay moi nao.
 */
function cleanupOldMedia() {
  let keepDays = 7;
  try {
    const cfg = loadConfig();
    if (Number.isFinite(cfg.run?.keepMediaDays)) keepDays = cfg.run.keepMediaDays;
  } catch {
    // config loi thi dung mac dinh, khong de viec don dep lam hong khoi dong app
  }

  if (keepDays <= 0) return; // 0 hoac am = giu lai vo thoi han (tu nguoi dung chon)

  const hanChot = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let daXoa = 0;

  for (const dir of [screenshotDir(), videoDir()]) {
    let names;
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue; // thu muc chua ton tai — binh thuong khi chay lan dau
    }
    for (const name of names) {
      const file = path.join(dir, name);
      try {
        if (fs.statSync(file).mtimeMs < hanChot) {
          fs.rmSync(file, { force: true, recursive: true });
          daXoa += 1;
        }
      } catch {
        // file dang bi mo hoac khong xoa duoc thi bo qua, lan sau don tiep
      }
    }
  }

  if (daXoa > 0) {
    console.log(`[don dep] da xoa ${daXoa} file video/anh cu hon ${keepDays} ngay.`);
  }
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1080,
    height: 760,
    minWidth: 900,
    minHeight: 640,
    show: false,
    backgroundColor: '#0f172a',
    title: 'Nhap bang minh hoa bao hiem',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      // Bat sandbox 15/10/2026: preload.js chi dung contextBridge/ipcRenderer/
      // webUtils cua chinh Electron, khong require Node module nao (fs, path...)
      // nen chay duoc trong sandbox. Truoc day de false khong co ly do ro rang.
      sandbox: true,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (DEV_SERVER_URL) {
    mainWindow.loadURL(DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'dist', 'index.html'));
  }

  // Chan mo cua so ngoai / dieu huong ra ngoai app.
  // CHI cho giao thuc https di ra trinh duyet he thong: shell.openExternal()
  // giao URL thang cho he dieu hanh, nen neu khong loc thi cac giao thuc khac
  // (file:, javascript:, cac scheme do phan mem khac dang ky...) cung chay duoc.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    let giaoThuc = null;
    try {
      giaoThuc = new URL(url).protocol;
    } catch {
      giaoThuc = null; // url khong hop le
    }

    if (giaoThuc === 'https:') {
      shell.openExternal(url);
    } else {
      console.warn(`[bao mat] tu choi mo URL ngoai https: ${String(url).slice(0, 120)}`);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  // An thanh menu mac dinh (File/Edit/View/Window/Help) — app khong dung toi.
  Menu.setApplicationMenu(null);
  cleanupOldMedia();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------

/**
 * Yeu cau IPC nay co that su den tu cua so cua app khong?
 *
 * Cac handler ben duoi lam nhung viec dac quyen (doc file, chay trinh duyet,
 * ghi bao cao, mo thu muc), nen phai chac chan lenh den tu frame chinh cua cua
 * so chinh — khong phai tu mot iframe long ben trong hay mot webContents khac.
 */
function laYeuCauTuApp(event) {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (event.sender !== mainWindow.webContents) return false;
  try {
    return event.senderFrame === event.sender.mainFrame;
  } catch {
    return false; // frame da bi huy trong luc kiem tra
  }
}

/** Nhu ipcMain.handle nhung tu choi moi yeu cau khong den tu cua so cua app. */
function handleFromApp(channel, listener) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!laYeuCauTuApp(event)) {
      console.warn(`[bao mat] tu choi IPC "${channel}" vi khong den tu cua so cua app.`);
      throw new Error('Yeu cau khong hop le.');
    }
    return listener(event, ...args);
  });
}

handleFromApp('config:get', () => {
  const config = loadConfig();
  const columns = config.formPage.fields.map((f) => ({
    excelColumn: f.excelColumn,
    label: f.label || f.excelColumn,
    type: f.type,
    required: !!f.required,
    options: f.options || null,
  }));

  // Nguoi phu thuoc va san pham phu (so luong khac nhau moi case) nam trong 1 cot
  // JSON dang mang, khong con la cac cot rieng le.
  columns.push({
    excelColumn: config.formPage.dependentsColumn || 'dependents',
    label: 'Nguoi phu thuoc (JSON array)',
    type: 'json',
    required: false,
    options: null,
  });
  columns.push({
    excelColumn: config.productPage?.subProductsColumn || 'san_pham_phu',
    label: 'San pham phu (JSON array)',
    type: 'json',
    required: false,
    options: null,
  });

  return {
    baseUrl: config.baseUrl,
    labelColumn: config.labelColumn || 'ho_ten_bmbh',
    columns,
  };
});

// ---------------------------------------------------------------------------
// IPC: dang nhap (chi luu credentials trong RAM cua main process)
// ---------------------------------------------------------------------------

handleFromApp('auth:set-credentials', (_e, payload) => {
  const userId = String(payload?.userId ?? '').trim();
  const password = String(payload?.password ?? '');
  const remember = !!payload?.remember;

  if (!userId) return { ok: false, message: 'Vui long nhap User ID.' };
  if (!password) return { ok: false, message: 'Vui long nhap mat khau.' };

  state.credentials = { userId, password };
  state.remember = remember;

  // Neu tat "ghi nho" thi xoa luon session da luu tren dia
  if (!remember) {
    try {
      fs.rmSync(storageStatePath(), { force: true });
    } catch {
      /* khong co file thi thoi */
    }
  }

  return { ok: true, userId };
});

handleFromApp('auth:status', () => ({
  hasCredentials: !!state.credentials,
  userId: state.credentials ? state.credentials.userId : null,
  remember: state.remember,
  hasSavedSession: fs.existsSync(storageStatePath()),
}));

handleFromApp('auth:logout', () => {
  state.credentials = null;
  state.remember = false;
  try {
    fs.rmSync(storageStatePath(), { force: true });
  } catch {
    /* bo qua */
  }
  return { ok: true };
});

// ---------------------------------------------------------------------------
// IPC: Excel
// ---------------------------------------------------------------------------

async function validateExcelFile(filePath) {
  const config = loadConfig();
  const result = await readExcel(filePath, config);

  // Ap dung cac quy tac nghiep vu co dieu kien (is_company/is_policy/nguoi phu thuoc)
  // cho tung dong (1 dong = 1 case) — khong kiem tra duoc o excelReader vi phu
  // thuoc gia tri cheo giua cac cot trong cung 1 dong.
  const grouped = result.valid ? groupIntoCases(result.rows) : { cases: [], errors: [] };
  const errors = [...result.errors, ...grouped.errors];
  const valid = result.valid && grouped.errors.length === 0;

  state.excel = valid
    ? {
        filePath,
        fileName: path.basename(filePath),
        rows: result.rows,
        cases: grouped.cases,
        columns: result.columns,
      }
    : null;

  return {
    valid,
    filePath,
    fileName: path.basename(filePath),
    sheetName: result.sheetName,
    totalRows: result.rows.length,
    totalCases: grouped.cases.length,
    columns: result.columns,
    errors,
    preview: result.rows.slice(0, 10),
  };
}

handleFromApp('excel:pick', async () => {
  const res = await dialog.showOpenDialog(mainWindow, {
    title: 'Chon file Excel danh sach khach hang',
    properties: ['openFile'],
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (res.canceled || res.filePaths.length === 0) return { canceled: true };
  return validateExcelFile(res.filePaths[0]);
});

handleFromApp('excel:validate', async (_e, filePath) => {
  if (!filePath || !filePath.toLowerCase().endsWith('.xlsx')) {
    return {
      valid: false,
      filePath,
      fileName: filePath ? path.basename(filePath) : '',
      totalRows: 0,
      columns: [],
      errors: [{ row: null, column: null, message: 'Chi chap nhan file dinh dang .xlsx' }],
      preview: [],
    };
  }
  if (!fs.existsSync(filePath)) {
    return {
      valid: false,
      filePath,
      fileName: path.basename(filePath),
      totalRows: 0,
      columns: [],
      errors: [{ row: null, column: null, message: 'Khong tim thay file. Hay chon lai.' }],
      preview: [],
    };
  }
  return validateExcelFile(filePath);
});

// ---------------------------------------------------------------------------
// IPC: chay automation
// ---------------------------------------------------------------------------

handleFromApp('run:start', async () => {
  if (state.running) return { ok: false, message: 'Dang co mot luot chay khac.' };
  if (!state.credentials) return { ok: false, message: 'Chua dang nhap.' };
  if (!state.excel || state.excel.cases.length === 0) {
    return { ok: false, message: 'Chua co du lieu Excel hop le.' };
  }

  state.running = true;
  state.stopRequested = false;
  state.lastRun = null;

  const config = loadConfig();
  const cases = state.excel.cases;

  // Chay nen — khong await de renderer nhan duoc log real-time
  runAutomation({
    config,
    cases,
    credentials: state.credentials,
    remember: state.remember,
    storageStatePath: storageStatePath(),
    screenshotDir: screenshotDir(),
    videoDir: videoDir(),
    emit: (event) => sendToRenderer('run:event', event),
    shouldStop: () => state.stopRequested,
  })
    .then(({ summary, results }) => {
      state.lastRun = { summary, results, sourceFile: state.excel?.fileName || '' };
    })
    .catch((err) => {
      sendToRenderer('run:event', { type: 'fatal', message: err.message });
      sendToRenderer('run:event', {
        type: 'done',
        summary: { total: cases.length, processed: 0, ok: 0, error: 0, skipped: cases.length, stoppedByUser: false },
        results: [],
      });
    })
    .finally(() => {
      state.running = false;
    });

  return { ok: true, total: cases.length };
});

handleFromApp('run:stop', () => {
  if (!state.running) return { ok: false, message: 'Khong co luot chay nao dang chay.' };
  state.stopRequested = true;
  return { ok: true };
});

handleFromApp('run:status', () => ({
  running: state.running,
  stopRequested: state.stopRequested,
}));

// ---------------------------------------------------------------------------
// IPC: xuat bao cao
// ---------------------------------------------------------------------------

handleFromApp('report:export', async () => {
  if (!state.lastRun || state.lastRun.results.length === 0) {
    return { ok: false, message: 'Chua co ket qua nao de xuat bao cao.' };
  }

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const res = await dialog.showSaveDialog(mainWindow, {
    title: 'Luu bao cao ket qua',
    defaultPath: path.join(app.getPath('documents'), `bao-cao-ket-qua-${stamp}.xlsx`),
    filters: [{ name: 'Excel', extensions: ['xlsx'] }],
  });
  if (res.canceled || !res.filePath) return { ok: false, canceled: true };

  try {
    await writeReport(res.filePath, state.lastRun.results, loadConfig(), {
      sourceFile: state.lastRun.sourceFile,
      summary: state.lastRun.summary,
    });
    return { ok: true, filePath: res.filePath };
  } catch (err) {
    return { ok: false, message: `Khong ghi duoc file bao cao: ${err.message}` };
  }
});

handleFromApp('shell:show-item', (_e, filePath) => {
  if (filePath && fs.existsSync(filePath)) shell.showItemInFolder(filePath);
  return { ok: true };
});
