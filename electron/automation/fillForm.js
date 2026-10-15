// electron/automation/fillForm.js
// Dien 1 "case" (Ben Mua Bao Hiem + Nguoi Duoc Bao Hiem + san pham + danh sach
// Nguoi Phu Thuoc) vao form theo mapping trong config.json (formPage.fields +
// formPage.dependentFields). Log gui qua callback thay vi console.log.

const { dumpFrames } = require('./frameDiag');

/**
 * Thay the placeholder trong selector mau bang gia tri thuc te. Dung cho cac
 * field ma DOM khong co id rieng cho tung dong (vd bang nguoi phu thuoc bi ve
 * lai toan bo moi lan them dong — xem loadHTML() trong nhap_thong_tin_kh.jsp):
 *   {i} = chi so dong, dem tu 0 (dung cho id kieu "#CRT0", "#CSN1"...)
 *   {n} = chi so dong, dem tu 1 (dung cho :nth-match(...), vi CSS 1-indexed)
 */
function resolveSelector(template, indexVars) {
  if (!indexVars) return template;
  let selector = template;
  for (const [key, val] of Object.entries(indexVars)) {
    selector = selector.split(`{${key}}`).join(String(val));
  }
  return selector;
}

/**
 * excelReader.js chuan hoa ngay ve YYYY-MM-DD noi bo, nhung cac o ngay tren
 * trang that la text thuong theo dinh dang dd/mm/yyyy — phai doi lai truoc khi dien.
 */
function toDisplayDate(isoValue) {
  const m = String(isoValue).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return String(isoValue); // khong dung dinh dang ISO thi giu nguyen
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/**
 * Dien 1 nhom field (case-level hoac dependent-level) vao trang hien tai.
 * @param {import('playwright').Page} page
 * @param {Array<object>} fields danh sach field (config.formPage.fields hoac .dependentFields)
 * @param {object} data du lieu tuong ung, key la excelColumn
 * @param {(msg: string) => void} log
 * @param {{i: number, n: number}} [indexVars] chi so dong (xem resolveSelector) — chi dung cho dependentFields
 */
async function fillFields(page, fields, data, log, indexVars) {
  for (const field of fields) {
    // field.selector == null danh dau cac cot chi dung o buoc sau (vd man nhap
    // san pham, xem fillProduct.js) — khong thuoc trang dang dien o day.
    if (!field.selector) continue;

    const value = data[field.excelColumn];
    if (value === undefined || value === null || value === '') {
      log(`Bo qua truong "${field.excelColumn}" vi khong co du lieu.`);
      continue;
    }

    const selector = resolveSelector(field.selector, indexVars);

    switch (field.type) {
      case 'text':
      case 'date': {
        const displayValue = field.type === 'date' ? toDisplayDate(value) : String(value);
        await page.fill(selector, displayValue);
        break;
      }
      case 'select':
        // Cho phep Excel ghi nhan hien thi hoac ma gia tri that — thu khop theo
        // nhan truoc (timeout ngan vi phan lon truong hop Excel ghi thang ma so
        // nen se khong khop nhan, khong can doi het 15s moi fallback), khong
        // duoc thi fallback sang khop theo value.
        try {
          await page.selectOption(selector, { label: String(value) }, { timeout: 1000 });
        } catch {
          await page.selectOption(selector, String(value));
        }
        break;
      case 'radio': {
        // field.selector la mau co "{value}" — vd input[name=IS_COMPANY][value="{value}"],
        // thay the bang gia tri thuc te vi 1 nhom radio co nhieu input cung name.
        // Neu ma Excel khac voi value that cua DOM (vd Excel ghi 0/1 nhung DOM dung
        // A1/A2), field.valueMap se dich lai truoc khi thay vao selector.
        const domValue = field.valueMap && field.valueMap[String(value)] !== undefined
          ? field.valueMap[String(value)]
          : String(value);
        const radioSelector = selector.replace('{value}', domValue);
        await page.check(radioSelector);
        break;
      }
      case 'checkbox': {
        const shouldCheck = value === true || value === 'true' || value === 1 || value === '1';
        const isChecked = await page.isChecked(selector);
        if (shouldCheck !== isChecked) {
          await page.click(selector);
        }
        break;
      }
      default:
        log(`Kieu truong "${field.type}" chua duoc ho tro, bo qua "${field.excelColumn}".`);
    }
  }

  // Xac nhan lai toan bo o text/date SAU KHI da dien het ca nhom — vi 1 field
  // dien SAU co the kich hoat rebuild lam mat gia tri cua field dien TRUOC do
  // (khong chi field ngay lien ke), nen chi kiem tra ngay sau khi dien 1 field
  // (o tren) la chua du, phai quet lai toan bo. Lam 2 vong vi ban than viec
  // dien-lai cung co the kich hoat rebuild anh huong nguoc lai field da kiem
  // truoc do trong cung 1 vong.
  for (let pass = 0; pass < 2; pass++) {
    for (const field of fields) {
      if (!field.selector) continue;
      if (field.type !== 'text' && field.type !== 'date') continue;
      const value = data[field.excelColumn];
      if (value === undefined || value === null || value === '') continue;

      const selector = resolveSelector(field.selector, indexVars);
      const displayValue = field.type === 'date' ? toDisplayDate(value) : String(value);
      const current = await page.inputValue(selector).catch(() => null);
      if (current !== displayValue) {
        log(`Dien lai "${field.excelColumn}" vi gia tri bi mat sau khi trang ve lai form.`, 'warn');
        await page.fill(selector, displayValue);
      }
    }
  }
}

/**
 * @param {import('playwright').Page} page
 * @param {object} config - config.formPage tu config.json
 * @param {string} baseUrl
 * @param {object} caseData - 1 case (BMBH + NDBH + san pham + dependents[])
 * @param {(msg: string) => void} [log]
 */
async function fillForm(page, config, baseUrl, caseData, log = () => {}) {
  const formUrl = baseUrl + config.path;

  // Luon quay lai trang form truoc moi case (sau khi submit se o trang success)
  if (!page.url().includes(config.path)) {
    await page.goto(formUrl, { waitUntil: 'domcontentloaded' });
  }

  try {
    await fillFields(page, config.fields, caseData, log);

    const dependents = caseData.dependents || [];
    for (let i = 0; i < dependents.length; i++) {
      const dependent = dependents[i];
      log(`Them nguoi phu thuoc #${i + 1}: ${dependent.ho_ten_npt || '(khong ten)'}`);
      await page.click(config.dependentButtonSelector);
      // Moi lan bam them dong, JS trang dich ve lai toan bo bang NPT (xem loadHTML()
      // trong nhap_thong_tin_kh.jsp) nen phai tro dung dong thu {i}/{n} vua duoc them.
      await fillFields(page, config.dependentFields, dependent, log, { i, n: i + 1 });
    }

    // Trang dispatcher cu dung chung 1 URL (vd "ATF0_0200/toInsertAll") cho ca
    // khi thanh cong lan that bai validate phia server, URL khong doi nhung noi
    // dung thi doi — nen uu tien kiem tra theo `successSelector` (vd chu "ATF00300"
    // — ma trang ket qua) neu config co khai bao, thay vi chi dua vao URL.
    const successLocator = config.successSelector
      ? page.locator(config.successSelector).first()
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
      throw new Error(
        `Submit form khong thanh cong (dang o ${currentUrl}). ` +
        `Co the chuong trinh dich bao loi validate hoac selector da thay doi.`
      );
    }
  } catch (err) {
    // Chan doan: neu selector (o nhap/nut submit) sai hoac trang dung frame, liet ke
    // cau truc thuc te (o nhap/nut bam trong tung frame) de biet duong sua config.json.
    let frameDiag = '';
    try {
      frameDiag = '\n' + (await dumpFrames(page));
    } catch (diagErr) {
      frameDiag = `\n(Khong lay duoc thong tin frame: ${diagErr.message})`;
    }
    err.message = `${err.message}${frameDiag}`;
    throw err;
  }
}

module.exports = { fillForm };
