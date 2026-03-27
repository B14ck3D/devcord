import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownToLine,
  CheckCircle2,
  LoaderCircle,
  Play,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';

import bg1 from '/sparkle/1.png';
import bg2 from '/sparkle/2.png';
import bg3 from '/sparkle/3.png';
import bg4 from '/sparkle/4.png';
import bg5 from '/sparkle/5.png';
import bg6 from '/sparkle/6.png';
import bg7 from '/sparkle/7.png';
import bg8 from '/sparkle/8.png';
import logo from '/devcordlogo.png';

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

  const backgrounds = useMemo(() => [bg1, bg2, bg3, bg4, bg5, bg6, bg7, bg8], []);
  const [bgIndex, setBgIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setBgIndex((v) => (v + 1) % backgrounds.length);
    }, 4500);
    return () => clearInterval(timer);
  }, [backgrounds.length]);

  useEffect(() => {
    if (!window.bootstrapper?.onStatus) return;
    return window.bootstrapper.onStatus((ev) => {
      setStatus(ev);
      if (ev.state === 'done' || ev.state === 'error') setBusy(false);
    });
  }, []);

  const startInstall = async () => {
    if (!window.bootstrapper?.startInstall || busy) return;
    setBusy(true);
    setStatus({ state: 'checking', message: 'Start instalacji...', progress: 0 });
    const res = await window.bootstrapper.startInstall();
    if (!res.ok) {
      setStatus({
        state: 'error',
        message: 'Instalator napotkał błąd.',
        detail: res.error,
      });
      setBusy(false);
    }
  };

  const isError = status.state === 'error';
  const isDone = status.state === 'done';
  const progress = Math.max(0, Math.min(1, status.progress ?? (isDone ? 1 : 0)));

  return (
    <div className="installer-root">
      <div className="background-layer">
        {backgrounds.map((img, i) => (
          <img key={img} src={img} alt="" className={`background-img ${i === bgIndex ? 'active' : ''}`} />
        ))}
      </div>
      <div className="overlay" />
      <main className="panel">
        <header className="panel-header">
          <div className="brand">
            <img src={logo} alt="Devcord" className="brand-logo" />
            <div>
              <h1>Devcord Installer</h1>
              <p>Bootstrapper desktopowy</p>
            </div>
          </div>
          <ShieldCheck size={22} className="shield" />
        </header>

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
            <button type="button" onClick={startInstall} disabled={busy} className={`btn ${isError ? 'btn-retry' : ''}`}>
              {busy ? <LoaderCircle size={18} className="spin" /> : isError ? <TriangleAlert size={18} /> : <ArrowDownToLine size={18} />}
              {busy ? 'Instalowanie...' : isError ? 'Spróbuj ponownie' : 'Zainstaluj Devcord'}
            </button>
          ) : (
            <div className="done-wrap">
              <CheckCircle2 size={19} />
              <span>Gotowe — aplikacja uruchamia się automatycznie.</span>
            </div>
          )}
          <div className="hint">
            <Play size={14} />
            <span>Styl: Deep Indigo + Neon Green + Glass UI</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
