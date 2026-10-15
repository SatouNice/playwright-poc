import { useEffect, useRef } from 'react';

export default function LogList({ lines }) {
  const boxRef = useRef(null);
  const pinnedRef = useRef(true);

  // Chỉ tự cuộn xuống khi người dùng đang ở cuối danh sách
  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };

  useEffect(() => {
    const el = boxRef.current;
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight;
  }, [lines]);

  return (
    <div className="log" ref={boxRef} onScroll={onScroll}>
      {lines.length === 0 && <div className="log-empty">Chưa có log nào.</div>}
      {lines.map((line, i) => (
        <div key={i} className={`log-line ${line.level || 'info'}`}>
          <span className="t">{line.time}</span>
          <span className="m">{line.message}</span>
        </div>
      ))}
    </div>
  );
}
