// scripts/make-excel-template.js
// Tao file Excel mau DUNG THEO config.json hien tai.
//
//   npm run excel-template
//
// Tieu de cot KHONG viet tay ma lay thang tu config.formPage.fields[].excelColumn
// (+ 2 cot JSON) — do cung la danh sach ma excelReader.js dung de bat loi "thieu cot
// bat buoc", nen file sinh ra luon khop voi config, khong bi lech nhu bo cu
// (scripts/make-sample-excel.js van sinh ra cot tu thoi POC: ho_ten/email/...).
//
// Sinh ra trong sample-data/:
//   mau-chuan.xlsx  — 1 ho so hop le, chi co san pham phu loai SPP -> chay duoc ca luong
//   mau-co-cmr.xlsx — them muc CMR; man CMR CHUA duoc khao sat nen de thu nghiem thoi

const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'sample-data');
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'electron/automation/config.json'), 'utf8'));

const HEADERS = [
  ...config.formPage.fields.map((f) => f.excelColumn),
  config.formPage.dependentsColumn,
  config.productPage.subProductsColumn,
];

// Cot chua so nhung PHAI luu dang text, neu khong Excel se an mat so 0 o dau
// (vd ma dai ly 0100819887) hoac doi sang dang khoa hoc voi so dai.
const TEXT_COLUMNS = new Set([
  'so_giay_chung_minh_bmbh',
  'so_giay_chung_minh_ndbh',
  'agent_emp_no',
]);

const NGUOI_PHU_THUOC = [
  {
    loai_nguoi_phu_thuoc: '0',
    loai_giay_chung_minh_npt: '1',
    so_giay_chung_minh_npt: '992307011111',
    ho_ten_npt: 'STTTEST8DEP',
    sinh_nhat_npt: '01/01/2021',
    gioi_tinh_npt: '1',
    nghe_nghiep_npt: '1',
  },
  {
    loai_nguoi_phu_thuoc: '0',
    loai_giay_chung_minh_npt: '1',
    so_giay_chung_minh_npt: '992307011112',
    ho_ten_npt: 'STTTEST8DET',
    sinh_nhat_npt: '01/01/2021',
    gioi_tinh_npt: '1',
    nghe_nghiep_npt: '1',
  },
];

// Hai muc SPP nay duoc chon co chu dich de thu dung 2 DANG o "So tien bao hiem"
// (xem fillProduct.js / fillSppScreen):
//   R15 "Ho tro dong phi 2026" -> o do la <select> phan tram: ghi 150 / 200 / 250
//   R03 "Ho tro vien phi do tai nan" -> o nhap tu do, don vi "tram": ghi 1000
// Ca hai deu la dong KHONG bi khoa tren UAT (anh chup 14/10/2026), nen chay duoc.
const SAN_PHAM_PHU_SPP = [
  { loai_sp: 'SPP', ma_sp: 'R15', so_giay_chung_minh: '927381876123', so_tien_bao_hiem: '150', rider_amt: '' },
  { loai_sp: 'SPP', ma_sp: 'R03', so_giay_chung_minh: '411167800007', so_tien_bao_hiem: '1000', rider_amt: '' },
];

// Bien the de thu gan san pham phu cho NGUOI PHU THUOC (truoc gio chua chay qua).
//   R15 -> Nguyen Van A (BMBH), dropdown phan tram
//   R03 -> con cai STTTEST8DEP, o nhap tu do, don vi "tram", gioi han 1.000-2.000
const SAN_PHAM_PHU_NPT = [
  { loai_sp: 'SPP', ma_sp: 'R15', so_giay_chung_minh: '927381876123', so_tien_bao_hiem: '150', rider_amt: '' },
  { loai_sp: 'SPP', ma_sp: 'R03', so_giay_chung_minh: '992307011111', so_tien_bao_hiem: '1000', rider_amt: '' },
];

// Chi R15 — la ma DUY NHAT ma dai ly 0100819887 co chung chi (cac ma khac bi
// bao 'The agent doesn't have RXX certificate', xac nhan 14/10/2026).
const SAN_PHAM_PHU_R15 = [
  { loai_sp: 'SPP', ma_sp: 'R15', so_giay_chung_minh: '927381876123', so_tien_bao_hiem: '150', rider_amt: '' },
];

const SAN_PHAM_PHU_CMR = [
  { loai_sp: 'CMR', ma_sp: 'R09', so_giay_chung_minh: '411167800007', so_tien_bao_hiem: '', rider_amt: '1' },
];

/** 1 ho so mau. Key phai trung ten cot trong config. */
function hoSoMau(sanPhamPhu) {
  return {
    is_company: 'A1',
    loai_giay_chung_minh_bmbh: '1',
    so_giay_chung_minh_bmbh: '927381876123',
    ho_ten_bmbh: 'Nguyễn Văn A',
    sinh_nhat_bmbh: '01/01/1991',
    gioi_tinh_bmbh: '1',
    nghe_nghiep_bmbh: '1',
    is_policy: 'B1',
    loai_giay_chung_minh_ndbh: '1',
    so_giay_chung_minh_ndbh: '411167800007',
    ho_ten_ndbh: 'Trần Thị B',
    sinh_nhat_ndbh: '01/01/1986',
    gioi_tinh_ndbh: '2',
    nghe_nghiep_ndbh: '1',
    ma_san_pham: 'C24',
    ngay_tham_gia_bh: '29/07/2026',
    agent_emp_no: '0100819887',
    face_amt: '500000',
    matur_ind: '1',
    matur_age: '40',
    prem_pay_period: '20',
    pay_freq_type: '4',
    method_prem_pay: '1',
    [config.formPage.dependentsColumn]: JSON.stringify(NGUOI_PHU_THUOC),
    [config.productPage.subProductsColumn]: JSON.stringify(sanPhamPhu),
  };
}

// File 3 dong de kiem VONG LAP nhieu ho so + 3 nhanh khac nhau cua fillProduct:
//   dong 1: KHONG co san pham phu  -> nhanh bam "Xac dinh (Confirm)" DUNG 1 LAN
//   dong 2: chi co SPP             -> nhanh 2 lan bam
//   dong 3: co ca SPP lan CMR      -> nhanh 2 lan bam, di qua ca 2 man con
const BA_DONG = [
  [],
  SAN_PHAM_PHU_R15,
  [...SAN_PHAM_PHU_R15, ...SAN_PHAM_PHU_CMR],
];

async function taoFile(fileName, hoSoList) {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('KhachHang');

  const header = sheet.addRow(HEADERS);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8EEF7' } };
  header.alignment = { vertical: 'middle', wrapText: true };

  for (const hoSo of hoSoList) {
    const row = sheet.addRow(HEADERS.map((h) => hoSo[h] ?? ''));
    HEADERS.forEach((h, i) => {
      if (TEXT_COLUMNS.has(h)) row.getCell(i + 1).numFmt = '@';
    });
  }

  sheet.columns.forEach((c, i) => {
    const name = HEADERS[i] || '';
    c.width = name === config.formPage.dependentsColumn || name === config.productPage.subProductsColumn
      ? 60
      : Math.max(16, name.length + 2);
  });
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  const file = path.join(OUT_DIR, fileName);
  try {
    await wb.xlsx.writeFile(file);
  } catch (err) {
    // Windows khoa file dang mo trong Excel (EBUSY). Bao qua roi di tiep, khong
    // de 1 file dang mo lam hong ca lenh sinh file.
    if (err.code === 'EBUSY' || err.code === 'EPERM') {
      return `(BO QUA ${fileName} — dang mo trong Excel, dong file roi chay lai)`;
    }
    throw err;
  }
  return file;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log(`So cot lay tu config: ${HEADERS.length}`);
  console.log(`   ${HEADERS.join(', ')}`);
  console.log('');
  console.log('Da tao:', await taoFile('mau-chuan.xlsx', [hoSoMau(SAN_PHAM_PHU_SPP)]));
  console.log('Da tao:', await taoFile('mau-co-cmr.xlsx', [hoSoMau([...SAN_PHAM_PHU_R15, ...SAN_PHAM_PHU_CMR])]));
  console.log('Da tao:', await taoFile('mau-npt.xlsx', [hoSoMau(SAN_PHAM_PHU_NPT)]));
  console.log('Da tao:', await taoFile('mau-r15.xlsx', [hoSoMau(SAN_PHAM_PHU_R15)]));
  console.log('Da tao:', await taoFile('mau-3-dong.xlsx', BA_DONG.map(hoSoMau)));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
