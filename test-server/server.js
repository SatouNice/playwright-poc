// test-server/server.js
// Web server local don gian, dong vai tro "chuong trinh that" de test automation.
// Chay: node test-server/server.js  -> mo http://localhost:3000/login.html

const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  res.redirect('/login.html');
});

app.listen(PORT, () => {
  console.log(`Test server dang chay tai: http://localhost:${PORT}`);
  console.log(`Trang login: http://localhost:${PORT}/login.html`);
  console.log(`Tai khoan demo -> userId: demo | password: 123456`);
});
