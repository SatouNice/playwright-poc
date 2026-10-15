// automation/login.js
// Chiu trach nhiem: mo trang login va dang nhap bang userId/password nguoi dung nhap.

/**
 * @param {import('playwright').Page} page
 * @param {object} config - config.loginPage tu config.json
 * @param {string} baseUrl
 * @param {{ userId: string, password: string }} credentials
 */
async function login(page, config, baseUrl, credentials) {
  const loginUrl = baseUrl + config.path;
  console.log(`[login] Dang mo trang login: ${loginUrl}`);
  await page.goto(loginUrl, { waitUntil: 'domcontentloaded' });

  await page.fill(config.userIdSelector, credentials.userId);
  await page.fill(config.passwordSelector, credentials.password);

  console.log('[login] Dang submit form dang nhap...');
  await Promise.all([
    page.waitForURL(`**${config.successUrlContains}`, { timeout: 10000 }).catch(() => null),
    page.click(config.submitSelector),
  ]);

  const currentUrl = page.url();
  if (!currentUrl.includes(config.successUrlContains)) {
    throw new Error(
      `Dang nhap khong thanh cong. Dang o URL: ${currentUrl}. ` +
      `Kiem tra lai userId/password hoac selector trong config.json.`
    );
  }

  console.log('[login] Dang nhap thanh cong.');
}

module.exports = { login };
