# App nhập bảng minh họa bảo hiểm (Electron + Playwright)

App desktop giúp nhân viên nhập hàng loạt thông tin khách hàng vào chương trình nhập bảng minh
họa bảo hiểm: đăng nhập → upload file Excel → app tự mở trình duyệt, tự đăng nhập và điền lần lượt
từng dòng → xem log real-time và xuất báo cáo kết quả.

Kế thừa từ bản POC ban đầu (`automation/` — vẫn giữ lại để tham khảo và chạy bằng dòng lệnh).

## Cài đặt

```bash
npm install
npx playwright install chromium   # chỉ cần chạy 1 lần
```

Nếu `npm install` báo `Electron failed to install correctly` khi chạy app, chạy lại bước tải
binary của Electron:

```bash
node node_modules/electron/install.js
```

## Chạy app

```bash
npm run dev
```

Lệnh này sẽ:
1. Bật test server giả lập ở `http://localhost:3000` (tự bỏ qua nếu port 3000 đã có server chạy)
2. Bật Vite dev server cho giao diện React (`http://localhost:5173`)
3. Mở cửa sổ Electron

Tài khoản demo của test server: **userId `demo` / password `123456`**.

Bản chạy như production (build sẵn giao diện rồi mở Electron):

```bash
npm run start
```

## File Excel mẫu

```bash
npm run sample-excel
```

Tạo ra trong thư mục `sample-data/`:

| File | Dùng để |
|---|---|
| `danh-sach-hop-le.xlsx` | 3 dòng đúng format — chạy thật được |
| `danh-sach-loi.xlsx` | đủ cột nhưng sai dữ liệu (dòng trống ở giữa, ngày `32/13/1999`, email sai, thiếu họ tên) — để thử phần validate |
| `danh-sach-thieu-cot.xlsx` | thiếu hẳn cột `so_dien_thoai` — để thử lỗi thiếu cột bắt buộc |

### Format Excel chuẩn

Sheet đầu tiên, dòng 1 là tiêu đề, tên cột không dấu:

| ho_ten | ngay_sinh | gioi_tinh | email | so_dien_thoai |
|---|---|---|---|---|
| Nguyen Van A | 1990-05-12 | male | a@example.com | 0901234567 |

- `ngay_sinh`: chấp nhận `YYYY-MM-DD`, `DD/MM/YYYY` hoặc ô đã định dạng ngày của Excel
- `gioi_tinh`: chỉ `male` hoặc `female`
- `so_dien_thoai`: nên định dạng cột thành **Text** để không mất số 0 ở đầu (app sẽ báo lỗi nếu ô là kiểu số)

Danh sách cột bắt buộc lấy từ `electron/automation/config.json` → `formPage.fields[].excelColumn`,
nên khi đổi chương trình đích chỉ cần sửa file config.

## Luồng 3 màn hình

1. **Đăng nhập** — nhập User ID / mật khẩu, tuỳ chọn "Ghi nhớ đăng nhập lần sau".
2. **Upload Excel** — kéo thả hoặc chọn file `.xlsx`. App đọc và validate ngay: nếu có lỗi thì
   liệt kê rõ dòng nào / cột nào / lỗi gì và **không cho chạy tiếp**; nếu hợp lệ thì hiện số dòng
   và xem trước 10 dòng đầu.
3. **Run** — progress bar, log real-time từng dòng (✅/❌ kèm lý do), nút **Dừng** để dừng an toàn.
   Chạy xong hiện tổng kết + nút **Xuất báo cáo Excel**.

## Bảo mật

- Mật khẩu **chỉ tồn tại trong RAM của Electron main process**, không ghi ra đĩa, không lưu ở
  renderer/localStorage, không gửi ngược về renderer.
- "Ghi nhớ đăng nhập lần sau" chỉ lưu `storageState` (cookie phiên) của Playwright vào
  `userData/session-state.json` — không lưu mật khẩu. Bỏ tick hoặc bấm Đăng xuất sẽ xoá file này.
- Không có log/báo cáo nào chứa mật khẩu.
- `preload.js` dùng `contextBridge` chỉ expose đúng các hàm cần thiết; renderer chạy với
  `contextIsolation: true`, `nodeIntegration: false` và có CSP riêng.

## Xử lý lỗi khi chạy

- Mỗi dòng xử lý độc lập — 1 dòng lỗi không làm dừng cả tiến trình.
- Lỗi do timeout/mạng sẽ được **thử lại 1 lần** trước khi đánh dấu là lỗi.
- Mỗi dòng lỗi được **chụp màn hình** lưu vào `userData/screenshots/`, đường dẫn ảnh nằm trong
  báo cáo Excel và bấm được ngay trên màn hình Run.
- Mỗi dòng dữ liệu được **quay video riêng** (`.webm`) lưu vào `userData/videos/` — mỗi dòng mở
  1 tab riêng trong cùng phiên đăng nhập nên không phải đăng nhập lại, nhưng vẫn tách được video
  theo từng khách hàng. Video của tất cả các dòng (cả thành công lẫn lỗi) đều xem được ở bảng
  "Chi tiết từng dòng" trên màn hình Run và nằm trong báo cáo Excel. Tắt bằng cách đặt
  `run.recordVideo: false` trong `config.json` nếu không cần (Excel nhiều dòng sẽ quay ra nhiều
  file, tốn dung lượng đĩa).

Thư mục `userData` trên Windows: `%APPDATA%\insurance-illustration-app\`.

## Cấu trúc project

```
├── electron/
│   ├── main.js                 # main process: giữ credentials, IPC, điều phối chạy
│   ├── preload.js              # contextBridge — API duy nhất renderer được dùng
│   └── automation/
│       ├── config.json         # URL + selector + rule validate của từng field
│       ├── login.js            # đăng nhập (kế thừa từ POC)
│       ├── fillForm.js         # điền 1 dòng vào form (kế thừa từ POC)
│       ├── excelReader.js      # đọc & validate Excel bằng exceljs
│       ├── runner.js           # vòng lặp qua từng dòng, retry, screenshot, phát event
│       └── report.js           # xuất báo cáo kết quả ra .xlsx
├── renderer/                   # React app (Vite)
│   ├── index.html
│   └── src/{App.jsx, screens/, components/}
├── scripts/
│   ├── dev.js                  # chạy test-server + vite + electron bằng 1 lệnh
│   └── make-sample-excel.js
├── test-server/                # chương trình giả lập để test (từ POC)
└── automation/                 # bản POC chạy bằng CLI (giữ lại tham khảo)
```

## Trỏ app vào chương trình thật

Chỉ cần sửa `electron/automation/config.json`, không phải sửa code:

- `baseUrl`: URL nội bộ thật
- `loginPage.*Selector`: selector của trang login thật
- `formPage.fields[]`: danh sách field thật — mỗi field có `excelColumn`, `selector`, `type`
  (`text` / `date` / `select` / `checkbox`), `required`, và tuỳ chọn `options` (cho select) hoặc
  `validate` (`email` / `phone`)
- `successUrlContains`: đoạn URL xuất hiện khi login/submit thành công
- `run.headless`: `true` nếu muốn chạy ẩn trình duyệt; `run.maxRetryPerRow`: số lần thử lại
- `run.recordVideo`: `true`/`false` — bật/tắt quay video riêng từng dòng; `run.videoSize`:
  độ phân giải video (mặc định `1280x720`)

## Chạy bản POC bằng dòng lệnh (không cần giao diện)

```bash
npm run server
node automation/index.js --userId demo --password 123456
```
