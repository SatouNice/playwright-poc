import { useCallback, useEffect, useState } from 'react';
import Stepper from './components/Stepper.jsx';
import LoginScreen from './screens/LoginScreen.jsx';
import UploadScreen from './screens/UploadScreen.jsx';
import RunScreen from './screens/RunScreen.jsx';

const EMPTY_RUN = {
  status: 'idle', // idle | running | done
  current: 0,
  total: 0,
  label: '',
  logs: [],
  results: [],
  summary: null,
  stopRequested: false,
};

function now() {
  return new Date().toLocaleTimeString('vi-VN', { hour12: false });
}

export default function App() {
  const [step, setStep] = useState('login');
  const [config, setConfig] = useState(null);
  const [auth, setAuth] = useState(null); // { userId, remember }
  const [excel, setExcel] = useState(null);
  const [run, setRun] = useState(EMPTY_RUN);
  const [exportInfo, setExportInfo] = useState(null);
  const [banner, setBanner] = useState('');

  useEffect(() => {
    window.api.getConfig().then(setConfig);
  }, []);

  // Đăng ký nhận log real-time từ main process (chỉ 1 lần cho toàn app)
  useEffect(() => {
    const unsubscribe = window.api.onRunEvent((event) => {
      setRun((prev) => {
        const next = { ...prev };

        switch (event.type) {
          case 'log':
            next.logs = [...prev.logs, { time: now(), level: event.level, message: event.message }];
            break;

          case 'progress':
            next.current = event.current;
            next.total = event.total;
            next.label = event.label;
            next.logs = [
              ...prev.logs,
              {
                time: now(),
                level: 'info',
                message: `Đang xử lý dòng ${event.current}/${event.total}: ${event.label}`,
              },
            ];
            break;

          case 'result':
            next.results = [
              ...prev.results,
              {
                index: event.index,
                label: event.label,
                status: event.status,
                error: event.error,
                screenshot: event.screenshot,
                video: event.video,
              },
            ];
            next.logs = [
              ...prev.logs,
              {
                time: now(),
                level: event.status === 'ok' ? 'ok' : 'error',
                message:
                  event.status === 'ok'
                    ? `✅ ${event.label} — nhập thành công`
                    : `❌ ${event.label} — ${event.error}`,
              },
            ];
            break;

          case 'fatal':
            next.logs = [
              ...prev.logs,
              { time: now(), level: 'fatal', message: `⛔ ${event.message}` },
            ];
            break;

          case 'done':
            next.status = 'done';
            next.summary = event.summary;
            next.logs = [
              ...prev.logs,
              {
                time: now(),
                level: 'info',
                message: `Hoàn tất: ${event.summary.ok} thành công, ${event.summary.error} lỗi${
                  event.summary.skipped ? `, ${event.summary.skipped} chưa xử lý` : ''
                }.`,
              },
            ];
            break;

          default:
            break;
        }

        return next;
      });
    });

    return unsubscribe;
  }, []);

  const startRun = useCallback(async () => {
    setBanner('');
    setExportInfo(null);
    setRun({ ...EMPTY_RUN, status: 'running', total: excel?.totalCases ?? excel?.totalRows ?? 0 });
    setStep('run');

    const res = await window.api.startRun();
    if (!res.ok) {
      setRun((prev) => ({
        ...prev,
        status: 'done',
        logs: [...prev.logs, { time: now(), level: 'fatal', message: `⛔ ${res.message}` }],
      }));
    }
  }, [excel]);

  const stopRun = useCallback(async () => {
    setRun((prev) => ({
      ...prev,
      stopRequested: true,
      logs: [...prev.logs, { time: now(), level: 'warn', message: 'Đã gửi yêu cầu dừng...' }],
    }));
    await window.api.stopRun();
  }, []);

  const exportReport = useCallback(async () => {
    const res = await window.api.exportReport();
    if (res.canceled) return;
    setExportInfo(res);
  }, []);

  const logout = useCallback(async () => {
    await window.api.logout();
    setAuth(null);
    setExcel(null);
    setRun(EMPTY_RUN);
    setStep('login');
  }, []);

  if (!config) {
    return (
      <div className="app">
        <div className="content">
          <div className="card narrow">Đang tải cấu hình...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <h1>Nhập bảng minh họa bảo hiểm</h1>
        <Stepper current={step} />
        <div className="user">
          {auth ? (
            <>
              <span>👤 {auth.userId}</span>
              <button className="link" onClick={logout} disabled={run.status === 'running'}>
                Đăng xuất
              </button>
            </>
          ) : (
            <span>Chưa đăng nhập</span>
          )}
        </div>
      </header>

      <main className="content">
        {banner && <div className="alert error">{banner}</div>}

        {step === 'login' && (
          <LoginScreen
            baseUrl={config.baseUrl}
            onDone={(info) => {
              setAuth(info);
              setStep('upload');
            }}
          />
        )}

        {step === 'upload' && (
          <UploadScreen
            columns={config.columns}
            result={excel}
            setResult={setExcel}
            onBack={() => setStep('login')}
            onStart={startRun}
          />
        )}

        {step === 'run' && (
          <RunScreen
            run={run}
            exportInfo={exportInfo}
            onStop={stopRun}
            onExport={exportReport}
            onRestart={startRun}
            onBackToUpload={() => {
              setExportInfo(null);
              setStep('upload');
            }}
          />
        )}
      </main>
    </div>
  );
}
