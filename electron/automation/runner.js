// electron/automation/runner.js
// Dieu phoi toan bo luong chay (ke thua logic tu POC automation/index.js).
// Khac biet chinh: moi log/ket qua deu bao ve qua callback `emit` de main process
// day len renderer bang IPC, thay vi console.log.

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { login, isSessionValid } = require('./login');
const { fillForm } = require('./fillForm');
const { fillProduct } = require('./fillProduct');

/** Loi tam thoi (timeout / mang) thi dang retry, con loi validate thi khong */
function isRetryableError(err) {
  const msg = String(err && err.message ? err.message : err).toLowerCase();
  return (
    msg.includes('timeout') ||
    msg.includes('net::') ||
    msg.includes('econnrefused') ||
    msg.includes('econnreset') ||
    msg.includes('navigation')
  );
}

function safeFileName(text) {
  return String(text || 'row').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

const MAX_JS_ERRORS = 5;
const MAX_JS_ERROR_LEN = 300;

/**
 * Gan listener bat loi JS phia trang dich (khong lien quan gi den Excel/validate cua app):
 * - 'pageerror'  : exception JS chua duoc catch, lam vo luong chay cua trang.
 * - 'console'    : console.error(...) ma code frontend chu dong log ra.
 * Tra ve 1 mang dung chung — goi .length = 0 truoc moi lan thu de chi giu loi cua lan gan nhat.
 */
function attachJsErrorCapture(page) {
  const jsErrors = [];
  const push = (text) => {
    if (jsErrors.length >= MAX_JS_ERRORS) return;
    jsErrors.push(String(text).slice(0, MAX_JS_ERROR_LEN));
  };
  page.on('pageerror', (err) => push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') push(`console.error: ${msg.text()}`);
  });
  return jsErrors;
}

/**
 * Dong trinh duyet nhung khong bao gio treo: neu qua `timeoutMs` van chua dong xong
 * thi bo qua, de luon phat duoc su kien `done` ve UI (neu khong UI se ket o trang thai
 * "dang chay" vinh vien).
 */
async function closeQuietly(closable, timeoutMs = 10000) {
  if (!closable) return;
  let timer;
  try {
    await Promise.race([
      closable.close(),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
  } catch {
    /* trinh duyet co the da dong san */
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Dong 1 page va lay duong dan file video (neu co bat recordVideo).
 * `video.path()` chi resolve sau khi page dong xong nen phai goi song song voi close().
 */
async function closePageAndGetVideoPath(page) {
  if (!page) return null;
  const video = typeof page.video === 'function' ? page.video() : null;
  try {
    const [videoPath] = await Promise.all([
      video ? video.path() : Promise.resolve(null),
      page.close(),
    ]);
    return videoPath;
  } catch {
    try {
      await page.close();
    } catch {
      /* page co the da dong san */
    }
    return null;
  }
}

/**
 * @param {object} options
 * @param {object} options.config           noi dung config.json
 * @param {Array<object>} options.cases     cac case da gom nhom (xem caseGrouper.js)
 * @param {{userId: string, password: string}} options.credentials
 * @param {boolean} options.remember        co luu session (storageState) khong
 * @param {string} options.storageStatePath duong dan file luu session
 * @param {string} options.screenshotDir    thu muc luu screenshot khi loi
 * @param {string} options.videoDir        thu muc luu video (moi case 1 file, neu bat recordVideo)
 * @param {(event: object) => void} options.emit
 * @param {() => boolean} options.shouldStop
 */
async function runAutomation({
  config,
  cases,
  credentials,
  remember,
  storageStatePath,
  screenshotDir,
  videoDir,
  emit,
  shouldStop,
}) {
  const runCfg = config.run || {};
  const labelColumn = config.labelColumn || 'ho_ten_bmbh';
  const maxRetry = Number.isInteger(runCfg.maxRetryPerRow) ? runCfg.maxRetryPerRow : 1;
  const recordVideo = runCfg.recordVideo !== false;
  const total = cases.length;
  const results = [];

  // CO DEBUG TAM THOI (khong dung khi chay that): dung lai truoc khi bam "Xac dinh"
  // cuoi cung o man san pham, KHONG dong tab/trinh duyet, de nguoi dung tu bam va
  // kiem tra thu cong xem co alert/loi gi khong. Chi xu ly 1 case roi dung ca luot chay.
  const debugSkipFinalSubmit = runCfg.debugSkipFinalSubmit === true;
  // CO DEBUG TAM THOI khac: van de cho automation tu bam het (ke ca submit cuoi,
  // tu Cancel dialog nhu binh thuong) nhung KHONG dong tab/trinh duyet sau khi xong,
  // de nguoi dung tu kiem tra ket qua (trang cuoi cung, du lieu da luu chua). Chi xu
  // ly 1 case roi dung ca luot chay.
  const debugKeepBrowserOpen = runCfg.debugKeepBrowserOpen === true;

  const log = (message, level = 'info') => emit({ type: 'log', level, message });

  fs.mkdirSync(screenshotDir, { recursive: true });
  if (recordVideo) fs.mkdirSync(videoDir, { recursive: true });

  let browser = null;
  let context = null;
  let stoppedByUser = false;
  let keepBrowserOpen = false; // che do debug: khong dong browser de nguoi dung tu kiem tra

  try {
    log('Dang khoi dong trinh duyet...');
    browser = await chromium.launch({
      headless: runCfg.headless === true,
      slowMo: runCfg.slowMo ?? 0,
    });

    // Neu co session da luu thi thu dung lai de khoi phai dang nhap
    const hasSavedSession = remember && storageStatePath && fs.existsSync(storageStatePath);
    context = await browser.newContext({
      ...(hasSavedSession ? { storageState: storageStatePath } : {}),
      // recordVideo o cap context: moi page duoc tao trong context nay se co 1 file
      // video rieng (Playwright tach video theo page, khong gop chung 1 file), nen
      // van dung chung 1 context/session dang nhap ma khong can dang nhap lai moi dong
      ...(recordVideo
        ? { recordVideo: { dir: videoDir, size: runCfg.videoSize || { width: 1280, height: 720 } } }
        : {}),
    });
    context.setDefaultTimeout(runCfg.timeoutMs ?? 15000);

    // Page rieng chi de dang nhap / kiem tra session — dong va bo video ngay sau do,
    // vi video can quan tam la video cua tung dong du lieu, khong phai luc dang nhap.
    const sessionPage = await context.newPage();

    let loggedIn = false;
    if (hasSavedSession) {
      log('Tim thay phien dang nhap da luu, dang kiem tra...');
      loggedIn = await isSessionValid(sessionPage, config);
      log(loggedIn ? 'Phien cu con hieu luc, bo qua buoc dang nhap.' : 'Phien cu da het han, se dang nhap lai.');
    }

    if (!loggedIn) {
      if (!credentials || !credentials.userId || !credentials.password) {
        throw new Error('Chua co thong tin dang nhap. Hay quay lai man hinh dang nhap.');
      }
      await login(sessionPage, config.loginPage, config.baseUrl, credentials, log);

      if (remember && storageStatePath) {
        // Chi luu cookie/session cua Playwright — KHONG luu mat khau
        await context.storageState({ path: storageStatePath });
        log('Da luu phien dang nhap de dung cho lan sau (khong luu mat khau).');
      }
    }

    const sessionVideoPath = await closePageAndGetVideoPath(sessionPage);
    if (sessionVideoPath) {
      fs.rm(sessionVideoPath, { force: true }, () => {});
    }

    for (let i = 0; i < total; i++) {
      if (shouldStop()) {
        stoppedByUser = true;
        log('Da nhan lenh dung. Dang ket thuc an toan...', 'warn');
        break;
      }

      const caseItem = cases[i];
      const excelRow = (caseItem.__rows || []).join(',') || String(i + 1);
      const label = caseItem[labelColumn] || `Ho so dong ${excelRow}`;
      const depCount = (caseItem.dependents || []).length;
      emit({
        type: 'progress',
        current: i + 1,
        total,
        label: depCount ? `${label} (+${depCount} nguoi phu thuoc)` : label,
      });

      // Page rieng cho case nay -> Playwright ghi 1 file video rieng cho page nay,
      // dong bo voi context (session dang nhap) nen khong phai dang nhap lai.
      const casePage = await context.newPage();
      const jsErrors = attachJsErrorCapture(casePage);

      let lastError = null;
      let ok = false;

      for (let attempt = 0; attempt <= maxRetry; attempt++) {
        jsErrors.length = 0; // chi giu loi JS cua lan thu gan nhat, tranh lap lai loi cua lan truoc
        try {
          if (attempt > 0) log(`Thu lai lan ${attempt} cho "${label}"...`, 'warn');
          await fillForm(casePage, config.formPage, config.baseUrl, caseItem, () => {});
          if (config.productPage) {
            await fillProduct(
              casePage,
              config.productPage,
              caseItem,
              (msg, level) => log(`[${label}] ${msg}`, level),
              { skipFinalSubmit: debugSkipFinalSubmit }
            );
          }
          ok = true;
          break;
        } catch (err) {
          lastError = err;
          if (attempt >= maxRetry || !isRetryableError(err)) break;
        }
      }

      if (ok && debugSkipFinalSubmit) {
        log(
          `[${label}] DA DUNG LAI TRUOC SUBMIT CUOI (che do debug) — KHONG dong tab/trinh duyet. ` +
          'Tu bam "Xac dinh" tren trinh duyet va kiem tra thu cong. Luot chay se dung o day (chi xu ly 1 case).',
          'warn'
        );
        results.push({ index: i + 1, excelRow, label, data: caseItem, status: 'ok', error: null, screenshot: null, video: null });
        emit({ type: 'result', index: i + 1, total, label, status: 'ok', error: null, video: null });
        keepBrowserOpen = true; // khong dong context/browser o finally ben duoi
        break;
      }

      if (ok && debugKeepBrowserOpen) {
        log(
          `[${label}] Da chay het (ke ca submit cuoi, tu Cancel dialog) — GIU tab/trinh duyet mo ` +
          '(che do debug) de tu kiem tra ket qua. Luot chay se dung o day (chi xu ly 1 case).',
          'warn'
        );
        results.push({ index: i + 1, excelRow, label, data: caseItem, status: 'ok', error: null, screenshot: null, video: null });
        emit({ type: 'result', index: i + 1, total, label, status: 'ok', error: null, video: null });
        keepBrowserOpen = true; // khong dong casePage/context/browser o finally ben duoi
        break;
      }

      if (!ok && debugKeepBrowserOpen) {
        log(
          `[${label}] Loi xong nhung GIU tab/trinh duyet mo (che do debug) de tu kiem tra. ` +
          'Luot chay se dung o day (chi xu ly 1 case).',
          'warn'
        );
        const message = lastError ? lastError.message : 'Loi khong xac dinh';
        results.push({ index: i + 1, excelRow, label, data: caseItem, status: 'error', error: message, screenshot: null, video: null });
        emit({ type: 'result', index: i + 1, total, label, status: 'error', error: message, screenshot: null, video: null });
        keepBrowserOpen = true;
        break;
      }

      let screenshot = null;
      if (!ok) {
        try {
          screenshot = path.join(
            screenshotDir,
            `loi-ho-so-${excelRow}-${safeFileName(label)}.png`
          );
          await casePage.screenshot({ path: screenshot, fullPage: true });
        } catch {
          screenshot = null;
        }

        // Ban ke cau truc trang (err.diagnostics) chi danh cho nguoi ky thuat:
        // ghi ra file canh anh chup, KHONG dua vao thong bao hien tren man hinh.
        if (lastError && (lastError.diagnostics || jsErrors.length > 0)) {
          try {
            const diagPath = path.join(
              screenshotDir,
              `loi-ho-so-${excelRow}-${safeFileName(label)}.chan-doan.txt`
            );
            const phan = [
              `Ho so: ${label}`,
              `Dong Excel: ${excelRow}`,
              `Thoi diem: ${new Date().toLocaleString('vi-VN')}`,
              `Loi: ${lastError.message}`,
            ];
            if (jsErrors.length > 0) {
              phan.push('', '--- loi JavaScript cua trang dich ---', jsErrors.join('\n'));
            }
            if (lastError.diagnostics) {
              phan.push('', '--- cau truc trang luc loi ---', lastError.diagnostics);
            }
            fs.writeFileSync(diagPath, phan.join('\n') + '\n', 'utf8');
          } catch {
            // khong ghi duoc file chan doan thi bo qua, khong lam hong luot chay
          }
        }
      }

      const tempVideoPath = await closePageAndGetVideoPath(casePage);
      let video = null;
      if (recordVideo && tempVideoPath) {
        video = path.join(videoDir, `ho-so-${excelRow}-${safeFileName(label)}.webm`);
        try {
          fs.renameSync(tempVideoPath, video);
        } catch {
          video = tempVideoPath; // giu duong dan goc neu doi ten khong thanh cong
        }
      }

      if (ok) {
        results.push({
          index: i + 1,
          excelRow,
          label,
          data: caseItem,
          status: 'ok',
          error: null,
          screenshot: null,
          video,
        });
        emit({ type: 'result', index: i + 1, total, label, status: 'ok', error: null, video });
      } else {
        // Loi JS cua trang dich KHONG dua vao thong bao cho nguoi dung: no la
        // loi ben trong trang (vd "Cannot read properties of undefined"), nguoi
        // nhap lieu khong lam gi duoc voi no. Da ghi trong file .chan-doan.txt.
        const message = lastError ? lastError.message : 'Loi khong xac dinh';
        results.push({
          index: i + 1,
          excelRow,
          label,
          data: caseItem,
          status: 'error',
          error: message,
          screenshot,
          video,
        });
        emit({ type: 'result', index: i + 1, total, label, status: 'error', error: message, screenshot, video });
      }
    }
  } catch (err) {
    // Loi nghiem trong (vi du dang nhap that bai) -> dung ca luot chay
    log(`Loi nghiem trong: ${err.message}`, 'error');
    emit({ type: 'fatal', message: err.message });
  } finally {
    if (keepBrowserOpen) {
      log('Che do debug: giu trinh duyet mo, khong tu dong dong. Dong tab/trinh duyet thu cong khi kiem tra xong.', 'warn');
    } else {
      await closeQuietly(context);
      await closeQuietly(browser);
    }
  }

  const okCount = results.filter((r) => r.status === 'ok').length;
  const errorCount = results.filter((r) => r.status === 'error').length;
  const summary = {
    total,
    processed: results.length,
    ok: okCount,
    error: errorCount,
    skipped: total - results.length,
    stoppedByUser,
  };

  emit({ type: 'done', summary, results });
  return { summary, results };
}

module.exports = { runAutomation };
