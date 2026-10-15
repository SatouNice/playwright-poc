// electron/automation/frameDiag.js
// Doc cau truc frame + cac o nhap/nut bam tren trang de chan doan khi selector sai
// (dung chung cho login.js va fillForm.js). Chi doc thong tin cau truc (tag/id/name),
// khong doc gia tri nguoi dung da nhap.

const CLICKABLE_SELECTOR = 'button, a, input[type=button], input[type=submit], [role=button]';
/**
 * Rut gon thong bao loi cua he thong dich thanh MOT CAU nguoi dung hieu duoc.
 *
 * Alert cua he thong co dang nhieu dong lan ca tieng Trung va ten lop Java:
 *
 *   回傳碼Return Code:0
 *   訊息說明Message:
 *   1. com.cathay.common.exception.UCException
 *   The agent doesn't have R03 certificate!
 *   Dai ly chua co chung chi cua san pham: R03
 *
 * Nguoi nhap lieu chi can dong cuoi. Ham nay bo cac dong ky thuat va uu tien
 * giu lai cau tieng Viet; neu khong co thi lay cau tieng Anh de hieu nhat.
 */
function rutGonThongBaoLoi(raw) {
  const text = String(raw || '').trim();
  if (!text) return 'Loi khong xac dinh';

  const BO_QUA = [
    /^\d+\.\s*[\w.]+Exception/i, // "1. com.cathay.common.exception.UCException"
    /^[\w.]+Exception/i,
    /return\s*code/i,
    /^訊息說明/,
    /^回傳碼/,
    /^message\s*:?$/i,
  ];

  const dong = text
    .split(/\r?\n/)
    .map((d) => d.replace(/^\s*\d+\.\s*/, '').trim())
    .filter((d) => d && !BO_QUA.some((re) => re.test(d)));

  if (dong.length === 0) return text.split(/\r?\n/)[0].trim();

  // Uu tien dong co dau tieng Viet
  const tiengViet = dong.find((d) => /[àáâãèéêìíòóôõùúăđĩũơưăạảấầẩẫậắằẳẵặẹẻẽềềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(d));
  return tiengViet || dong[dong.length - 1];
}

const INPUT_SELECTOR = 'input, select, textarea';

/**
 * @param {import('playwright').Page} page
 * @param {object} [options]
 * @param {string} [options.matchSelector] selector muon dem so phan tu khop trong tung frame
 */
async function dumpFrames(page, { matchSelector } = {}) {
  const frames = page.frames();

  const info = await Promise.all(
    frames.map(async (f, idx) => {
      let matchCount = 0;
      if (matchSelector) {
        try {
          matchCount = await f.locator(matchSelector).count();
        } catch {
          matchCount = -1; // selector loi cu phap trong frame nay
        }
      }

      let snippet = '';
      try {
        const text = await f.locator('body').innerText({ timeout: 2000 });
        snippet = text.replace(/\s+/g, ' ').trim().slice(0, 200);
      } catch {
        snippet = '';
      }

      let clickable = [];
      try {
        clickable = await f
          .locator(CLICKABLE_SELECTOR)
          .evaluateAll((els) =>
            els.map((el) => (el.value || el.textContent || '').replace(/\s+/g, ' ').trim()).filter(Boolean)
          );
      } catch {
        clickable = [];
      }

      let inputs = [];
      try {
        inputs = await f.locator(INPUT_SELECTOR).evaluateAll((els) =>
          els.map((el) => ({
            tag: el.tagName,
            type: el.type || null,
            id: el.id || null,
            name: el.name || null,
            // Voi radio/checkbox can biet value that de biet dung selector nao ung
            // voi lua chon nao (vd input[name=IS_COMPANY][value="0"]).
            value: el.type === 'radio' || el.type === 'checkbox' ? el.value : null,
            // Voi <select>, lay luon danh sach option (value=nhan) — can de biet
            // gia tri hop le truyen vao page.selectOption(), khong the doan duoc.
            options:
              el.tagName === 'SELECT'
                ? Array.from(el.options)
                    .slice(0, 25)
                    .map((o) => `${o.value}=${o.text}`.trim())
                : null,
          }))
        );
      } catch {
        inputs = [];
      }
      const inputsText = inputs
        .map((i) => {
          let s = `${i.tag}${i.type ? '[' + i.type + ']' : ''}${i.name ? ' name=' + i.name : ''}${
            i.id ? ' id=' + i.id : ''
          }`;
          if (i.value !== null && i.value !== undefined && i.value !== '') s += ` value=${i.value}`;
          if (i.options && i.options.length) s += ` options=[${i.options.join(', ')}]`;
          return s;
        })
        .join(' | ');

      return (
        `  #${idx} name="${f.name()}" url="${f.url()}" so-phan-tu-khop=${matchCount}\n` +
        `      noi-dung: ${snippet || '(rong/khong doc duoc)'}\n` +
        `      nut/link: ${clickable.length ? clickable.slice(0, 25).join(' | ') : '(khong co)'}\n` +
        `      o-nhap: ${inputsText || '(khong co)'}`
      );
    })
  );

  return `Danh sach frame tren trang (${frames.length} frame):\n${info.join('\n')}`;
}

module.exports = { dumpFrames, rutGonThongBaoLoi };
