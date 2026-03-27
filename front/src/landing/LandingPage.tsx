import { Download, Globe, MicVocal, MonitorPlay, ShieldCheck, Zap } from 'lucide-react';
import { DEVCORD_INSTALLER_URL, DEVCORD_WEB_APP_URL } from '../api';

const features = [
  {
    Icon: MicVocal,
    title: 'RNNoise AI',
    text: 'Wbudowane odszumianie oparte na AI. Czysty głos nawet przy obciążonych kanałach.',
  },
  {
    Icon: MonitorPlay,
    title: 'Streaming 1080p 240FPS',
    text: 'Best-effort high-fps screen share z telemetrią i fallbackiem bez zrywania sesji.',
  },
  {
    Icon: Zap,
    title: 'Natywna wydajność',
    text: 'Electron + LiveKit + Go backend zoptymalizowane pod niski lag i wysoką współbieżność.',
  },
];

export default function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[radial-gradient(circle_at_top,_#1c2f7a_0%,_#071038_40%,_#050a1f_100%)] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(153,214,255,0.35),transparent_45%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_70%,rgba(99,102,241,0.3),transparent_40%)]" />
      </div>

      <header className="relative z-10 border-b border-white/10 backdrop-blur-sm">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-3">
            <img src="/devcordlogo.png" alt="Devcord" className="h-10 w-10 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">Devcord</span>
          </div>
          <a
            href={DEVCORD_WEB_APP_URL}
            className="rounded-full border border-white/20 bg-white/10 px-5 py-2 text-sm font-semibold transition hover:bg-white/20"
          >
            Otwórz Devcord
          </a>
        </div>
      </header>

      <main className="relative z-10">
        <section className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-20 pt-16 lg:grid-cols-2 lg:items-center">
          <div>
            <h1 className="mb-6 text-4xl font-black uppercase leading-tight tracking-tight sm:text-5xl lg:text-6xl">
              Czat i streaming dla devów i graczy
            </h1>
            <p className="mb-8 max-w-xl text-base text-blue-100/90 sm:text-lg">
              Devcord łączy voice, messaging i ultra-płynny screen share. Zero reklam, fokus na wydajność i stabilność.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row">
              <a
                href={DEVCORD_INSTALLER_URL}
                className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/15 px-6 py-3 text-sm font-bold text-white transition hover:bg-white/25"
              >
                <Download size={18} />
                Pobierz dla systemu Windows
              </a>
              <a
                href={DEVCORD_WEB_APP_URL}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-bold text-[#0b1b4e] transition hover:bg-blue-100"
              >
                <Globe size={18} />
                Otwórz w przeglądarce
              </a>
            </div>
          </div>

          <div className="rounded-3xl border border-white/15 bg-white/10 p-4 shadow-2xl backdrop-blur-md">
            <img src="/devcordlogo.png" alt="Devcord preview" className="mx-auto w-full max-w-md rounded-2xl" />
          </div>
        </section>

        <section id="funkcje" className="mx-auto w-full max-w-6xl px-4 pb-24">
          <h2 className="mb-8 text-center text-3xl font-black uppercase tracking-tight sm:text-4xl">
            Wydajność bez kompromisów
          </h2>
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {features.map(({ Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-white/15 bg-white/10 p-6 backdrop-blur-md">
                <div className="mb-4 inline-flex rounded-xl border border-white/20 bg-white/15 p-3 text-blue-100">
                  <Icon size={22} />
                </div>
                <h3 className="mb-2 text-xl font-bold">{title}</h3>
                <p className="text-sm leading-relaxed text-blue-100/85">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="prywatnosc" className="mx-auto grid w-full max-w-6xl gap-10 px-4 pb-24 lg:grid-cols-2 lg:items-center">
          <div>
            <span className="mb-4 inline-flex rounded-full border border-emerald-300/50 bg-emerald-300/15 px-4 py-1 text-sm font-bold text-emerald-200">
              Czysta komunikacja
            </span>
            <h2 className="mb-4 text-3xl font-black uppercase tracking-tight sm:text-4xl">Zero reklam. Zero śledzenia.</h2>
            <p className="text-blue-100/90">
              Devcord to prywatna przestrzeń zespołu. Brak reklam i brak sprzedaży danych użytkowników.
            </p>
          </div>
          <div className="flex justify-center">
            <div className="rounded-[2rem] border border-white/15 bg-white/10 p-10 backdrop-blur-md">
              <ShieldCheck size={140} className="text-emerald-200" />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
