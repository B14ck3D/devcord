/**
 * Bramka szumów w przeglądarce: mierzy poziom RMS (dB względem pełnej skali),
 * poniżej progu tłumi wyjście. To działa po stronie klienta — nie wymaga backendu.
 */
export function createMicNoiseGate(
  inputStream: MediaStream,
  opts: {
    getOpenThresholdDb: () => number;
    getHardMuted: () => boolean;
    hysteresisDb?: number;
  },
): { stream: MediaStream; dispose: () => void } {
  const hysteresisDb = opts.hysteresisDb ?? 5;

  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  void ctx.resume().catch(() => {});

  const source = ctx.createMediaStreamSource(inputStream);
  const gain = ctx.createGain();
  gain.gain.value = 0;
  const dest = ctx.createMediaStreamDestination();
  source.connect(gain);
  gain.connect(dest);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.35;
  source.connect(analyser);

  const buf = new Float32Array(analyser.fftSize);
  let gateOpen = false;
  let smoothed = 0;
  let raf = 0;

  const tick = () => {
    const hard = opts.getHardMuted();
    if (hard) {
      smoothed += (0 - smoothed) * 0.45;
      gain.gain.value = smoothed;
      raf = requestAnimationFrame(tick);
      return;
    }

    const openTh = opts.getOpenThresholdDb();
    const closeTh = openTh - hysteresisDb;

    analyser.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i] ?? 0;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / buf.length);
    const db = 20 * Math.log10(rms + 1e-9);

    if (gateOpen) {
      if (db < closeTh) gateOpen = false;
    } else if (db > openTh) {
      gateOpen = true;
    }

    const target = gateOpen ? 1 : 0;
    const coeff = target > smoothed ? 0.42 : 0.07;
    smoothed += (target - smoothed) * coeff;
    if (smoothed < 0.001) smoothed = 0;
    if (smoothed > 0.999) smoothed = 1;
    gain.gain.value = smoothed;

    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return {
    stream: dest.stream,
    dispose() {
      cancelAnimationFrame(raf);
      try {
        source.disconnect();
        gain.disconnect();
        analyser.disconnect();
      } catch {
        /* ignore */
      }
      void ctx.close();
      dest.stream.getTracks().forEach((t) => t.stop());
    },
  };
}
