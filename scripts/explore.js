// scripts/explore.js
// Cong cu KHAO SAT giao dien moi (khong nhap lieu, khong submit gi ca).
//
// Cach dung:
//   npm run explore
//
// Script mo Chromium co giao dien roi DUNG LAI — ban tu dang nhap va tu bam qua
// tron 1 ho so nhu binh thuong. Moi lan trang doi (hoac ban go Enter), script tu
// luu lai: HTML cua tung frame, anh chup man hinh, va danh sach o nhap/nut bam
// kem nhan hien thi. Toan bo phien cung duoc quay video.
//
// Ket qua nam trong .agent/dom-snapshots/<thoi-diem>/ — dung de dung lai
// config.json va sua fillForm.js / fillProduct.js cho giao dien moi.
//
// Dang nhap: lay tu file .env o goc project (xem .env.example). Neu .env chua
// co thi script van chay — chi dung lai o trang dang nhap de ban tu go tay.
//
// BAO MAT: mat khau chi duoc doc tu .env roi dien thang vao trang, KHONG bao gio
// in ra terminal, khong ghi vao file ket qua. File .env da nam trong .gitignore.
// Gia tri cua o password cung duoc xoa khoi HTML truoc khi luu.

const path = require('path');
const fs = require('fs');
const readline = require('readline');

// Dung chromium da tai san trong pw-browsers/ (giong electron/main.js), khong
// phai tai lai vao thu muc cache cua he thong.
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(__dirname, '..', 'pw-browsers');
const { chromium } = require('playwright');

const DEFAULT_URL = 'https://sbcs.cathaylife.com.vn/';

// Selector trang dang nhap — da doi chieu voi giao dien moi (12/10/2026): van giu
// nguyen nhu config.json cu, chi khac la radio bay gio ten la "finalLoginTo".
const LOGIN = {
  radio: '#BCS',
  userId: 'input[name=userID]',
  password: 'input[name=passWD]',
  submit: 'button[type=submit]',
};

/**
 * Doc file .env o goc project. Tu parse thay vi them dependency dotenv — chi can
 * dung KEY=VALUE mot dong, bo qua dong trong va dong comment (#).
 */
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    // Cho phep boc nhay neu mat khau co khoang trang hoac ky tu dac biet
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { url: DEFAULT_URL };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) out.url = args[++i];
  }
  return out;
}

function stamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function slug(text) {
  return String(text || 'man-hinh')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 50) || 'man-hinh';
}

/** Xoa gia tri o mat khau khoi HTML truoc khi ghi ra dia (phong xa). */
function redact(html) {
  return String(html).replace(
    /(<input\b[^>]*\btype\s*=\s*["']password["'][^>]*?)\bvalue\s*=\s*(["']).*?\2/gi,
    '$1value="(da-xoa)"'
  );
}

// Chay trong trang: liet ke moi o nhap / nut bam kem NHAN HIEN THI canh no.
// Nhan la thu quan trong nhat de map sang cot Excel — id/name cua he thong cu
// (CUSTOMER_NAME_3, PROD_ID...) co the da doi het, nhung nhan tieng Viet
// ("Ho ten", "Ma san pham") thi thuong giu nguyen.
const COLLECT_FIELDS = () => {
  const labelOf = (el) => {
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l && l.innerText.trim()) return l.innerText.trim();
    }
    const wrap = el.closest('label');
    if (wrap && wrap.innerText.trim()) return wrap.innerText.trim();

    // Bang kieu JSP cu: nhan nam o <td> ngay truoc o nhap.
    const td = el.closest('td');
    if (td) {
      let prev = td.previousElementSibling;
      while (prev) {
        const t = (prev.innerText || '').trim();
        if (t) return t;
        prev = prev.previousElementSibling;
      }
    }
    const tr = el.closest('tr');
    if (tr) {
      const th = tr.querySelector('th');
      if (th && th.innerText.trim()) return th.innerText.trim();
    }
    return '';
  };

  const visible = (el) =>
    !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);

  const nodes = document.querySelectorAll(
    'input, select, textarea, button, a[onclick], a[href^="javascript"], [role="button"]'
  );

  return Array.from(nodes).map((el) => {
    const tag = el.tagName.toLowerCase();
    const item = {
      tag,
      type: el.type || null,
      id: el.id || null,
      name: el.getAttribute('name') || null,
      label: labelOf(el),
      visible: visible(el),
    };
    if (el.disabled) item.disabled = true;
    if (el.readOnly) item.readonly = true;
    if (el.maxLength > 0) item.maxLength = el.maxLength;
    if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button') {
      item.text = (el.innerText || '').trim().slice(0, 120);
    }
    if (el.type === 'submit' || el.type === 'button') {
      item.text = item.text || el.value || '';
    }
    if (el.type === 'radio' || el.type === 'checkbox') {
      item.value = el.value;
      item.checked = el.checked;
    }
    if (tag === 'select') {
      item.options = Array.from(el.options).map((o) => ({
        value: o.value,
        label: (o.text || '').trim(),
      }));
    }
    return item;
  });
};

/**
 * Chu ky cua man hinh hien tai — doi chu ky thi coi la da sang man khac.
 *
 * KHONG dung text cua trang de lam chu ky: man chinh sau khi dang nhap co so lieu
 * tu cap nhat, cu 1,2 giay lai doi -> lan khao sat 14/10/2026 chup ra 596 anh cho
 * dung 20 man that. Chu ky gio dua vao CAU TRUC (url tung frame + danh sach id/name
 * cua o nhap), la thu chi doi khi thuc su sang man khac.
 */
async function signatureOf(page) {
  try {
    const parts = [page.url()];
    for (const frame of page.frames()) {
      const shape = await frame
        .evaluate(() =>
          Array.from(document.querySelectorAll('input, select, textarea, button'))
            .map((el) => (el.id || el.getAttribute('name') || el.tagName) + ':' + (el.type || ''))
            .join(',')
        )
        .catch(() => '');
      parts.push(`${frame.url()}|${shape}`);
    }
    return parts.join('##');
  } catch {
    return `err-${Date.now()}`;
  }
}

async function main() {
  const { url } = parseArgs();
  const outDir = path.join(__dirname, '..', '.agent', 'dom-snapshots', stamp());
  fs.mkdirSync(outDir, { recursive: true });

  const indexLines = [
    `# Khao sat giao dien — ${new Date().toLocaleString('vi-VN')}`,
    '',
    `URL bat dau: ${url}`,
    '',
    '| # | Ten | URL | So frame | Ghi chu |',
    '|---|---|---|---|---|',
  ];

  console.log('Dang mo Chromium...');
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: null, // dung full cua so that, de thay dung layout nhu nguoi dung
    recordVideo: { dir: path.join(outDir, 'video'), size: { width: 1600, height: 900 } },
  });

  let counter = 0;
  const pages = new Set();

  async function snapshot(page, note = '') {
    counter += 1;
    const no = String(counter).padStart(2, '0');

    // Lay mot doan text dau trang de dat ten file cho de nhan ra man hinh
    // (he thong cu in ma trang kieu "ATF00300" ngay tren dau).
    const headText = await page
      .evaluate(() => (document.body ? document.body.innerText.trim().slice(0, 80) : ''))
      .catch(() => '');
    const name = `${no}-${slug(note || headText || page.url())}`;

    const frames = page.frames();
    const dump = { url: page.url(), note, capturedAt: new Date().toISOString(), frames: [] };

    for (let i = 0; i < frames.length; i++) {
      const frame = frames[i];
      const html = await frame.content().catch(() => '');
      const fields = await frame.evaluate(COLLECT_FIELDS).catch(() => []);
      const frameFile = `${name}.frame${i}.html`;
      fs.writeFileSync(path.join(outDir, frameFile), redact(html), 'utf8');
      dump.frames.push({
        index: i,
        name: frame.name() || null,
        url: frame.url(),
        htmlFile: frameFile,
        fieldCount: fields.length,
        fields,
      });
    }

    fs.writeFileSync(path.join(outDir, `${name}.fields.json`), JSON.stringify(dump, null, 2), 'utf8');
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: true }).catch(() => {});

    indexLines.push(
      `| ${no} | ${name} | ${page.url()} | ${frames.length} | ${note || headText.replace(/\s+/g, ' ').slice(0, 60)} |`
    );
    fs.writeFileSync(path.join(outDir, 'index.md'), indexLines.join('\n'), 'utf8');

    console.log(`  [luu] ${name}  (${frames.length} frame, ${dump.frames.reduce((s, f) => s + f.fieldCount, 0)} o nhap/nut)`);
  }

  // Theo doi 1 tab: tu chup khi chu ky man hinh doi. Dung polling thay vi su kien
  // dieu huong vi chua biet giao dien moi la trang JSP tai lai ca trang hay SPA
  // (chi doi DOM, URL khong doi) — polling bat duoc ca hai.
  async function watch(page, label) {
    pages.add(page);
    page.on('close', () => pages.delete(page));

    // Playmight tu dong dismiss dialog neu khong co listener -> se pha luong bam
    // tay cua nguoi dung. Nen o day alert tu bam OK (alert chi co OK), con
    // confirm/prompt thi HOI LAI tren terminal de chinh ban quyet dinh.
    page.on('dialog', async (dialog) => {
      console.log(`\n[dialog ${dialog.type()}] "${dialog.message()}"`);
      if (dialog.type() === 'alert') {
        await dialog.accept().catch(() => {});
        return;
      }
      const answer = await ask('  -> Bam OK hay Cancel? (o = OK, c = Cancel) [o]: ');
      if (answer.trim().toLowerCase().startsWith('c')) await dialog.dismiss().catch(() => {});
      else await dialog.accept().catch(() => {});
    });

    let last = await signatureOf(page);
    const timer = setInterval(async () => {
      if (page.isClosed()) {
        clearInterval(timer);
        return;
      }
      const sig = await signatureOf(page);
      if (sig !== last) {
        last = sig;
        await new Promise((r) => setTimeout(r, 600)); // cho trang ve xong
        await snapshot(page, '').catch((e) => console.log(`  [loi chup] ${e.message}`));
      }
    }, 1200);

    console.log(`Dang theo doi ${label}.`);
  }

  // Tab/popup moi (man san pham phu co the la popup) cung duoc theo doi.
  context.on('page', async (p) => {
    await p.waitForLoadState('domcontentloaded').catch(() => {});
    console.log(`\n[tab moi] ${p.url()}`);
    await watch(p, 'tab moi');
    await snapshot(p, 'tab-moi').catch(() => {});
  });

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  function ask(q) {
    return new Promise((resolve) => rl.question(q, resolve));
  }

  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await watch(page, 'tab chinh');

  // Dang nhap san bang thong tin trong .env (neu co) de khong phai go lai moi luot
  const env = loadEnv();
  const userId = env.SBCS_USER_ID;
  const password = env.SBCS_PASSWORD;
  let autoLoggedIn = false;

  if (userId && password) {
    console.log(`Dang dang nhap bang .env voi tai khoan: ${userId}`);
    try {
      await page.check(LOGIN.radio);
      await page.fill(LOGIN.userId, userId);
      await page.fill(LOGIN.password, password); // KHONG log gia tri nay
      await page.click(LOGIN.submit);
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      autoLoggedIn = true;
      console.log('Da bam dang nhap — kiem tra lai tren trinh duyet xem co vao duoc khong.');
    } catch (err) {
      console.log(`Khong tu dang nhap duoc (${err.message}). Ban dang nhap tay tren trinh duyet nhe.`);
    }
  } else {
    console.log('Chua thay SBCS_USER_ID / SBCS_PASSWORD trong .env — xem .env.example. Ban dang nhap tay cung duoc.');
  }

  console.log(`
==========================================================
 Cua so Chromium da mo. Gio den luot ban:

 1. ${autoLoggedIn ? 'Kiem tra xem da dang nhap duoc chua (neu chua thi go tay).' : 'Tu dang nhap tren trinh duyet.'}
 2. Bam qua tron 1 ho so nhu binh thuong — KHONG can bam
    nut xac nhan cuoi cung neu ban khong muon tao ho so.
 3. Moi lan trang doi, script tu luu lai.

 Trong terminal nay:
   - Go 1 cai ten roi Enter  -> chup them 1 anh co ghi chu
                                (vd: "man san pham phu")
   - Go  q  roi Enter        -> ket thuc va dong trinh duyet

 Ket qua luu tai:
 ${outDir}
==========================================================
`);

  for (;;) {
    const line = await ask('> ');
    const cmd = line.trim();
    if (cmd.toLowerCase() === 'q') break;
    const target = [...pages].filter((p) => !p.isClosed()).pop();
    if (!target) {
      console.log('Khong con tab nao dang mo.');
      continue;
    }
    await snapshot(target, cmd).catch((e) => console.log(`  [loi chup] ${e.message}`));
  }

  rl.close();
  console.log('\nDang dong trinh duyet va ghi video...');
  await context.close();
  await browser.close();

  console.log(`
Xong. Da luu ${counter} man hinh.
  Danh muc : ${path.join(outDir, 'index.md')}
  Video    : ${path.join(outDir, 'video')}
`);
}

main().catch((err) => {
  console.error(`Loi: ${err.message}`);
  process.exit(1);
});
