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
npm run excel-template
```

Tạo ra trong thư mục `sample-data/`:

| File | Dùng để |
|---|---|
| `mau-chuan.xlsx` | 1 hồ sơ, 2 người phụ thuộc, 2 mục sản phẩm phụ |
| `mau-r15.xlsx` | 1 hồ sơ, chỉ 1 sản phẩm phụ dạng dropdown phần trăm |
| `mau-co-cmr.xlsx` | thêm 1 mục CMR để thử màn sản phẩm bổ trợ y tế |
| `mau-npt.xlsx` | gán sản phẩm phụ cho người phụ thuộc |
| `mau-3-dong.xlsx` | 3 hồ sơ, mỗi hồ sơ đi một nhánh khác nhau — dùng để thử vòng lặp |

Tiêu đề cột được sinh thẳng từ `electron/automation/config.json` nên file mẫu
luôn khớp cấu hình hiện hành.

### Format Excel chuẩn

Sheet đầu tiên, dòng 1 là tiêu đề, tên cột không dấu. Có 25 cột; xem danh sách
đầy đủ và ý nghĩa từng giá trị trong `.agent/protocol_page_one/README.md`.

Vài cột đáng lưu ý:

- `sinh_nhat_bmbh`, `sinh_nhat_ndbh`, `ngay_tham_gia_bh`: `DD/MM/YYYY`
- `so_giay_chung_minh_*` và `agent_emp_no`: nên định dạng cột thành **Text** để
  không mất số 0 ở đầu
- `nguoi_phu_thuoc` và `san_pham_phu`: mỗi ô chứa một chuỗi JSON dạng mảng
- Trong `san_pham_phu`, cột `so_tien_bao_hiem` mang hai nghĩa tuỳ mã sản phẩm:
  số tiền theo đơn vị hiển thị trên màn hình, hoặc số phần trăm với các mã dùng
  dropdown (ghi `150`, không ghi `150%`)

Danh sách cột bắt buộc lấy từ `electron/automation/config.json` →
`formPage.fields[].excelColumn`, nên khi đổi chương trình đích chỉ cần sửa file config.

### Giới hạn khi đọc file

Để tránh file bất thường làm treo app, `config.json` → `excel` giới hạn:
dung lượng tối đa 15 MB, 5000 dòng, 200 cột. File vượt giới hạn bị từ chối kèm
thông báo rõ ràng thay vì làm app đứng.

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
- Mỗi dòng dữ liệu **có thể** được quay video riêng (`.webm`) lưu vào `userData/videos/`.
  Mặc định **tắt** (`run.recordVideo: false`) vì video quay lại màn hình đang hiển thị dữ liệu
  khách hàng. Chỉ bật khi cần chẩn đoán lỗi.
- Ảnh chụp lỗi và video **tự xoá sau `run.keepMediaDays` ngày** (mặc định 7), dọn lúc khởi động
  app. Đặt `0` nếu muốn giữ vô thời hạn.
- Thông báo lỗi hiện trên màn hình chỉ gồm **một câu** nêu lý do. Phần kỹ thuật (cấu trúc trang,
  lỗi JavaScript của trang đích) được ghi vào file `.chan-doan.txt` nằm cạnh ảnh chụp.

Thư mục `userData` trên Windows: `%APPDATA%\insurance-illustration-app\`.

## Cấu trúc project

```
├── electron/
│   ├── main.js                 # main process: giữ credentials, IPC, điều phối chạy
│   ├── preload.js              # contextBridge — API duy nhất renderer được dùng
│   └── automation/
│       ├── config.json         # URL + selector + rule validate của từng field
│       ├── login.js            # đăng nhập
│       ├── fillForm.js         # điền màn khách hàng + người phụ thuộc
│       ├── fillProduct.js      # điền màn sản phẩm chính, sản phẩm phụ và CMR
│       ├── caseGrouper.js      # gom dòng Excel thành hồ sơ + validate nghiệp vụ
│       ├── excelReader.js      # đọc & validate Excel bằng exceljs
│       ├── frameDiag.js        # kê cấu trúc trang khi lỗi + rút gọn thông báo
│       ├── runner.js           # vòng lặp qua từng hồ sơ, retry, screenshot, phát event
│       └── report.js           # xuất báo cáo kết quả ra .xlsx
├── renderer/                   # React app (Vite)
│   ├── index.html
│   └── src/{App.jsx, screens/, components/}
├── scripts/
│   ├── dev.js                  # chạy test-server + vite + electron bằng 1 lệnh
│   ├── explore.js              # khảo sát DOM của chương trình đích
│   ├── test-one-case.js        # chạy thử không cần mở Electron
│   └── make-excel-template.js  # sinh file Excel mẫu từ config
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
