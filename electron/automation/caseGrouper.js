// electron/automation/caseGrouper.js
// Ap dung cac quy tac nghiep vu co dieu kien (is_company/is_policy/nguoi phu
// thuoc/san pham chinh/san pham phu) cho tung dong da qua excelReader.js validate
// dinh dang. Moi dong Excel la 1 "case" (1 ho so bao hiem = Ben Mua Bao Hiem +
// Nguoi Duoc Bao Hiem + san pham chinh + san pham phu); nguoi phu thuoc va san
// pham phu da duoc excelReader gan san vao row.dependents/row.subProducts (tu cot
// JSON), o day chi con validate tinh bat buoc cua tung field.

const CASE_FIELDS = [
  'is_company',
  'loai_giay_chung_minh_bmbh',
  'so_giay_chung_minh_bmbh',
  'ho_ten_bmbh',
  'sinh_nhat_bmbh',
  'gioi_tinh_bmbh',
  'nghe_nghiep_bmbh',
  'is_policy',
  'loai_giay_chung_minh_ndbh',
  'so_giay_chung_minh_ndbh',
  'ho_ten_ndbh',
  'sinh_nhat_ndbh',
  'gioi_tinh_ndbh',
  'nghe_nghiep_ndbh',
  'ma_san_pham',
  'ngay_tham_gia_bh',
  'agent_emp_no',
  'face_amt',
  'matur_ind',
  'matur_age',
  'prem_pay_period',
  'pay_freq_type',
  'method_prem_pay',
];

const DEPENDENT_FIELDS = [
  'loai_nguoi_phu_thuoc',
  'loai_giay_chung_minh_npt',
  'so_giay_chung_minh_npt',
  'ho_ten_npt',
  'sinh_nhat_npt',
  'gioi_tinh_npt',
  'nghe_nghiep_npt',
];

const SUB_PRODUCT_FIELDS = ['loai_sp', 'ma_sp', 'so_giay_chung_minh', 'so_tien_bao_hiem', 'rider_amt'];

function isBlank(value) {
  return value === undefined || value === null || value === '';
}

function requireField(row, col, errors, context) {
  if (isBlank(row[col])) {
    errors.push({
      row: row.__row,
      column: col,
      message: `Thieu du lieu bat buoc "${col}"${context ? ' ' + context : ''}.`,
    });
  }
}

/** Validate cac field cap case — ap dung cho moi dong (1 dong = 1 case) */
function validateCaseRow(row, errors) {
  requireField(row, 'is_company', errors);
  requireField(row, 'loai_giay_chung_minh_bmbh', errors);
  requireField(row, 'so_giay_chung_minh_bmbh', errors);
  requireField(row, 'ho_ten_bmbh', errors);
  requireField(row, 'is_policy', errors);
  requireField(row, 'ma_san_pham', errors);
  requireField(row, 'ngay_tham_gia_bh', errors);
  requireField(row, 'agent_emp_no', errors);
  requireField(row, 'face_amt', errors, '(du lieu san pham chinh)');
  requireField(row, 'prem_pay_period', errors, '(du lieu san pham chinh)');
  requireField(row, 'pay_freq_type', errors, '(du lieu san pham chinh)');
  requireField(row, 'method_prem_pay', errors, '(du lieu san pham chinh)');

  if (row.is_company === 'A1') {
    requireField(row, 'sinh_nhat_bmbh', errors, '(bat buoc khi is_company=A1 - ca nhan)');
    requireField(row, 'gioi_tinh_bmbh', errors, '(bat buoc khi is_company=A1 - ca nhan)');
    requireField(row, 'nghe_nghiep_bmbh', errors, '(bat buoc khi is_company=A1 - ca nhan)');
  }

  if (row.is_policy === 'B1') {
    requireField(row, 'loai_giay_chung_minh_ndbh', errors, '(bat buoc khi is_policy=B1)');
    requireField(row, 'so_giay_chung_minh_ndbh', errors, '(bat buoc khi is_policy=B1)');
    requireField(row, 'ho_ten_ndbh', errors, '(bat buoc khi is_policy=B1)');
    requireField(row, 'sinh_nhat_ndbh', errors, '(bat buoc khi is_policy=B1)');
    requireField(row, 'gioi_tinh_ndbh', errors, '(bat buoc khi is_policy=B1)');
    requireField(row, 'nghe_nghiep_ndbh', errors, '(bat buoc khi is_policy=B1)');
  }

}

/** Validate 1 phan tu nguoi phu thuoc (tu mang JSON) — chi ap dung khi co ho_ten_npt */
function validateDependentRow(dep, errors) {
  const ctx = `(bat buoc khi co nguoi phu thuoc, muc thu ${(dep.__index ?? 0) + 1})`;
  for (const col of DEPENDENT_FIELDS) {
    if (col === 'ho_ten_npt') continue;
    requireField(dep, col, errors, ctx);
  }
}

/** Validate 1 phan tu san pham phu (tu mang JSON) */
function validateSubProductRow(sp, errors) {
  const ctx = `(bat buoc khi co san pham phu, muc thu ${(sp.__index ?? 0) + 1})`;
  requireField(sp, 'loai_sp', errors, ctx);
  requireField(sp, 'ma_sp', errors, ctx);
  requireField(sp, 'so_giay_chung_minh', errors, ctx);

  if (sp.loai_sp === 'SPP') {
    requireField(sp, 'so_tien_bao_hiem', errors, '(bat buoc khi loai_sp=SPP)');
  }
  if (sp.loai_sp === 'CMR') {
    requireField(sp, 'rider_amt', errors, '(bat buoc khi loai_sp=CMR)');
  }
}

/**
 * @param {Array<object>} rows cac dong da qua excelReader.readExcel (co __row, dependents[], subProducts[])
 * @returns {{ cases: Array<object>, errors: Array<object> }}
 */
function groupIntoCases(rows) {
  const errors = [];

  const cases = rows.map((row) => {
    validateCaseRow(row, errors);

    const caseItem = {
      __rows: [row.__row],
      dependents: row.dependents || [],
      subProducts: row.subProducts || [],
    };
    for (const col of CASE_FIELDS) caseItem[col] = row[col];

    for (const dep of caseItem.dependents) {
      if (!isBlank(dep.ho_ten_npt)) validateDependentRow(dep, errors);
    }

    for (const sp of caseItem.subProducts) {
      validateSubProductRow(sp, errors);
    }

    return caseItem;
  });

  return { cases, errors };
}

module.exports = { groupIntoCases, CASE_FIELDS, DEPENDENT_FIELDS, SUB_PRODUCT_FIELDS };
