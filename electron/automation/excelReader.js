// electron/automation/excelReader.js
// Doc file Excel (.xlsx) bang exceljs va validate dinh dang tung o theo mapping
// trong config.json (formPage.fields). Moi dong = 1 case (Ben Mua Bao Hiem +
// Nguoi Duoc Bao Hiem + san pham); nguoi phu thuoc (co the nhieu, so luong khac
// nhau tuy case) nam trong 1 cot rieng (formPage.dependentsColumn) duoi dang
// chuoi JSON mang, vd [{"ho_ten_npt":"...","sinh_nhat_npt":"01/01/2021",...}].
// Chi validate dinh dang/kieu du lieu o day — cac quy tac nghiep vu co dieu kien
// (is_company/is_policy/nguoi phu thuoc) duoc xu ly rieng o caseGrouper.js.
//
// Ket qua tra ve:
//   {
//     valid: boolean,
//     rows: [ { __row: 2, is_company: 'A1', ..., dependents: [{...}] }, ... ],
//     errors: [ { row: 5, column: 'ngay_sinh', message: '...' }, ... ],
//     columns: ['is_company', ...],
//     sheetName: 'Sheet1'
//   }

const ExcelJS = require('exceljs');

/** Chuan hoa ten cot header: bo khoang trang thua, ve chu thuong */
function normalizeHeader(value) {
  return String(extractCellValue(value) ?? '').trim().toLowerCase();
}

/** Lay gia tri "tho" cua 1 o Excel, xu ly cac kieu dac biet cua exceljs */
function extractCellValue(raw) {
  if (raw === null || raw === undefined) return null;
  if (raw instanceof Date) return raw;
  if (typeof raw === 'object') {
    if (Array.isArray(raw.richText)) return raw.richText.map((t) => t.text).join('');
    if ('text' in raw) return raw.text; // hyperlink
    if ('result' in raw) return raw.result; // formula
    if ('error' in raw) return null;
  }
  return raw;
}

function isEmptyValue(value) {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '');
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * Chuyen nhieu dinh dang ngay ve chuoi YYYY-MM-DD (dinh dang input[type=date] can).
 * Tra ve null neu khong parse duoc.
 */
function toIsoDate(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    // exceljs tra ve Date o moc UTC -> dung getUTC* de khong bi lech mui gio
    return `${value.getUTCFullYear()}-${pad2(value.getUTCMonth() + 1)}-${pad2(value.getUTCDate())}`;
  }

  if (typeof value === 'number') {
    // Excel serial date (moc 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
  }

  const text = String(value).trim();

  let m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m) return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));

  m = text.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/); // dd/mm/yyyy
  if (m) return buildDate(Number(m[3]), Number(m[2]), Number(m[1]));

  return null;
}

function buildDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null; // vi du 31/02
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** Kiem tra 1 dong Excel co rong hoan toan khong (chi xet cac cot bat buoc) */
function isRowEmpty(row, columnIndexes) {
  return Object.values(columnIndexes).every((colIdx) =>
    isEmptyValue(extractCellValue(row.getCell(colIdx).value))
  );
}

/**
 * Validate + chuan hoa 1 gia tri theo dinh nghia field (dung chung cho ca cot
 * Excel thuong va tung phan tu trong mang JSON cua cot nguoi phu thuoc).
 * @returns {{ value: string, error: string|null }}
 */
function validateFieldValue(field, raw) {
  if (isEmptyValue(raw)) return { value: '', error: null };

  if (field.type === 'date') {
    const iso = toIsoDate(raw);
    if (!iso) return { value: '', error: `Ngay khong hop le: "${String(raw)}". Dinh dang chap nhan: DD/MM/YYYY.` };
    return { value: iso, error: null };
  }

  if ((field.type === 'select' || field.type === 'radio') && Array.isArray(field.options)) {
    const text = String(raw).trim();
    const match = field.options.find((o) => o.toLowerCase() === text.toLowerCase());
    if (!match) return { value: '', error: `Gia tri "${text}" khong hop le. Chi chap nhan: ${field.options.join(', ')}.` };
    return { value: match, error: null };
  }

  // Truong text: canh bao neu Excel luu duoi dang so (mat so 0 dau / sai dinh dang) —
  // tru cac truong so luong/tien te thuan tuy (field.numeric) thi khong mat thong tin gi.
  if (typeof raw === 'number' && !field.numeric) {
    return {
      value: '',
      error: 'Dang bi Excel luu duoi dang so nen co the mat so 0 o dau. Hay dinh dang thanh Text roi nhap lai.',
    };
  }

  const text = String(raw).trim();

  if (field.numeric && !/^\d+$/.test(text)) {
    return { value: '', error: `Phai la so (chi gom chu so), dang la "${text}".` };
  }

  if (field.maxLength && text.length > field.maxLength) {
    return { value: '', error: `Dai toi da ${field.maxLength} ky tu (dang co ${text.length} ky tu).` };
  }
  return { value: text, error: null };
}

/**
 * Doc + validate 1 cot chua chuoi JSON dang mang (dung chung cho cot nguoi phu
 * thuoc va cot san pham phu) — tra ve mang cac phan tu da duoc validate/chuan hoa
 * theo itemFields, moi phan tu kem __row/__index de caseGrouper.js dan chieu loi.
 */
function parseJsonArrayColumn(row, colIdx, columnName, itemFields, rowNumber, errors) {
  const items = [];
  const cell = colIdx !== undefined ? row.getCell(colIdx) : null;
  const raw = cell ? extractCellValue(cell.value) : null;

  if (isEmptyValue(raw)) return items;

  let list = null;
  try {
    list = JSON.parse(String(raw));
  } catch (err) {
    errors.push({ row: rowNumber, column: columnName, message: `JSON khong hop le: ${err.message}` });
    return items;
  }

  if (!Array.isArray(list)) {
    errors.push({
      row: rowNumber,
      column: columnName,
      message: `Cot "${columnName}" phai la JSON dang mang, vi du [{"...":"..."}].`,
    });
    return items;
  }

  list.forEach((item, idx) => {
    const parsed = { __row: rowNumber, __index: idx };
    for (const field of itemFields) {
      const col = field.excelColumn;
      const { value, error } = validateFieldValue(field, item ? item[col] : null);
      if (error) errors.push({ row: rowNumber, column: `${columnName}[${idx}].${col}`, message: error });
      parsed[col] = value;
    }
    items.push(parsed);
  });

  return items;
}

/**
 * @param {string} filePath duong dan file .xlsx
 * @param {object} config toan bo noi dung config.json
 */
async function readExcel(filePath, config) {
  const fields = config.formPage.fields; // chi cot case-level; cac cot JSON doc rieng ben duoi
  const dependentFields = config.formPage.dependentFields || [];
  const dependentsColumn = config.formPage.dependentsColumn || 'dependents';
  const subProductFields = config.productPage?.subProductFields || [];
  const subProductsColumn = config.productPage?.subProductsColumn || 'san_pham_phu';
  const errors = [];
  const rows = [];
  const allColumns = () => [...fields.map((f) => f.excelColumn), dependentsColumn, subProductsColumn];

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.readFile(filePath);
  } catch (err) {
    return {
      valid: false,
      rows: [],
      columns: allColumns(),
      sheetName: null,
      errors: [{ row: null, column: null, message: `Khong doc duoc file Excel: ${err.message}` }],
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      valid: false,
      rows: [],
      columns: allColumns(),
      sheetName: null,
      errors: [{ row: null, column: null, message: 'File Excel khong co sheet nao.' }],
    };
  }

  // --- 1. Doc header (dong dau tien) ---
  const headerRow = sheet.getRow(1);
  const headerMap = {}; // ten cot -> chi so cot
  const duplicated = new Set();
  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const name = normalizeHeader(cell.value);
    if (!name) return;
    if (headerMap[name] !== undefined) duplicated.add(name);
    else headerMap[name] = colNumber;
  });

  for (const name of duplicated) {
    errors.push({ row: 1, column: name, message: `Cot "${name}" bi lap lai trong dong tieu de.` });
  }

  const columnIndexes = {};
  for (const field of fields) {
    const colIdx = headerMap[field.excelColumn.toLowerCase()];
    if (colIdx === undefined) {
      errors.push({
        row: 1,
        column: field.excelColumn,
        message: `Thieu cot bat buoc "${field.excelColumn}" o dong tieu de.`,
      });
    } else {
      columnIndexes[field.excelColumn] = colIdx;
    }
  }

  const dependentsColIdx = headerMap[dependentsColumn.toLowerCase()];
  if (dependentsColIdx === undefined) {
    errors.push({
      row: 1,
      column: dependentsColumn,
      message: `Thieu cot bat buoc "${dependentsColumn}" o dong tieu de (cot chua JSON nguoi phu thuoc, co the de trong tung o).`,
    });
  }

  const subProductsColIdx = headerMap[subProductsColumn.toLowerCase()];
  if (subProductsColIdx === undefined) {
    errors.push({
      row: 1,
      column: subProductsColumn,
      message: `Thieu cot bat buoc "${subProductsColumn}" o dong tieu de (cot chua JSON san pham phu, co the de trong tung o).`,
    });
  }

  // Thieu cot thi khong doc tiep duoc -> tra loi ngay
  if (errors.length > 0) {
    return {
      valid: false,
      rows: [],
      columns: allColumns(),
      sheetName: sheet.name,
      errors,
    };
  }

  // --- 2. Xac dinh dong cuoi cung thuc su co du lieu ---
  let lastDataRow = 1;
  for (let r = sheet.rowCount; r >= 2; r--) {
    if (!isRowEmpty(sheet.getRow(r), columnIndexes)) {
      lastDataRow = r;
      break;
    }
  }

  if (lastDataRow === 1) {
    return {
      valid: false,
      rows: [],
      columns: allColumns(),
      sheetName: sheet.name,
      errors: [{ row: null, column: null, message: 'File khong co dong du lieu nao (chi co tieu de).' }],
    };
  }

  // --- 3. Duyet tung dong du lieu ---
  for (let r = 2; r <= lastDataRow; r++) {
    const row = sheet.getRow(r);

    if (isRowEmpty(row, columnIndexes)) {
      errors.push({
        row: r,
        column: null,
        message: 'Dong trong nam giua vung du lieu. Hay xoa dong nay roi upload lai.',
      });
      continue;
    }

    const parsed = { __row: r };

    for (const field of fields) {
      const cell = row.getCell(columnIndexes[field.excelColumn]);
      const raw = extractCellValue(cell.value);
      const col = field.excelColumn;

      const { value, error } = validateFieldValue(field, raw);
      if (error) errors.push({ row: r, column: col, message: `Cot "${col}": ${error}` });
      parsed[col] = value;
    }

    // --- Cot nguoi phu thuoc + san pham phu: chuoi JSON dang mang ---
    const dependents = parseJsonArrayColumn(row, dependentsColIdx, dependentsColumn, dependentFields, r, errors);
    parsed.dependents = dependents;

    const subProducts = parseJsonArrayColumn(row, subProductsColIdx, subProductsColumn, subProductFields, r, errors);
    parsed.subProducts = subProducts;
    parsed[subProductsColumn] = subProducts.length ? `${subProducts.length} san pham phu` : '';

    // Gia tri hien thi ngan gon cho bang preview (cot goc la JSON, khong nen in tho ra UI)
    parsed[dependentsColumn] = dependents.length ? `${dependents.length} nguoi phu thuoc` : '';

    rows.push(parsed);
  }

  return {
    valid: errors.length === 0,
    rows,
    columns: allColumns(),
    sheetName: sheet.name,
    errors,
  };
}

module.exports = { readExcel, toIsoDate };
