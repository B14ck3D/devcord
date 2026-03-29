import { useEffect, useRef, useState } from 'react';
import {
  Terminal,
  Minus,
  X,
  Download,
  Folder,
  CheckCircle2,
  MonitorPlay,
  Settings,
  Bot,
  AlertTriangle,
  RotateCcw,
  FileText,
} from 'lucide-react';

const INSTALL_FALLBACK_PATH = 'C:\\Users\\Nazwa\\AppData\\Local\\Devcord';

export default function App() {
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [progress, setProgress] = useState(0);
  const [statusText, setStatusText] = useState('Przygotowywanie środowiska...');
  const [showIntro, setShowIntro] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showExitModal, setShowExitModal] = useState(false);
  const [installRoot, setInstallRoot] = useState('');
  const [checkingInstall, setCheckingInstall] = useState(true);
  const [busy, setBusy] = useState(false);
  const installStartedRef = useRef(false);

  useEffect(() => {
    if (!showIntro) return;
    const timer = setTimeout(() => setShowIntro(false), 2500);
    return () => clearTimeout(timer);
  }, [showIntro]);

  useEffect(() => {
    if (!window.bootstrapper?.onStatus) return;
    return window.bootstrapper.onStatus((ev) => {
      setStatusText(ev.message);
      if (typeof ev.progress === 'number') setProgress(Math.max(0, Math.min(100, Math.round(ev.progress * 100))));
      if (ev.state === 'done') {
        setBusy(false);
        setErrorMsg(null);
        setStep(2);
      } else if (ev.state === 'error') {
        setBusy(false);
        installStartedRef.current = false;
        setErrorMsg(ev.detail || ev.message || 'Nieznany błąd instalacji.');
        setStep(1);
      } else if (ev.state !== 'idle') {
        setStep(1);
      }
    });
  }, []);

  useEffect(() => {
    if (!window.bootstrapper?.onInstallError) return;
    return window.bootstrapper.onInstallError((message) => {
      setBusy(false);
      installStartedRef.current = false;
      setErrorMsg(message || 'Nieznany błąd wypakowywania');
      setStep(1);
    });
  }, []);

  const refreshInstallState = async (nextRoot?: string) => {
    if (!window.bootstrapper?.getInstallationState) return;
    setCheckingInstall(true);
    const state = await window.bootstrapper.getInstallationState({ installRoot: nextRoot || undefined });
    setInstallRoot(state.installRoot);
    setCheckingInstall(false);
  };

  useEffect(() => {
    void refreshInstallState();
  }, []);

  const startInstall = async (cleanInstallRoot = false) => {
    if (!window.bootstrapper?.startInstall || busy || installStartedRef.current) return;
    installStartedRef.current = true;
    setBusy(true);
    setErrorMsg(null);
    setStep(1);
    setProgress(0);
    const payload = installRoot.trim() ? { installRoot: installRoot.trim(), cleanInstallRoot } : { cleanInstallRoot };
    const res = await window.bootstrapper.startInstall(payload);
    if (!res.ok) {
      setBusy(false);
      installStartedRef.current = false;
      setErrorMsg(res.error || 'Nieznany błąd instalacji.');
    }
  };

  const handleInstall = () => {
    void startInstall(false);
  };

  const handleRetry = () => {
    void startInstall(true);
  };

  const pickInstallDir = async () => {
    if (!window.bootstrapper?.pickInstallDir || busy) return;
    const res = await window.bootstrapper.pickInstallDir();
    if (res.ok && res.path) {
      setInstallRoot(res.path);
      await refreshInstallState(res.path);
    }
  };

  const openLogs = async () => {
    await window.bootstrapper?.openLogFile?.();
  };

  const handleClose = async () => {
    if (step === 1 && !errorMsg) {
      setShowExitModal(true);
      return;
    }
    await window.electronAPI?.closeWindow?.();
  };

  const confirmExit = async () => {
    setShowExitModal(false);
    await window.electronAPI?.closeWindow?.();
  };

  const cancelExit = () => setShowExitModal(false);

  return (
    <div className="bootstrapper-shell">
      <div className="bootstrapper-window">
        {showIntro ? (
          <div className="intro-overlay">
            <div className="intro-bot-wrap">
              <Bot size={140} className="intro-bot" />
            </div>
          </div>
        ) : null}

        {showExitModal ? (
          <div className="exit-modal-overlay">
            <div className="exit-modal-card">
              <div className="exit-modal-head">
                <AlertTriangle size={24} />
                <h3>Przerwać instalację?</h3>
              </div>
              <p>Devcord jest w trakcie instalacji. Przerwanie procesu może pozostawić niekompletne pliki na dysku.</p>
              <div className="exit-modal-actions" style={{ WebkitAppRegion: 'no-drag' as const }}>
                <button onClick={cancelExit} className="secondary-btn">Kontynuuj</button>
                <button onClick={() => void confirmExit()} className="danger-btn">Tak, przerwij</button>
              </div>
            </div>
          </div>
        ) : null}

        <header className="bootstrapper-titlebar" style={{ WebkitAppRegion: 'drag' as const }}>
          <div className="titlebar-left">
            <div className="titlebar-icon-box">
              <Terminal size={14} />
            </div>
            <span>DEVCORD INSTALLER</span>
          </div>
          <div className="titlebar-actions" style={{ WebkitAppRegion: 'no-drag' as const }}>
            <button onClick={() => void window.electronAPI?.minimizeWindow?.()}>
              <Minus size={16} />
            </button>
            <button onClick={() => void handleClose()} className="close-btn">
              <X size={16} />
            </button>
          </div>
        </header>

        <main className="bootstrapper-content">
          {step === 0 ? (
            <section className="step-welcome">
              <h1>
                GOTOWE DO <br /> <span>INSTALACJI</span>
              </h1>
              <p>Pobierzemy najnowszą wersję i skonfigurujemy środowisko Devcord na Twoim komputerze.</p>
              <div className="path-card">
                <label><Settings size={12} /> Ścieżka instalacji</label>
                <div className="path-row">
                  <div className="path-icon"><Folder size={18} /></div>
                  <input type="text" readOnly value={installRoot || INSTALL_FALLBACK_PATH} />
                  <button onClick={() => void pickInstallDir()} disabled={busy || checkingInstall}>Zmień</button>
                </div>
              </div>
              <div className="welcome-actions">
                <button onClick={handleInstall} disabled={busy || checkingInstall} className="primary-btn">
                  <Download size={18} />
                  Zainstaluj Devcord
                </button>
              </div>
            </section>
          ) : null}

          {step === 1 ? (
            <section className="step-installing">
              {!errorMsg ? (
                <>
                  <div className="install-icon"><Download size={40} /></div>
                  <h2>TRWA INSTALACJA</h2>
                  <p>{statusText}</p>
                  <div className="progress-wrap">
                    <div className="progress-value" style={{ width: `${progress}%` }} />
                  </div>
                  <div className="progress-numbers">
                    <span>0%</span><strong>{progress}%</strong><span>100%</span>
                  </div>
                </>
              ) : (
                <div className="error-stage">
                  <div className="error-icon"><AlertTriangle size={56} /></div>
                  <h2>BŁĄD INSTALACJI</h2>
                  <p>Wystąpił problem podczas wypakowywania plików. Upewnij się, że Devcord jest zamknięty.</p>
                  <div className="error-log-box">
                    <div className="error-log-title"><Terminal size={10} /> LOG BŁĘDU:</div>
                    <div className="error-log-text">{errorMsg}</div>
                  </div>
                  <div className="error-actions" style={{ WebkitAppRegion: 'no-drag' as const }}>
                    <button onClick={handleRetry} className="secondary-btn"><RotateCcw size={16} /> Spróbuj ponownie</button>
                    <button onClick={() => void openLogs()} className="danger-btn"><FileText size={16} /> Pokaż logi</button>
                  </div>
                </div>
              )}
            </section>
          ) : null}

          {step === 2 ? (
            <section className="step-done">
              <div className="done-icon"><CheckCircle2 size={48} /></div>
              <h2>INSTALACJA ZAKOŃCZONA</h2>
              <p>Devcord został pomyślnie zainstalowany i skonfigurowany. Możesz zamknąć instalator i rozpocząć pracę.</p>
              <div className="done-actions">
                <button onClick={() => void handleClose()} className="secondary-btn">Zakończ</button>
                <button onClick={() => void handleClose()} className="primary-btn light-btn">
                  <MonitorPlay size={18} />
                  Otwórz Devcord
                </button>
              </div>
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
