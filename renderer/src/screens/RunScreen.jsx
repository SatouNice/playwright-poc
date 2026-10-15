import ProgressBar from '../components/ProgressBar.jsx';
import LogList from '../components/LogList.jsx';

export default function RunScreen({ run, onStop, onExport, onRestart, onBackToUpload, exportInfo }) {
  const { status, current, total, label, logs, results, summary } = run;
  const finished = status === 'done';
  const errorResults = results.filter((r) => r.status === 'error');

  return (
    <div className="card">
      <h2>{finished ? 'Kết quả chạy' : 'Đang chạy tự động'}</h2>
      <p className="sub">
        {finished
          ? summary?.stoppedByUser
            ? 'Đã dừng theo yêu cầu của bạn.'
            : 'Đã xử lý xong toàn bộ danh sách.'
          : 'Trình duyệt tự động đang mở. Vui lòng không đóng cửa sổ trình duyệt trong lúc chạy.'}
      </p>

      <ProgressBar current={current} total={total} label={label} />

      <div className="stats">
        <div className="stat">
          <div className="k">Tổng số dòng</div>
          <div className="v">{total}</div>
        </div>
        <div className="stat ok">
          <div className="k">Thành công</div>
          <div className="v">{results.filter((r) => r.status === 'ok').length}</div>
        </div>
        <div className="stat err">
          <div className="k">Lỗi</div>
          <div className="v">{errorResults.length}</div>
        </div>
        <div className="stat">
          <div className="k">Còn lại</div>
          <div className="v">{Math.max(total - results.length, 0)}</div>
        </div>
      </div>

      <div className="section-title">Nhật ký thời gian thực</div>
      <LogList lines={logs} />

      {finished && results.length > 0 && (
        <>
          <div className="section-title">Chi tiết từng dòng</div>
          <div className="error-list">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 90 }}>Dòng</th>
                  <th style={{ width: 200 }}>Khách hàng</th>
                  <th style={{ width: 90 }}>Trạng thái</th>
                  <th>Lý do lỗi</th>
                  <th style={{ width: 110 }}>Ảnh lỗi</th>
                  <th style={{ width: 110 }}>Video</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.index}>
                    <td>{r.index}</td>
                    <td>{r.label}</td>
                    <td>{r.status === 'ok' ? '✅' : '❌'}</td>
                    <td style={{ whiteSpace: 'normal' }}>{r.error || '—'}</td>
                    <td>
                      {r.screenshot ? (
                        <button className="link" onClick={() => window.api.showItemInFolder(r.screenshot)}>
                          Mở thư mục
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.video ? (
                        <button className="link" onClick={() => window.api.showItemInFolder(r.video)}>
                          Mở video
                        </button>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {exportInfo && (
        <div className={'alert ' + (exportInfo.ok ? 'ok' : 'error')} style={{ marginTop: 16 }}>
          {exportInfo.ok ? (
            <>
              Đã xuất báo cáo: {exportInfo.filePath}{' '}
              <button className="link" onClick={() => window.api.showItemInFolder(exportInfo.filePath)}>
                Mở thư mục
              </button>
            </>
          ) : (
            exportInfo.message
          )}
        </div>
      )}

      <div className="row-actions" style={{ marginTop: 22 }}>
        {!finished && (
          <button className="danger" onClick={onStop} disabled={run.stopRequested}>
            {run.stopRequested ? 'Đang dừng...' : 'Dừng'}
          </button>
        )}
        {finished && (
          <>
            <button onClick={onExport} disabled={results.length === 0}>
              Xuất báo cáo Excel
            </button>
            <button className="secondary" onClick={onRestart} disabled={results.length === 0 && total === 0}>
              Chạy lại danh sách này
            </button>
            <button className="secondary" onClick={onBackToUpload}>
              Chọn file khác
            </button>
          </>
        )}
      </div>
    </div>
  );
}
