import { useState } from 'react';

export default function LoginScreen({ onDone, baseUrl }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');

    if (!userId.trim()) return setError('Vui lòng nhập User ID.');
    if (!password) return setError('Vui lòng nhập mật khẩu.');

    setBusy(true);
    try {
      // Mật khẩu chỉ được gửi 1 chiều sang main process, không lưu ở renderer
      const res = await window.api.setCredentials({ userId, password, remember });
      if (!res.ok) {
        setError(res.message || 'Không lưu được thông tin đăng nhập.');
        return;
      }
      setPassword('');
      onDone({ userId: res.userId, remember });
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="card narrow" onSubmit={submit}>
      <h2>Đăng nhập hệ thống</h2>
      <p className="sub">
        Tài khoản dùng để đăng nhập vào chương trình nhập bảng minh họa
        {baseUrl ? ` (${baseUrl})` : ''}.
      </p>

      {error && <div className="alert error">{error}</div>}

      <label className="field">
        <span>User ID</span>
        <input
          type="text"
          value={userId}
          autoFocus
          autoComplete="off"
          onChange={(e) => setUserId(e.target.value)}
          placeholder="Ví dụ: demo"
        />
      </label>

      <label className="field">
        <span>Mật khẩu</span>
        <input
          type="password"
          value={password}
          autoComplete="off"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••"
        />
      </label>

      <label className="checkbox">
        <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
        <span>
          Ghi nhớ đăng nhập lần sau — chỉ lưu phiên (cookie) của trình duyệt tự động, không lưu mật
          khẩu ra đĩa.
        </span>
      </label>

      <button className="block" type="submit" disabled={busy}>
        {busy ? 'Đang xử lý...' : 'Tiếp tục'}
      </button>
    </form>
  );
}
