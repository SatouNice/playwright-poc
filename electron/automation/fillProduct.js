// electron/automation/fillProduct.js
// Dien man "san pham" sau khi nhap xong khach hang (ATF0_0200 submit xong se
// chuyen thang vao day). Man chinh la ATF0_0300/toUpdate, man san pham bo tro la
// ATF0_0311/toDisplay302.
//
// VIET LAI 14/10/2026 cho giao dien moi, doi chieu tren UAT that
// (xem .agent/dom-snapshots/20261014-142423/). Khac ban cu o 3 diem lon:
//
//  1. KHONG CON 2 BIEN THE. Ban cu phan "truyen thong" (ATF00300) va "cai tien"
//     (ATF00315) voi 2 bo selector rieng; giao dien moi don ca hai ve cung mot
//     trang ATF0_0300/toUpdate nen detectVariant() da bi bo han.
//  2. KHONG CHO THEO URL NUA. Khi di qua menu, moi man nam trong mainFrame cua
//     html/CM/menu2/frame.jsp nen URL cap tren KHONG doi sau moi buoc — waitForURL
//     cua ban cu luon bao "trang khong dieu huong di dau". Gio cho theo PHAN TU
//     DAC TRUNG cua man dich (xem clickAndWait).
//  3. DINH VI DONG SAN PHAM BO TRO BANG data-rider-row-key. Moi <tr> cua man SPP
//     co san thuoc tinh dang "1|040165007393|3|R13" =
//     loai giay|so giay chung minh|vai tro|ma san pham, nen khong con phai dung meo
//     "tim o so tien theo id roi doi nguoc len ancestor::tr" nhu truoc.

const { dumpFrames, rutGonThongBaoLoi } = require('./frameDiag');

// Mot so alert() thuc ra la thong bao THANH CONG (vd "Return Code:0 ... thanh cong"),
// khong phai loi validate — nhan dien qua noi dung de khong bao loi nham.
const SUCCESS_ALERT_PATTERN = /return code\s*:\s*0|thành công|completes/i;

// NHUNG "Return Code:0" KHONG dang tin: 14/10/2026 gap thong bao LOI cung mo dau
// bang "Return Code:0" —
//   "Return Code:0 ... com.cathay.common.exception.UCException
//    The agent doesn't have R03 certificate! Dai ly chua co chung chi cua san pham: R03"
// Neu chi dua vao SUCCESS_ALERT_PATTERN thi loi nay bi nuot, submit bi huy im lang
// va chi thay trieu chung "trang khong dieu huong". Vi vay bat ky alert nao co dau
// hieu loi duoi day deu tinh la LOI, bat ke Return Code bao nhieu.
const FAILURE_ALERT_PATTERN = /exception|chưa có|không hợp lệ|doesn't have|invalid|lỗi/i;

/** alert() nay la bao loi hay bao thanh cong? */
function isErrorAlert(message) {
  if (FAILURE_ALERT_PATTERN.test(message)) return true;
  return !SUCCESS_ALERT_PATTERN.test(message);
}

// Popup "kiem tra gioi han RGA" KHONG phai confirm() goc cua trinh duyet ma la
// the <dialog> tu ve bang JS -> page.on('dialog') khong bao gio thay.
// Da kiem chung 14/10/2026: hai id nay VAN CON tren man ATF0_0300.
const CUSTOM_CONFIRM_DIALOG_SELECTOR = '#dialog_confirm';
const CUSTOM_CONFIRM_CANCEL_SELECTOR = '#dialog_confirm_cancel';

/**
 * Bat dialog native. alert() bao loi validate thi ghi lai de nem loi; alert() bao
 * thanh cong thi bo qua; confirm()/prompt() luon Cancel (khong phai loi).
 */
function attachDialogCapture(page, log) {
  const messages = [];
  page.on('dialog', async (dialog) => {
    log(`[dialog] (${dialog.type()}): "${dialog.message()}" — dang dismiss (Cancel)...`, 'warn');
    if (dialog.type() === 'alert' && isErrorAlert(dialog.message())) {
      messages.push(dialog.message());
    }
    try {
      await page.waitForTimeout(200);
      await dialog.dismiss();
    } catch (err) {
      log(`[dialog] dismiss() bi loi: ${err.message}`, 'warn');
    }
  });
  return messages;
}

/** Neu popup <dialog> tu ve xuat hien (vd gioi han RGA) thi bam Cancel. */
async function dismissCustomConfirmDialog(page, log) {
  const appeared = await page
    .locator(CUSTOM_CONFIRM_DIALOG_SELECTOR)
    .waitFor({ state: 'visible', timeout: 3000 })
    .then(() => true, () => false);
  if (!appeared) return;

  const message = await page
    .locator(`${CUSTOM_CONFIRM_DIALOG_SELECTOR} p`)
    .first()
    .innerText()
    .catch(() => '(khong doc duoc noi dung)');
  log(`[custom dialog] "${message}" — bam Cancel.`, 'warn');
  await page.locator(CUSTOM_CONFIRM_CANCEL_SELECTOR).click();
}

/**
 * Bam 1 nut roi cho MAN DICH hien ra, nhan biet bang phan tu dac trung cua no
 * (`expectSelector`) chu khong phai bang URL — xem ghi chu (2) o dau file.
 *
 * @param {string} expectSelector phan tu chi co o man dich (vd o FACE_AMT cho man
 *   san pham chinh, 'tr[data-rider-row-key]' cho man san pham bo tro)
 */
async function clickAndWait(page, selector, expectSelector, dialogMessages, log) {
  const before = dialogMessages.length;

  await page.click(selector);
  await dismissCustomConfirmDialog(page, log);

  if (dialogMessages.length > before) {
    throw new Error(`Trang bao loi khi bam "${selector}": ${dialogMessages.slice(before).map(rutGonThongBaoLoi).join(' | ')}`);
  }

  const arrived = await page
    .locator(expectSelector)
    .first()
    .waitFor({ state: 'visible', timeout: 15000 })
    .then(() => true, () => false);

  if (!arrived) {
    throw new Error(
      `Bam "${selector}" xong nhung khong thay man dich (cho "${expectSelector}" khong ra). ` +
      `Co the submit bi huy ngam, hoac selector da doi.`
    );
  }

  log(`Da bam "${selector}", da sang man co "${expectSelector}".`);
}

/**
 * Bam nut "Xac dinh (Confirm)" CUOI CUNG.
 *
 * Khac clickAndWait o cho: KHONG cho man dich nao ca. Theo quy trinh nghiep vu
 * (nguoi dung xac nhan 14/10/2026), bam duoc nut nay la coi nhu xong — trang sau
 * do di dau khong con quan trong. Neu van bat buoc cho man san pham chinh hien
 * lai nhu truoc thi se bao loi oan khi trang dieu huong sang cho khac.
 *
 * Van kiem tra alert bao loi, vi do la dau hieu viec luu KHONG thanh cong.
 */
async function clickFinalSubmit(page, selector, dialogMessages, log) {
  const before = dialogMessages.length;

  await page.click(selector);
  await dismissCustomConfirmDialog(page, log);

  // Cho mot nhip de alert (neu co) kip xuat hien va duoc handler ghi lai.
  await page.waitForTimeout(1000);

  if (dialogMessages.length > before) {
    throw new Error(`Trang bao loi khi bam "Xac dinh (Confirm)": ${dialogMessages.slice(before).map(rutGonThongBaoLoi).join(' | ')}`);
  }

  log('Da bam "Xac dinh (Confirm)" cuoi cung — coi nhu hoan tat ho so.');
}

/** Dropdown bi khoa tuong tac (tuy san pham) — khong phai loi, chi bo qua. */
async function isLocked(page, selector) {
  return page
    .locator(selector)
    .first()
    .evaluate((el) =>
      el.disabled === true ||
      el.getAttribute('aria-disabled') === 'true' ||
      el.className.includes('select-interaction-locked')
    )
    .catch(() => true);
}

/** Dien cac field cua man san pham chinh. */
async function fillMainProductFields(page, fields, data, log) {
  for (const field of fields) {
    const value = data[field.excelColumn];
    if (value === undefined || value === null || value === '') continue;
    const text = String(value);

    if (field.skipIfLocked && (await isLocked(page, field.selector))) {
      log(`Bo qua "${field.excelColumn}" vi o dang bi khoa tren trang (tuy san pham).`);
      continue;
    }

    if (field.type === 'select') {
      // Excel co the ghi nhan hien thi hoac ma gia tri — thu khop nhan truoc
      // (timeout ngan), khong duoc thi fallback sang khop theo value.
      try {
        await page.selectOption(field.selector, { label: text }, { timeout: 1000 });
      } catch {
        await page.selectOption(field.selector, text);
      }
      continue;
    }

    await page.fill(field.selector, text);
  }
}

/**
 * Tim dong san pham bo tro cua dung nguoi + dung ma san pham, dua vao
 * data-rider-row-key = "loaiGiay|soGiayChungMinh|vaiTro|maSanPham".
 */
function riderRow(page, rowSelector, cert, maSp) {
  const safeCert = String(cert).replace(/"/g, '');
  const safeMaSp = String(maSp).replace(/"/g, '');
  return page
    .locator(`${rowSelector}[data-rider-row-key*="|${safeCert}|"][data-rider-row-key$="|${safeMaSp}"]`)
    .first();
}

/**
 * Man san pham bo tro (SPP): luoi checkbox + o so tien, gom TAT CA muc SPP cua
 * case vao 1 lan vao man nay.
 */
async function fillSppScreen(page, sppConfig, markerSelector, items, dialogMessages, log) {
  for (const item of items) {
    const row = riderRow(page, sppConfig.rowSelector, item.so_giay_chung_minh, item.ma_sp);

    if ((await row.count()) === 0) {
      throw new Error(
        `Khong tim thay dong san pham bo tro cho so_giay_chung_minh=${item.so_giay_chung_minh}, ma_sp=${item.ma_sp}.`
      );
    }

    await row.locator(sppConfig.checkboxSelector).first().check({ timeout: 5000 });

    const amountValue = String(item.so_tien_bao_hiem || '');

    // O "So tien bao hiem" cua moi dong co 2 DANG tuy san pham (da xac nhan tren
    // UAT 14/10/2026):
    //   - o nhap tu do, vd R13 "Benh hiem ngheo" (60.000 - 5.000.000)
    //   - dropdown phan tram, vd R15 "Ho tro dong phi 2026" (150% / 200% / 250%)
    // Ca hai deu dong bo sang cung field an RIDER_AMT, nhung thao tac khac nhau.
    const amountSelect = row.locator(sppConfig.amountSelectSelector).first();
    const isDropdown = (await amountSelect.count()) > 0;

    if (isDropdown) {
      // Excel co the ghi "150" hoac "150%" — thu khop theo value truoc, roi den nhan.
      try {
        await amountSelect.selectOption(amountValue, { timeout: 1000 });
      } catch {
        await amountSelect.selectOption({ label: amountValue });
      }
    } else {
      // QUAN TRONG: o so tien KHONG co thuoc tinh name — gia tri chi duoc dong bo
      // sang field an RIDER_AMT (cai thuc su gui len server) qua su kien 'keyup'.
      // .fill() set gia tri thang khong phat sinh keyup -> server nhan so tien rong
      // -> muc bo tro bi loai am tham. Phai go tung ky tu that nhu nguoi dung.
      const amountInput = row.locator(sppConfig.amountSelector).first();
      await amountInput.fill('');
      await amountInput.pressSequentially(amountValue, { delay: 30 });
    }

    log(
      `SPP: da tick + ${isDropdown ? 'chon' : 'dien'} so tien (${amountValue}) ` +
      `cho ma_sp=${item.ma_sp}, so_giay_chung_minh=${item.so_giay_chung_minh}.`
    );
  }

  // Bam "Xac dinh" de luu danh sach bo tro VA quay ve man san pham chinh.
  //
  // LUU Y (xac nhan 14/10/2026): cu bam dau tien dua trang sang
  // ATF0_0311/toInsertRiderTemp302 ma VAN con nut "Xac dinh"/"Roi bo" — chua ve
  // man san pham chinh. Theo quy trinh nghiep vu, van bam "Xac dinh" lan nua de
  // quay lai (KHONG bam "Roi bo": nut do la roi man khong luu).
  const MAX_LAN_BAM = 3;
  for (let lan = 1; lan <= MAX_LAN_BAM; lan++) {
    const before = dialogMessages.length;

    await page.click(sppConfig.submitSelector);
    await dismissCustomConfirmDialog(page, log);

    if (dialogMessages.length > before) {
      throw new Error(`Trang bao loi khi luu san pham bo tro: ${dialogMessages.slice(before).map(rutGonThongBaoLoi).join(' | ')}`);
    }

    const daVeManChinh = await page
      .locator(markerSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true, () => false);

    if (daVeManChinh) {
      log(`Da luu san pham bo tro va quay ve man san pham chinh (sau ${lan} lan bam "Xac dinh").`);
      return;
    }

    const conONanBoTro = (await page.locator(sppConfig.submitSelector).count()) > 0;
    if (!conONanBoTro) {
      throw new Error(
        'Bam "Xac dinh" o man bo tro xong nhung khong con thay nut do, cung chua ve man san pham chinh. ' +
        `Dang o ${page.url()}.`
      );
    }
    log(`Van o man bo tro sau lan bam thu ${lan} — bam "Xac dinh" tiep.`, 'warn');
  }

  throw new Error(
    `Da bam "Xac dinh" ${MAX_LAN_BAM} lan o man san pham bo tro ma van chua ve duoc man san pham chinh. ` +
    `Dang o ${page.url()}.`
  );
}

/**
 * Man san pham bo tro CMR (ATF0_0300/toDisplay310, ma trang ATF00313).
 *
 * KHAC han man SPP (cau truc lay tu lan chay that 14/10/2026):
 *  - KHONG co thuoc tinh data-rider-row-key tren <tr>. Moi dong chi nhan dien
 *    duoc qua 1 input an:
 *       <input name="RIDER_PREM_PAY_PERIOD" id="2411167800007R09">
 *    id = vaiTro + soGiayChungMinh + maSanPham. Excel khong cho biet vaiTro nen
 *    khop theo DUOI chuoi (soGiay + maSP), roi di nguoc len <tr> gan nhat.
 *  - Chi hien NGUOI DUOC BAO HIEM va nguoi phu thuoc; BMBH khong co mat.
 *  - Hang muc la <select name="RIDER_AMT">: 1=Bac, 2=Vang, 3=Bach Kim.
 *  - Nut dong ten la "Roi khoi" (man SPP la "Roi bo").
 */
async function fillCmrGroup(page, cmrConfig, markerSelector, maSp, items, dialogMessages, log) {
  for (const item of items) {
    const cert = String(item.so_giay_chung_minh).replace(/"/g, '');
    const anchorSelector = cmrConfig.rowAnchorSelector
      .split('{cert}').join(cert)
      .split('{maSp}').join(String(maSp).replace(/"/g, ''));

    const anchor = page.locator(anchorSelector).first();
    if ((await anchor.count()) === 0) {
      throw new Error(
        `Khong tim thay dong CMR cho so_giay_chung_minh=${item.so_giay_chung_minh}, ma_sp=${maSp}. ` +
        `Man CMR chi chao NDBH va nguoi phu thuoc (khong co BMBH), va chi mot so ma nhat dinh.`
      );
    }

    const row = anchor.locator('xpath=ancestor::tr[1]');
    await row.locator(cmrConfig.checkboxSelector).first().check({ timeout: 5000 });

    const tier = String(item.rider_amt);
    const tierSelect = row.locator(cmrConfig.tierSelectSelector).first();
    try {
      await tierSelect.selectOption(tier, { timeout: 1000 });
    } catch {
      // Excel co the ghi ten hang muc ("Bac"/"Vang"/"Bach Kim") thay vi ma so
      await tierSelect.selectOption({ label: (cmrConfig.hangMuc || {})[tier] || tier });
    }

    const tenHangMuc = (cmrConfig.hangMuc || {})[tier];
    log(
      `CMR: da tick + chon hang muc ${tier}${tenHangMuc ? ` (${tenHangMuc})` : ''} ` +
      `cho so_giay_chung_minh=${item.so_giay_chung_minh}, ma_sp=${maSp}.`
    );
  }

  // Giong man SPP: bam "Xac dinh" (KHONG phai "Roi khoi") de luu va quay ve man
  // san pham chinh; co the phai bam hon 1 lan.
  const MAX_LAN_BAM = 3;
  for (let lan = 1; lan <= MAX_LAN_BAM; lan++) {
    const before = dialogMessages.length;

    await page.click(cmrConfig.submitSelector);
    await dismissCustomConfirmDialog(page, log);

    if (dialogMessages.length > before) {
      throw new Error(`Trang bao loi khi luu san pham CMR: ${dialogMessages.slice(before).map(rutGonThongBaoLoi).join(' | ')}`);
    }

    const daVeManChinh = await page
      .locator(markerSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true, () => false);

    if (daVeManChinh) {
      log(`Da luu san pham CMR va quay ve man san pham chinh (sau ${lan} lan bam "Xac dinh").`);
      return;
    }

    if ((await page.locator(cmrConfig.submitSelector).count()) === 0) {
      throw new Error(
        'Bam "Xac dinh" o man CMR xong nhung khong con thay nut do, cung chua ve man san pham chinh. ' +
        `Dang o ${page.url()}.`
      );
    }
    log(`Van o man CMR sau lan bam thu ${lan} — bam "Xac dinh" tiep.`, 'warn');
  }

  throw new Error(
    `Da bam "Xac dinh" ${MAX_LAN_BAM} lan o man CMR ma van chua ve duoc man san pham chinh. Dang o ${page.url()}.`
  );
}

/**
 * @param {import('playwright').Page} page dang o man san pham chinh (sau khi fillForm submit xong)
 * @param {object} config config.productPage tu config.json
 * @param {object} caseData 1 case (co subProducts[] tu excelReader/caseGrouper)
 * @param {(msg: string, level?: string) => void} [log]
 * @param {{ skipFinalSubmit?: boolean }} [options]
 */
async function fillProduct(page, config, caseData, log = () => {}, options = {}) {
  const dialogMessages = attachDialogCapture(page, log);
  const main = config.main;

  try {
    // Xac nhan dang dung o man san pham chinh truoc khi lam gi.
    const onMainScreen = await page
      .locator(main.markerSelector)
      .first()
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true, () => false);

    if (!onMainScreen) {
      throw new Error(
        `Khong nhan ra man san pham chinh (khong thay "${main.markerSelector}"). ` +
        `Dang o ${page.url()}.`
      );
    }

    const subProducts = caseData.subProducts || [];

    // THU TU DUNG THEO QUY TRINH NGHIEP VU (nguoi dung xac nhan 14/10/2026):
    //
    //   1. Dien so tien bao hiem san pham chinh
    //   2. Bam "Xac dinh"  -> hien hop xac nhan -> chon CANCEL
    //   3. Sang man san pham phu, nhap xong quay lai
    //   4. Bam "Xac dinh" LAN NUA -> lai chon CANCEL
    //
    // Ban cu lam NGUOC LAI (san pham phu truoc, san pham chinh sau, chi bam "Xac
    // dinh" 1 lan o cuoi) kem ghi chu rang FACE_AMT bi reset ve 0 neu dieu huong
    // truoc khi xac dinh. Nguyen nhan that chinh la thieu buoc 2: phai bam "Xac
    // dinh" lan dau de luu xuong server TRUOC khi roi trang, thi gia tri moi con.

    // Nhieu ma bo tro bat buoc NDBH chinh phai duoc tick truoc thi cac vai tro
    // khac moi tick duoc cung ma do — luon xep NDBH len dau cho an toan.
    const insuredCert = caseData.so_giay_chung_minh_ndbh || caseData.so_giay_chung_minh_bmbh;
    const insuredFirst = (items) =>
      [...items].sort((a, b) => {
        const aFirst = String(a.so_giay_chung_minh) === String(insuredCert);
        const bFirst = String(b.so_giay_chung_minh) === String(insuredCert);
        return aFirst === bFirst ? 0 : aFirst ? -1 : 1;
      });

    const sppItems = insuredFirst(subProducts.filter((sp) => sp.loai_sp === 'SPP'));
    const cmrItems = subProducts.filter((sp) => sp.loai_sp === 'CMR');

    const coSanPhamPhu = sppItems.length > 0 || cmrItems.length > 0;

    // BUOC 1: dien san pham chinh.
    await fillMainProductFields(page, main.fields, caseData, log);

    // Ho so KHONG co san pham phu: dien xong bam "Xac dinh (Confirm)" DUNG 1 LAN
    // la ket thuc luon, khong co nhip bam lan 2.
    if (!coSanPhamPhu) {
      if (options.skipFinalSubmit) {
        log('Ho so khong co san pham phu. DUNG LAI TRUOC KHI BAM "Xac dinh (Confirm)" (debug).', 'warn');
        return;
      }
      log('Ho so khong co san pham phu — bam "Xac dinh (Confirm)" 1 lan de ket thuc.');
      await clickFinalSubmit(page, main.submitSelector, dialogMessages, log);
      return;
    }

    // BUOC 2: co san pham phu -> bam "Xac dinh" lan 1 de LUU san pham chinh
    // xuong server TRUOC khi roi trang. Hop xac nhan hien ra se duoc chon Cancel
    // (confirm() native thi dismiss(), <dialog> tu ve thi bam dung nut Cancel —
    // xem attachDialogCapture va dismissCustomConfirmDialog).
    log('Bam "Xac dinh" lan 1 de luu san pham chinh truoc khi sang man bo tro.');
    await clickAndWait(page, main.submitSelector, main.markerSelector, dialogMessages, log);

    // BUOC 3: man san pham phu
    if (sppItems.length > 0) {
      await clickAndWait(page, main.addSppSelector, config.spp.rowSelector, dialogMessages, log);
      await fillSppScreen(page, config.spp, main.markerSelector, sppItems, dialogMessages, log);
    }

    if (cmrItems.length > 0) {
      const groups = new Map();
      for (const item of cmrItems) {
        if (!groups.has(item.ma_sp)) groups.set(item.ma_sp, []);
        groups.get(item.ma_sp).push(item);
      }
      for (const [maSp, items] of groups) {
        await clickAndWait(page, main.addCmrSelector, config.cmr.markerSelector, dialogMessages, log);
        await fillCmrGroup(page, config.cmr, main.markerSelector, maSp, insuredFirst(items), dialogMessages, log);
      }
    }

    if (options.skipFinalSubmit) {
      log('DUNG LAI TRUOC KHI BAM "Xac dinh (Confirm)" LAN 2 (debug) — tu bam va kiem tra tren trinh duyet.', 'warn');
      return;
    }

    // BUOC 4: da nhap xong san pham phu va quay ve man ngoai -> bam
    // "Xac dinh (Confirm)" lan nua de KET THUC phien nhap.
    log('Bam "Xac dinh (Confirm)" lan 2 de ket thuc phien nhap.');
    await clickFinalSubmit(page, main.submitSelector, dialogMessages, log);
  } catch (err) {
    let frameDiag = '';
    try {
      frameDiag = '\n' + (await dumpFrames(page));
    } catch (diagErr) {
      frameDiag = `\n(Khong lay duoc thong tin frame: ${diagErr.message})`;
    }
    // KHONG nhet ban ke cau truc trang vao err.message nua: trong bang log cua
    // app no bien 1 dong loi thanh mot buc tuong chu, nguoi nhap lieu khong doc
    // noi cau loi that. Dinh kem rieng de runner ghi ra file cho nguoi ky thuat.
    err.diagnostics = frameDiag;
    throw err;
  }
}

module.exports = { fillProduct };
