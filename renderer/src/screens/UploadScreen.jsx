import { useState } from 'react';

export default function UploadScreen({ columns, onStart, onBack, result, setResult }) {
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const pick = async () => {
    setBusy(true);
    try {
      const res = await window.api.pickExcel();
      if (!res.canceled) setResult(res);
    } finally {
      setBusy(false);
    }
  };

  const onDrop = async (e) => {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    const filePath = window.api.getDroppedFilePath(file);
    if (!filePath) {
      setResult({
        valid: false,
        fileName: file.name,
        totalRows: 0,
        errors: [
          { row: null, column: null, message: 'Không lấy được đường dẫn file. Hãy dùng nút "Chọn file".' },
        ],
        preview: [],
      });
      return;
    }

    setBusy(true);
    try {
      setResult(await window.api.validateExcel(filePath));
    } finally {
      setBusy(false);
    }
  };

  const errors = result?.errors ?? [];

  return (
    <div className="card">
      <h2>Upload file Excel</h2>
      <p className="sub">
        File .xlsx, sheet đầu tiên, dòng đầu là tiêu đề. Các cột bắt buộc:{' '}
        <strong>{columns.map((c) => c.excelColumn).join(', ')}</strong>
      </p>

      <div
        className={'dropzone' + (dragOver ? ' over' : '')}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div className="big">Kéo thả file .xlsx vào đây</div>
        <div className="hint">hoặc</div>
        <button type="button" onClick={pick} disabled={busy}>
          {busy ? 'Đang đọc file...' : 'Chọn file'}
        </button>
      </div>

      {result && (
        <>
          <div className="file-summary" style={{ marginTop: 20 }}>
            <div>
              <div className="name">{result.fileName}</div>
              <div className="meta">
                {result.sheetName ? `Sheet: ${result.sheetName} — ` : ''}
                {result.valid
                  ? `${result.totalRows} dòng hợp lệ — gộp thành ${result.totalCases ?? result.totalRows} hồ sơ`
                  : `${errors.length} lỗi cần sửa trước khi chạy`}
              </div>
            </div>
            <div className={'alert ' + (result.valid ? 'ok' : 'error')} style={{ margin: 0 }}>
              {result.valid ? '✅ File hợp lệ' : '❌ File chưa hợp lệ'}
            </div>
          </div>

          {!result.valid && errors.length > 0 && (
            <>
              <div className="section-title">Danh sách lỗi</div>
              <div className="error-list">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 90 }}>Dòng</th>
                      <th style={{ width: 160 }}>Cột</th>
                      <th>Lỗi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errors.map((err, i) => (
                      <tr key={i}>
                        <td>{err.row ?? '—'}</td>
                        <td>{err.column ?? '—'}</td>
                        <td style={{ whiteSpace: 'normal' }}>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="alert info" style={{ marginTop: 14 }}>
                Hãy sửa các lỗi trên trong file Excel rồi upload lại. Không thể chạy khi file còn lỗi.
              </div>
            </>
          )}

          {result.valid && result.preview?.length > 0 && (
            <>
              <div className="section-title">
                Xem trước {result.preview.length} dòng đầu (tổng {result.totalRows} dòng)
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Dòng</th>
                      {columns.map((c) => (
                        <th key={c.excelColumn}>{c.excelColumn}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.preview.map((row) => (
                      <tr key={row.__row}>
                        <td>{row.__row}</td>
                        {columns.map((c) => (
                          <td key={c.excelColumn}>{String(row[c.excelColumn] ?? '')}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <div className="row-actions" style={{ marginTop: 24 }}>
        <button className="secondary" type="button" onClick={onBack}>
          Quay lại
        </button>
        <button type="button" onClick={onStart} disabled={!result?.valid || busy}>
          Bắt đầu chạy
        </button>
      </div>
    </div>
  );
}
