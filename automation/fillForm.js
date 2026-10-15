// automation/fillForm.js
// Chiu trach nhiem: dien 1 dong du lieu vao form theo mapping trong config.json

/**
 * @param {import('playwright').Page} page
 * @param {object} config - config.formPage tu config.json
 * @param {string} baseUrl
 * @param {object} rowData - 1 dong du lieu, key la excelColumn
 */
async function fillForm(page, config, baseUrl, rowData) {
  const formUrl = baseUrl + config.path;

  // Neu chua o dung trang form thi dieu huong toi
  if (!page.url().includes(config.path)) {
    await page.goto(formUrl, { waitUntil: 'domcontentloaded' });
  }

  for (const field of config.fields) {
    const value = rowData[field.excelColumn];
    if (value === undefined || value === null || value === '') {
      console.log(`[fillForm] Bo qua field "${field.excelColumn}" vi khong co du lieu.`);
      continue;
    }

    switch (field.type) {
      case 'text':
      case 'date':
        await page.fill(field.selector, String(value));
        break;
      case 'select':
        await page.selectOption(field.selector, String(value));
        break;
      case 'checkbox': {
        const shouldCheck = value === true || value === 'true' || value === 1 || value === '1';
        const isChecked = await page.isChecked(field.selector);
        if (shouldCheck !== isChecked) {
          await page.click(field.selector);
        }
        break;
      }
      default:
        console.warn(`[fillForm] Type "${field.type}" chua duoc ho tro, bo qua field "${field.excelColumn}".`);
    }
  }

  console.log(`[fillForm] Dang submit form cho: ${rowData.ho_ten || '(khong ro ten)'}`);
  await Promise.all([
    page.waitForURL(`**${config.successUrlContains}`, { timeout: 10000 }).catch(() => null),
    page.click(config.submitSelector),
  ]);

  const currentUrl = page.url();
  if (!currentUrl.includes(config.successUrlContains)) {
    throw new Error(
      `Submit form khong thanh cong cho dong: ${JSON.stringify(rowData)}. Dang o URL: ${currentUrl}`
    );
  }
}

module.exports = { fillForm };
