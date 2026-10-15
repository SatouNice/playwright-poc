// automation/index.js
// Entry point: doc config, dang nhap, sau do dien form cho tung dong du lieu.
//
// Cach chay:
//   node automation/index.js --userId demo --password 123456
//
// (Sau nay se thay sample-data.json bang du lieu doc tu file Excel that)

const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const { login } = require('./login');
const { fillForm } = require('./fillForm');

function parseArgs() {
  const args = process.argv.slice(2);
  const result = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i].replace(/^--/, '');
    result[key] = args[i + 1];
  }
  return result;
}

async function main() {
  const args = parseArgs();
  const userId = args.userId;
  const password = args.password;

  if (!userId || !password) {
    console.error('Thieu tham so. Vi du chay dung: node automation/index.js --userId demo --password 123456');
    process.exit(1);
  }

  const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf-8'));
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'sample-data.json'), 'utf-8'));

  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage();

  const results = [];

  try {
    await login(page, config.loginPage, config.baseUrl, { userId, password });

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      console.log(`\n=== Dang xu ly dong ${i + 1}/${data.length}: ${row.ho_ten} ===`);
      try {
        await fillForm(page, config.formPage, config.baseUrl, row);
        results.push({ row: i + 1, ho_ten: row.ho_ten, status: 'OK' });
        console.log(`[OK] Dong ${i + 1} da nhap thanh cong.`);
      } catch (err) {
        results.push({ row: i + 1, ho_ten: row.ho_ten, status: 'LOI', error: err.message });
        console.error(`[LOI] Dong ${i + 1}: ${err.message}`);

        // Chup man hinh de debug khi loi
        const screenshotPath = path.join(__dirname, `error-row-${i + 1}.png`);
        await page.screenshot({ path: screenshotPath });
        console.error(`Da luu screenshot loi tai: ${screenshotPath}`);
      }
    }
  } catch (err) {
    console.error(`[LOI NGHIEM TRONG] ${err.message}`);
    await page.screenshot({ path: path.join(__dirname, 'error-fatal.png') });
  } finally {
    console.log('\n=== KET QUA TONG HOP ===');
    console.table(results);
    await browser.close();
  }
}

main();
