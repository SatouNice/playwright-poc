// electron/automation/report.js
// Xuat bao cao ket qua chay ra file Excel (.xlsx).
// Bao cao chi chua du lieu tu file Excel dau vao + trang thai — khong bao gio chua mat khau.

const ExcelJS = require('exceljs');

const STATUS_TEXT = { ok: 'Thanh cong', error: 'Loi' };

/**
 * @param {string} filePath duong dan file .xlsx se ghi ra
 * @param {Array<object>} results ket qua tu runner.runAutomation
 * @param {object} config noi dung config.json
 * @param {object} [meta] thong tin them: { sourceFile, summary }
 */
async function writeReport(filePath, results, config, meta = {}) {
  const fields = config.formPage.fields;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Insurance Illustration App';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Ket qua');

  sheet.columns = [
    { header: 'STT', key: 'index', width: 6 },
    { header: 'Dong Excel', key: 'excelRow', width: 11 },
    ...fields.map((f) => ({ header: f.excelColumn, key: f.excelColumn, width: 20 })),
    { header: 'Nguoi phu thuoc', key: 'dependents', width: 40 },
    { header: 'San pham phu', key: 'subProducts', width: 40 },
    { header: 'Trang thai', key: 'status', width: 12 },
    { header: 'Ly do loi', key: 'error', width: 60 },
    { header: 'Anh chup loi', key: 'screenshot', width: 40 },
    { header: 'Video', key: 'video', width: 40 },
  ];

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF7' },
  };

  for (const r of results) {
    const row = { index: r.index, excelRow: r.excelRow };
    for (const f of fields) row[f.excelColumn] = r.data ? r.data[f.excelColumn] : '';
    const dependents = r.data?.dependents || [];
    row.dependents = dependents.length
      ? dependents.map((d) => d.ho_ten_npt).filter(Boolean).join(', ')
      : '';
    const subProducts = r.data?.subProducts || [];
    row.subProducts = subProducts.length
      ? subProducts.map((sp) => `${sp.loai_sp}:${sp.ma_sp}`).join(', ')
      : '';
    row.status = STATUS_TEXT[r.status] || r.status;
    row.error = r.error || '';
    row.screenshot = r.screenshot || '';
    row.video = r.video || '';

    const added = sheet.addRow(row);
    added.getCell('status').font = {
      color: { argb: r.status === 'ok' ? 'FF15803D' : 'FFB91C1C' },
      bold: true,
    };
  }

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: sheet.columns.length },
  };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Sheet tong ket
  const summarySheet = workbook.addWorksheet('Tong ket');
  summarySheet.columns = [
    { header: 'Muc', key: 'k', width: 28 },
    { header: 'Gia tri', key: 'v', width: 50 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  const s = meta.summary || {};
  const lines = [
    ['File du lieu dau vao', meta.sourceFile || ''],
    ['Thoi diem xuat bao cao', new Date().toLocaleString('vi-VN')],
    ['Tong so dong', s.total ?? results.length],
    ['Da xu ly', s.processed ?? results.length],
    ['Thanh cong', s.ok ?? results.filter((r) => r.status === 'ok').length],
    ['Loi', s.error ?? results.filter((r) => r.status === 'error').length],
    ['Bo qua (do dung giua chung)', s.skipped ?? 0],
    ['Nguoi dung bam Dung', s.stoppedByUser ? 'Co' : 'Khong'],
  ];
  for (const [k, v] of lines) summarySheet.addRow({ k, v });

  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

module.exports = { writeReport };
