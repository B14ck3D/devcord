const AC = typeof window !== 'undefined' ? window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext : undefined;

export type TrackRmsVadOptions = {
  audioContext: AudioContext;
  onSpeakingChange: (speaking: boolean) => void;
  /** RMS ~0.02–0.04 dla normalnego mówienia przy fft 256; niżej = czułej. */
  thresholdOn?: number;
  thresholdOff?: number;
};

/**
 * Lokalny RMS VAD na poziomie przeglądarki — opóźnienie ~1 klatka rAF, bez round-trip do SFU.
 */
export function startTrackRmsVad(track: MediaStreamTrack, options: TrackRmsVadOptions): () => void {
  const thresholdOn = options.thresholdOn ?? 0.026;
  const thresholdOff = options.thresholdOff ?? 0.012;
  const ctx = options.audioContext;
  const src = ctx.createMediaStreamSource(new MediaStream([track]));
  const an = ctx.createAnalyser();
  an.fftSize = 256;
  an.smoothingTimeConstant = 0.22;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  let speaking = false;
  let raf = 0;

  const tick = () => {
    if (track.readyState === 'ended') {
      if (speaking) {
        speaking = false;
        options.onSpeakingChange(false);
      }
      return;
    }
    an.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const x = buf[i]!;
      sum += x * x;
    }
    const rms = Math.sqrt(sum / buf.length);
    let next = speaking;
    if (!speaking && rms >= thresholdOn) next = true;
    else if (speaking && rms <= thresholdOff) next = false;
    if (next !== speaking) {
      speaking = next;
      options.onSpeakingChange(speaking);
    }
    raf = requestAnimationFrame(tick);
  };

  void ctx.resume().catch(() => {});
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    try {
      src.disconnect();
    } catch {
      /* ignore */
    }
    try {
      an.disconnect();
    } catch {
      /* ignore */
    }
  };
}

export function createVoiceActivityAudioContext(): AudioContext | null {
  if (!AC) return null;
  return new AC();
}

export function speakingRecordsEqual(a: Record<string, boolean>, b: Record<string, boolean>): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (!!a[k] !== !!b[k]) return false;
  }
  return true;
}
