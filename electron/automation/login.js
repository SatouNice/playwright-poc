// electron/automation/login.js
// Tai su dung logic tu POC (automation/login.js), chi khac: khong console.log nua
// ma bao cao qua callback `log` de main process day len UI qua IPC.
//
// LUU Y BAO MAT: khong bao gio dua credentials.password vao log.

const { dumpFrames } = require('./frameDiag');

/**
 * @param {import('playwright').Page} page
 * @param {object} config - config.loginPage tu config.json
 * @param {string} baseUrl
 * @param {{ userId: string, password: string }} credentials
 * @param {(msg: string) => void} [log]
 */
async function login(page, config, baseUrl, credentials, log = () => {}) {
  const loginUrl = baseUrl + config.path;
  log(`Dang mo trang dang nhap: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  // Mot so he thong co nhieu lua chon dang nhap (vd radio "dang nhap vao he thong nao"),
  // chi can khi config co khai bao thi moi chon truoc khi dien tai khoan/mat khau.
  if (config.radioSelector) {
    await page.check(config.radioSelector);
  }

  await page.fill(config.userIdSelector, credentials.userId);
  await page.fill(config.passwordSelector, credentials.password);

  log(`Dang dang nhap voi tai khoan: ${credentials.userId}`);

  // Mot so he thong (vd servlet dispatcher cu dung frameset) dung chung 1 URL cho ca
  // truoc va sau khi dang nhap -> khong the cho URL doi de biet thanh cong, va phan tu
  // xac nhan co the nam trong 1 frame con (khong phai trang chinh). Neu config co khai
  // bao `successSelector` thi uu tien cho theo phan tu dac trung; neu co them
  // `successFrameSelector` (selector cua the <frame>/<iframe> chua no) thi dung
  // frameLocator de tim xuyen dung vao frame do — frameLocator tu dong tra cuu lai
  // frame moi neu frameset bi tai lai sau khi submit, khong bi "stale" nhu Frame handle.
  const successScope = config.successFrameSelector
    ? page.frameLocator(config.successFrameSelector)
    : page;
  const successLocator = config.successSelector
    ? successScope.locator(config.successSelector).first()
    : null;

  await Promise.all([
    successLocator
      ? successLocator.waitFor({ timeout: 10000 }).catch(() => null)
      : page.waitForURL(`**${config.successUrlContains}`, { timeout: 10000 }).catch(() => null),
    page.click(config.submitSelector),
  ]);

  const currentUrl = page.url();
  const ok = successLocator
    ? await successLocator.isVisible().catch(() => false)
    : currentUrl.includes(config.successUrlContains);

  if (!ok) {
    // Chan doan: liet ke toan bo frame tren trang (+ o nhap/nut bam) de phat hien
    // truong hop trang dung frame/iframe (page.locator o cap page chinh se khong
    // tu tim xuyen vao frame con) hoac selector trong config.json da sai/doi.
    let frameDiag = '';
    try {
      frameDiag = '\n' + (await dumpFrames(page, { matchSelector: config.successSelector }));
    } catch (diagErr) {
      frameDiag = `\n(Khong lay duoc thong tin frame: ${diagErr.message})`;
    }

    // Thong bao cho nguoi dung phai ngan va noi dung viec ho can lam. Ban ke
    // cau truc trang di rieng qua err.diagnostics (runner ghi ra file).
    const err = new Error(
      'Dang nhap khong thanh cong. Kiem tra lai User ID va mat khau.'
    );
    err.diagnostics = `URL hien tai: ${currentUrl}${frameDiag}`;
    throw err;
  }

  log('Dang nhap thanh cong.');
}

/**
 * Kiem tra xem session da luu (storageState) con dung nhap duoc khong.
 * Tra ve true neu vao thang duoc trang form ma khong bi da ve trang login.
 *
 * @param {import('playwright').Page} page
 * @param {object} config - toan bo config.json
 */
async function isSessionValid(page, config) {
  const formUrl = config.baseUrl + config.formPage.path;
  try {
    await page.goto(formUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
  } catch {
    return false;
  }
  return page.url().includes(config.formPage.path);
}

module.exports = { login, isSessionValid };
