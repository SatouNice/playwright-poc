// scripts/test-one-case.js
// Chay thu automation voi 1 file Excel, KHONG can mo app Electron.
//
//   npm run test-case                          (mac dinh: sample-data/danh-sach-that.xlsx)
//   npm run test-case -- duong/dan/file.xlsx
//   npm run test-case -- file.xlsx --submit    (bam ca nut "Xac dinh" cuoi cung)
//
// Mac dinh chay o che do debugSkipFinalSubmit: dung lai NGAY TRUOC nut "Xac dinh"
// cuoi cung va giu trinh duyet mo de tu kiem tra. Luu y: du vay no VAN bam
// "Lap ho so" nen van tao ho so tren UAT.
//
// Tai khoan lay tu .env (SBCS_USER_ID / SBCS_PASSWORD) — khong in mat khau ra log.

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(ROOT, 'pw-browsers');

const { readExcel } = require('../electron/automation/excelReader');
const { groupIntoCases } = require('../electron/automation/caseGrouper');
const { runAutomation } = require('../electron/automation/runner');
const { writeReport } = require('../electron/automation/report');

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (/^".*"$/.test(value) || /^'.*'$/.test(value)) value = value.slice(1, -1);
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const submit = args.includes('--submit');
  const file = args.find((a) => !a.startsWith('--')) || 'sample-data/danh-sach-that.xlsx';
  const excelPath = path.isAbsolute(file) ? file : path.join(ROOT, file);

  const env = loadEnv();
  if (!env.SBCS_USER_ID || !env.SBCS_PASSWORD) {
    throw new Error('Thieu SBCS_USER_ID / SBCS_PASSWORD trong .env');
  }

  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron/automation/config.json'), 'utf8'));
  config.run = {
    ...config.run,
    debugSkipFinalSubmit: !submit,
    // Giu trinh duyet mo chi khi co --keep: neu khong, tien trinh node se treo
    // mai vi runner co y khong dong context (xem debugKeepBrowserOpen trong runner.js).
    debugKeepBrowserOpen: args.includes('--keep'),
    recordVideo: true,
  };

  console.log(`File Excel : ${excelPath}`);
  const parsed = await readExcel(excelPath, config);
  if (parsed.errors.length) {
    console.error(`Excel co ${parsed.errors.length} loi:`);
    for (const e of parsed.errors) console.error(`   dong ${e.row} / ${e.column}: ${e.message}`);
    process.exit(1);
  }

  const { cases, errors } = groupIntoCases(parsed.rows);
  if (errors.length) {
    console.error(`Du lieu co ${errors.length} loi:`);
    for (const e of errors) console.error(`   ${e.column}: ${e.message}`);
    process.exit(1);
  }

  console.log(`So case    : ${cases.length}`);
  console.log(`Che do     : ${submit ? 'CHAY THAT (bam ca nut Xac dinh cuoi)' : 'DUNG TRUOC NUT "Xac dinh" cuoi cung'}`);
  console.log('');

  const outDir = path.join(ROOT, '.agent', 'test-run-' + Date.now());
  fs.mkdirSync(outDir, { recursive: true });

  // Mac dinh chi chay 1 case cho nhanh; --all de chay het file (dung khi muon
  // kiem vong lap nhieu dong). Luu y: che do debugSkipFinalSubmit lam runner dung
  // ngay sau case dau tien, nen muon chay het thi phai kem --submit.
  const chayHet = args.includes('--all');
  if (chayHet && !submit) {
    console.log('LUU Y: --all ma khong co --submit thi runner van dung sau case dau tien.');
  }

  const result = await runAutomation({
    config,
    cases: chayHet ? cases : cases.slice(0, 1),
    credentials: { userId: env.SBCS_USER_ID, password: env.SBCS_PASSWORD },
    remember: false,
    storageStatePath: null,
    screenshotDir: path.join(outDir, 'screenshots'),
    videoDir: path.join(outDir, 'videos'),
    emit: (ev) => {
      // In ca log noi bo: khong co no thi khong thay duoc cac dong [dialog] —
      // tuc la khong biet trang co hoi confirm() hay khong (ma code thi luon
      // bam Cancel cho confirm, du dang la nguyen nhan submit bi huy ngam).
      if (ev.type === 'log') console.log(`${ev.level === 'warn' ? '[!]' : '   '} ${ev.message}`);
      if (ev.type === 'progress') console.log(`[tien do] ${ev.current}/${ev.total} — ${ev.label}`);
      if (ev.type === 'result') console.log(`[ket qua] ${ev.label}: ${ev.status}${ev.error ? ' — ' + ev.error : ''}`);
    },
    shouldStop: () => false,
  });

  console.log('');
  console.log('=== KET QUA ===');
  for (const r of result.results || []) {
    console.log(`  ${r.label}: ${r.status}`);
    if (r.error) console.log(`     loi: ${r.error}`);
    if (r.screenshot) console.log(`     anh: ${r.screenshot}`);
  }

  // Xuat bao cao giong het duong app Electron van lam (ipcMain 'report:export'),
  // chi khac la ghi thang ra file thay vi hoi cho luu.
  const reportPath = path.join(outDir, 'bao-cao-ket-qua.xlsx');
  try {
    await writeReport(reportPath, result.results || [], config, {
      sourceFile: excelPath,
      summary: result.summary,
    });
    console.log(`\nBao cao     : ${reportPath}`);
  } catch (err) {
    console.log(`\nKhong ghi duoc bao cao: ${err.message}`);
  }

  console.log(`Thu muc ket qua: ${outDir}`);
}

main().catch((err) => {
  console.error('LOI:', err.message);
  process.exit(1);
});
