// test-server/server.js
// Web server local don gian, dong vai tro "chuong trinh that" de test automation.
// Chay: node test-server/server.js  -> mo http://localhost:3000/login.html
//
// Dung module http co san cua Node, khong phu thuoc thu vien ngoai nao.

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const KIEU_NOI_DUNG = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

// Doi URL thanh duong dan file trong PUBLIC_DIR.
// Tra ve null neu duong dan thoat ra ngoai PUBLIC_DIR (chong path traversal).
function giaiDuongDan(urlPath) {
  let duongDan;
  try {
    duongDan = decodeURIComponent(urlPath.split('?')[0]);
  } catch {
    return null;
  }
  const tuyetDoi = path.join(PUBLIC_DIR, path.normalize(duongDan));
  if (tuyetDoi !== PUBLIC_DIR && !tuyetDoi.startsWith(PUBLIC_DIR + path.sep)) {
    return null;
  }
  return tuyetDoi;
}

const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end('Method Not Allowed');
    return;
  }

  if (req.url === '/' || req.url.startsWith('/?')) {
    res.writeHead(302, { Location: '/login.html' });
    res.end();
    return;
  }

  const duongDanFile = giaiDuongDan(req.url);
  if (!duongDanFile) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(duongDanFile, (err, noiDung) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Not Found');
      return;
    }
    const kieu = KIEU_NOI_DUNG[path.extname(duongDanFile).toLowerCase()]
      || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': kieu, 'Content-Length': noiDung.length });
    res.end(req.method === 'HEAD' ? undefined : noiDung);
  });
});

server.listen(PORT, () => {
  console.log(`Test server dang chay tai: http://localhost:${PORT}`);
  console.log(`Trang login: http://localhost:${PORT}/login.html`);
  console.log(`Tai khoan demo -> userId: demo | password: 123456`);
});
