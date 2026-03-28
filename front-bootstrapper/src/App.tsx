import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, CheckCircle2, LoaderCircle, Minimize2, Play, TriangleAlert, X } from 'lucide-react';

import logo from '/devcordlogo.png';
import InstallerSplash from './InstallerSplash';

const phaseLabel: Record<InstallState, string> = {
  idle: 'Gotowe do instalacji',
  checking: 'Sprawdzanie najnowszej wersji',
  downloading: 'Pobieranie paczki aplikacji',
  extracting: 'Wypakowywanie plików',
  creating_shortcuts: 'Tworzenie skrótów',
  launching: 'Uruchamianie aplikacji',
  done: 'Instalacja zakończona',
  error: 'Błąd instalacji',
};

export default function App() {
  const [status, setStatus] = useState<InstallEvent>({
    state: 'idle',
    message: 'Installer pobierze i przygotuje najnowszą wersję Devcord.',
    progress: 0,
  });
  const [busy, setBusy] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [isStarted, setIsStarted] = useState(false);
  const [installRoot, setInstallRoot] = useState<string>('');
  const [isInstalled, setIsInstalled] = useState(false);
  const [checkingInstall, setCheckingInstall] = useState(true);
  const installStartedRef = useRef(false);

  useEffect(() => {
    if (!window.bootstrapper?.onStatus) return;
    return window.bootstrapper.onStatus((ev) => {
      setStatus(ev);
      if (ev.state === 'done' || ev.state === 'error') {
        setBusy(false);
        if (ev.state === 'error') installStartedRef.current = false;
      }
    });
  }, []);

  const refreshInstallState = async (nextRoot?: string) => {
    if (!window.bootstrapper?.getInstallationState) return;
    setCheckingInstall(true);
    const resolvedRoot = nextRoot ?? installRoot;
    const state = await window.bootstrapper.getInstallationState({ installRoot: resolvedRoot || undefined });
    setInstallRoot(state.installRoot);
    setIsInstalled(state.installed);
    setCheckingInstall(false);
  };

  useEffect(() => {
    void refreshInstallState();
    // one-time startup probe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startInstall = async (cleanInstallRoot = false) => {
    if (!window.bootstrapper?.startInstall || busy || installStartedRef.current) return;
    installStartedRef.current = true;
    setIsStarted(true);
    setBusy(true);
    setStatus({ state: 'checking', message: 'Start instalacji...', progress: 0 });
    const payload = installRoot.trim() ? { installRoot: installRoot.trim() } : undefined;
    const res = await window.bootstrapper.startInstall({
      ...payload,
      cleanInstallRoot,
    });
    if (!res.ok) {
      setStatus({
        state: 'error',
        message: 'Instalator napotkał błąd.',
        detail: res.error,
      });
      setBusy(false);
      installStartedRef.current = false;
    }
  };

  const repairInstall = async () => {
    await startInstall(true);
  };

  const uninstallInstall = async () => {
    if (!window.bootstrapper?.uninstall || busy) return;
    setBusy(true);
    const res = await window.bootstrapper.uninstall({ installRoot: installRoot.trim() || undefined });
    setBusy(false);
    if (!res.ok) {
      setStatus({
        state: 'error',
        message: 'Odinstalowanie nie powiodło się.',
        detail: res.error,
      });
      return;
    }
    setStatus({
      state: 'idle',
      message: 'Devcord został odinstalowany. Możesz zainstalować ponownie.',
      progress: 0,
    });
    setIsStarted(false);
    installStartedRef.current = false;
    await refreshInstallState();
  };

  const pickInstallDir = async () => {
    if (!window.bootstrapper?.pickInstallDir || busy) return;
    const res = await window.bootstrapper.pickInstallDir();
    if (res.ok && res.path) {
      setInstallRoot(res.path);
      await refreshInstallState(res.path);
    }
  };

  const closeWindow = async () => {
    await window.electronAPI?.closeWindow?.();
  };

  const minimizeWindow = async () => {
    await window.electronAPI?.minimizeWindow?.();
  };

  const isError = status.state === 'error';
  const isDone = status.state === 'done';
  const progress = Math.max(0, Math.min(1, status.progress ?? (isDone ? 1 : 0)));

  if (showIntro) {
    return (
      <div className="installer-root intro-only">
        <InstallerSplash autoplay onSequenceComplete={() => setShowIntro(false)} />
      </div>
    );
  }

  return (
    <div className="installer-root">
      <header className="titlebar">
        <div className="titlebar-left">
          <img src={logo} alt="Devcord" className="titlebar-logo" />
          <span>Devcord Installer</span>
        </div>
        <div className="titlebar-actions">
          <button type="button" className="titlebar-btn no-drag" onClick={minimizeWindow} aria-label="Minimalizuj">
            <Minimize2 size={14} />
          </button>
          <button type="button" className="titlebar-btn no-drag danger" onClick={closeWindow} aria-label="Zamknij">
            <X size={14} />
          </button>
        </div>
      </header>

      <main className="panel">
        <section className="phase">
          <h2>{phaseLabel[status.state]}</h2>
          <p>{status.message}</p>
          {status.detail ? <p className="detail">{status.detail}</p> : null}
        </section>

        <section className="progress-wrap">
          <div className="progress-line">
            <div className="progress-value" style={{ width: `${Math.round(progress * 100)}%` }} />
          </div>
          <span className="progress-text">{Math.round(progress * 100)}%</span>
        </section>

        <footer className="actions">
          {!isDone ? (
            <>
              {isInstalled ? (
                <>
                  <button type="button" onClick={repairInstall} disabled={busy || checkingInstall} className={`btn ${isError ? 'btn-retry' : ''}`}>
                    {busy ? <LoaderCircle size={18} className="spin" /> : <ArrowDownToLine size={18} />}
                    {busy ? 'Naprawianie...' : 'Napraw instalację'}
                  </button>
                  <button type="button" onClick={uninstallInstall} disabled={busy || checkingInstall} className="btn btn-retry">
                    {busy ? <LoaderCircle size={18} className="spin" /> : <TriangleAlert size={18} />}
                    {busy ? 'Odinstalowywanie...' : 'Odinstaluj'}
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => startInstall(false)} disabled={busy || checkingInstall} className={`btn ${isError ? 'btn-retry' : ''}`}>
                  {busy ? <LoaderCircle size={18} className="spin" /> : isError ? <TriangleAlert size={18} /> : <ArrowDownToLine size={18} />}
                  {busy ? 'Instalowanie...' : isError ? 'Spróbuj ponownie' : 'Zainstaluj Devcord'}
                </button>
              )}
              <button type="button" onClick={pickInstallDir} disabled={busy || isStarted} className="btn">
                Wybierz folder instalacji
              </button>
              <div className="hint">
                <span>{installRoot ? `Folder: ${installRoot}` : 'Folder domyślny: %LOCALAPPDATA%/Devcord'}</span>
              </div>
              <div className="hint">
                <span>{checkingInstall ? 'Sprawdzanie instalacji...' : isInstalled ? 'Devcord jest już zainstalowany.' : 'Devcord nie jest jeszcze zainstalowany.'}</span>
              </div>
            </>
          ) : (
            <div className="done-wrap">
              <CheckCircle2 size={19} />
              <span>Gotowe — aplikacja uruchamia się automatycznie.</span>
            </div>
          )}
          <div className="hint">
            <Play size={14} />
            <span>{isStarted ? 'Instalacja uruchomiona przez użytkownika.' : 'Kliknij przycisk, aby rozpocząć instalację.'}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
