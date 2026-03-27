import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { MicVocal, MonitorPlay, ShieldCheck, Zap } from "lucide-react";

const featureCards = [
  {
    Icon: MicVocal,
    title: "RNNoise AI",
    text: "Wbudowane odszumianie oparte na sztucznej inteligencji. Zero szumu klawiatury, czysty głos.",
  },
  {
    Icon: MonitorPlay,
    title: "Streaming 1080p 240FPS",
    text: "Udostępniaj ekran z e-sportową płynnością. Bez płatnych subskrypcji, bez limitów.",
  },
  {
    Icon: Zap,
    title: "Zbudowane dla szybkości",
    text: "Architektura oparta na Go i WebRTC. Opóźnienia rzędu milisekund, nawet przy 50 osobach na kanale.",
  },
];

const LandingSections = () => {
  const payload = useMemo(
    () =>
      `{
  "event": "user_joined",
  "user": "kuba_dev",
  "channel": "backend"
}`,
    [],
  );

  const [typedPayload, setTypedPayload] = useState("");

  useEffect(() => {
    let index = 0;
    const timer = window.setInterval(() => {
      index += 1;
      setTypedPayload(payload.slice(0, index));
      if (index >= payload.length) {
        window.clearInterval(timer);
      }
    }, 22);

    return () => window.clearInterval(timer);
  }, [payload]);

  return (
    <>
      <section id="funkcje" className="relative py-24">
        <div className="container mx-auto px-4 lg:px-8">
          <motion.h2
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55 }}
            className="mx-auto mb-12 max-w-4xl text-center text-3xl font-black uppercase tracking-tight text-gradient-hero sm:text-4xl lg:text-5xl"
          >
            Wydajność bez kompromisów
          </motion.h2>

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {featureCards.map(({ Icon, title, text }, index) => (
              <motion.article
                key={title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: index * 0.08 }}
                className="group rounded-2xl bg-gradient-to-br from-white/15 via-white/5 to-transparent p-[1px] transition-transform duration-300 hover:scale-[1.02]"
              >
                <div className="h-full rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md">
                  <div className="mb-4 inline-flex rounded-xl border border-white/10 bg-white/10 p-3 text-primary shadow-lg shadow-primary/10">
                    <Icon size={24} />
                  </div>
                  <h3 className="mb-2 text-xl font-extrabold tracking-tight text-foreground">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{text}</p>
                </div>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section id="prywatnosc" className="relative py-24">
        <div className="container mx-auto grid items-center gap-14 px-4 lg:grid-cols-2 lg:gap-10 lg:px-8">
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={{ duration: 0.55 }}
            className="max-w-xl"
          >
            <span className="mb-4 inline-flex rounded-full border border-emerald-400/35 bg-emerald-400/10 px-4 py-1 text-sm font-bold text-emerald-300">
              Czysta komunikacja
            </span>
            <h2 className="mb-5 text-3xl font-black uppercase leading-tight tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Zero reklam. Zero śledzenia.
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Devcord powstał, bo mieliśmy dość wciskania płatnych subskrypcji i banerów reklamowych. Twój serwer to
              Twoja prywatna przestrzeń. Nie sprzedajemy Twoich danych i nigdy nie dodamy reklam.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.6 }}
            className="flex items-center justify-center"
          >
            <motion.div
              animate={{ y: [0, -14, 0, 10, 0], rotate: [0, 2, 0, -1, 0] }}
              transition={{ duration: 6.4, repeat: Infinity, repeatType: "mirror", ease: "easeInOut" }}
              className="relative rounded-[2rem] border border-white/10 bg-white/5 p-10 backdrop-blur-md"
            >
              <div className="pointer-events-none absolute inset-0 rounded-[2rem] bg-primary/20 blur-3xl" />
              <ShieldCheck className="relative text-emerald-300 drop-shadow-[0_0_30px_rgba(74,222,128,0.35)]" size={170} />
            </motion.div>
          </motion.div>
        </div>
      </section>

      <section id="deweloperzy" className="relative py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(88,102,242,0.2),transparent_55%)]" />
        <div className="container relative mx-auto px-4 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.25 }}
            transition={{ duration: 0.55 }}
            className="mx-auto mb-10 max-w-3xl text-center"
          >
            <h2 className="mb-4 text-3xl font-black uppercase tracking-tight text-foreground sm:text-4xl lg:text-5xl">
              Potężne API i webhooki
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground sm:text-lg">
              Zarządzaj swoim serwerem jak prawdziwy inżynier. Twórz własne boty, automatyzuj zadania i integruj
              Devcorda ze swoimi repozytoriami.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6 }}
            className="mx-auto max-w-4xl overflow-hidden rounded-2xl border border-gray-800 bg-black shadow-[0_30px_120px_-30px_rgba(0,0,0,0.9)]"
          >
            <div className="flex items-center gap-2 border-b border-gray-800 px-4 py-3">
              <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
              <span className="ml-2 text-xs font-semibold uppercase tracking-widest text-gray-400">Webhook Terminal</span>
            </div>
            <pre className="overflow-x-auto p-5 text-sm leading-7 text-green-400 sm:text-base">
              <code className="font-mono">
                {typedPayload}
                <motion.span
                  animate={{ opacity: [1, 0, 1] }}
                  transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }}
                  className="ml-0.5 inline-block text-green-300"
                >
                  |
                </motion.span>
              </code>
            </pre>
          </motion.div>
        </div>
      </section>
    </>
  );
};

export default LandingSections;
