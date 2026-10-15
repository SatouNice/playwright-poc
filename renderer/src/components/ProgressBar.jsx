export default function ProgressBar({ current, total, label }) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div>
      <div className="progress-label">
        <span>
          {total === 0
            ? 'Chưa bắt đầu'
            : `Đang xử lý dòng ${Math.min(current, total)}/${total}${label ? ` — ${label}` : ''}`}
        </span>
        <span>{percent}%</span>
      </div>
      <div className="progress">
        <div style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
