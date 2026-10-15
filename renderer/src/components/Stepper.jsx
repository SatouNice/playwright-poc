const STEPS = [
  { key: 'login', label: 'Đăng nhập' },
  { key: 'upload', label: 'Upload Excel' },
  { key: 'run', label: 'Chạy & kết quả' },
];

export default function Stepper({ current }) {
  const currentIndex = STEPS.findIndex((s) => s.key === current);

  return (
    <div className="stepper">
      {STEPS.map((step, i) => (
        <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <div className="step-sep" />}
          <div
            className={
              'step' + (i === currentIndex ? ' active' : '') + (i < currentIndex ? ' done' : '')
            }
          >
            <div className="num">{i < currentIndex ? '✓' : i + 1}</div>
            <span>{step.label}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
