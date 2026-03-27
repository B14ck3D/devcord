import type { NoiseSuppressionProcessor as NsProcType } from '@shiguredo/noise-suppression';

export type PreparedMicTrack = {
  track: MediaStreamTrack;
  cleanup: () => void;
  rnnoiseApplied: boolean;
};

const LOG_PREFIX = '[devcord-rnnoise]';

/** Po RNNoise / fallbacu: cyfrowy boost nadawcy (bez autoGainControl). */
const MIC_PRE_LIVEKIT_GAIN = 3.5;

async function resumeIfNeeded(ctx: AudioContext) {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
  }
}

function log(kind: 'ok' | 'warn' | 'err', msg: string, extra?: unknown) {
  if (typeof console === 'undefined') return;
  const fn = kind === 'err' ? console.error : kind === 'warn' ? console.warn : console.log;
  fn.call(console, LOG_PREFIX, msg, extra ?? '');
}

export async function prepareMicTrackWithRnnoise(
  deviceId: string,
  useRnnoise: boolean,
): Promise<PreparedMicTrack> {
  const rawStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
    },
    video: false,
  });
  const rawTrack = rawStream.getAudioTracks()[0];
  if (!rawTrack) {
    rawStream.getTracks().forEach((t) => t.stop());
    throw new Error('Mikrofon niedostępny.');
  }

  let processor: NsProcType | null = null;
  let trackIntoGraph: MediaStreamTrack = rawTrack;
  rawTrack.contentHint = 'speech';

  if (useRnnoise) {
    try {
      const { NoiseSuppressionProcessor } = await import('@shiguredo/noise-suppression');
      if (!NoiseSuppressionProcessor.isSupported()) {
        log('warn', 'Failed to load RNNoise: Insertable Streams (MediaStreamTrackProcessor) not supported');
      } else {
        processor = new NoiseSuppressionProcessor();
        const processed = await processor.startProcessing(rawTrack);
        trackIntoGraph = processed;
        log('ok', 'RNNoise WASM loaded successfully');
      }
    } catch (e) {
      log('err', 'Failed to load RNNoise', e);
      log('warn', 'RNNoise bypass: microphone runs raw through GainNode only (no noise suppression)');
      processor = null;
      trackIntoGraph = rawTrack;
    }
  } else {
    log('ok', 'RNNoise disabled by user setting');
  }

  const ACtx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!ACtx) {
    log('warn', 'No AudioContext — publishing raw mic track');
    return {
      track: trackIntoGraph,
      rnnoiseApplied: !!processor?.isProcessing?.(),
      cleanup: () => {
        try {
          processor?.stopProcessing();
        } catch {
          /* ignore */
        }
        rawStream.getTracks().forEach((t) => t.stop());
      },
    };
  }

  const ctx = new ACtx({ latencyHint: 'interactive', sampleRate: 48000 });
  const micStream = new MediaStream([trackIntoGraph]);
  const src = ctx.createMediaStreamSource(micStream);
  const gain = ctx.createGain();
  gain.gain.value = MIC_PRE_LIVEKIT_GAIN;
  const dst = ctx.createMediaStreamDestination();
  src.connect(gain);
  gain.connect(dst);

  const outTrack = dst.stream.getAudioTracks()[0];
  if (!outTrack) {
    src.disconnect();
    gain.disconnect();
    void ctx.close();
    try {
      processor?.stopProcessing();
    } catch {
      /* ignore */
    }
    rawStream.getTracks().forEach((t) => t.stop());
    throw new Error('Processed track missing');
  }

  await resumeIfNeeded(ctx);
  const onStateChange = () => {
    if (ctx.state !== 'running') void resumeIfNeeded(ctx);
  };
  ctx.addEventListener('statechange', onStateChange);
  log('ok', 'Mic graph: source →' + (processor?.isProcessing?.() ? ' RNNoise →' : '') + ` GainNode(×${MIC_PRE_LIVEKIT_GAIN}) → LiveKit`);

  const rnnoiseApplied = !!processor?.isProcessing?.();

  return {
    track: outTrack,
    rnnoiseApplied,
    cleanup: () => {
      try {
        outTrack.stop();
      } catch {
        /* ignore */
      }
      try {
        processor?.stopProcessing();
      } catch {
        /* ignore */
      }
      ctx.removeEventListener('statechange', onStateChange);
      src.disconnect();
      gain.disconnect();
      rawStream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
