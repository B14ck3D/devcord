import type { NoiseSuppressionProcessor as NsProcType } from '@shiguredo/noise-suppression';

export type PreparedMicTrack = {
  track: MediaStreamTrack;
  cleanup: () => void;
  rnnoiseApplied: boolean;
};

const LOG_PREFIX = '[devcord-rnnoise]';
const MIC_PRE_LIVEKIT_GAIN = 3.5;
const RNNOISE_DEBUG_LOGS = import.meta.env.DEV;

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
  if (!RNNOISE_DEBUG_LOGS && kind === 'ok') return;
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
      channelCount: { ideal: 1, max: 1 },
      sampleRate: { ideal: 48000 },
    },
    video: false,
  });
  const rawTrack = rawStream.getAudioTracks()[0];
  if (!rawTrack) {
    rawStream.getTracks().forEach((t) => t.stop());
    throw new Error('Mikrofon niedostępny.');
  }
  try {
    await rawTrack.applyConstraints({ channelCount: 1, sampleRate: 48000 });
  } catch {
    /* ignore */
  }

  const ACtx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  let processor: NsProcType | null = null;
  let trackIntoGraph: MediaStreamTrack = rawTrack;
  let monoPrepCleanup = () => {
    /* no-op */
  };
  rawTrack.contentHint = 'speech';

  if (ACtx) {
    const monoCtx = new ACtx({ latencyHint: 'interactive', sampleRate: 48000 });
    const monoSrc = monoCtx.createMediaStreamSource(new MediaStream([rawTrack]));
    const monoSplitter = monoCtx.createChannelSplitter(Math.max(2, monoSrc.channelCount || 2));
    const monoMerger = monoCtx.createChannelMerger(1);
    const monoL = monoCtx.createGain();
    const monoR = monoCtx.createGain();
    monoL.gain.value = 0.5;
    monoR.gain.value = 0.5;
    const monoDst = monoCtx.createMediaStreamDestination();
    monoDst.channelCount = 1;
    monoDst.channelCountMode = 'explicit';

    monoSrc.connect(monoSplitter);
    monoSplitter.connect(monoL, 0);
    monoL.connect(monoMerger, 0, 0);
    if (monoSrc.channelCount > 1) {
      monoSplitter.connect(monoR, 1);
      monoR.connect(monoMerger, 0, 0);
    }
    monoMerger.connect(monoDst);

    const monoTrack = monoDst.stream.getAudioTracks()[0];
    if (monoTrack) {
      try {
        await monoTrack.applyConstraints({ channelCount: 1 });
      } catch {
        /* ignore */
      }
      trackIntoGraph = monoTrack;
      const srcChannels = rawTrack.getSettings().channelCount ?? 1;
      if (srcChannels > 1) {
        log('ok', 'RNNoise stereo support: downmixed input to mono', { fromChannels: srcChannels });
      }
      monoPrepCleanup = () => {
        try {
          monoTrack.stop();
        } catch {
          /* ignore */
        }
        monoSrc.disconnect();
        monoSplitter.disconnect();
        monoL.disconnect();
        monoR.disconnect();
        monoMerger.disconnect();
        void monoCtx.close();
      };
    } else {
      monoSrc.disconnect();
      monoSplitter.disconnect();
      monoL.disconnect();
      monoR.disconnect();
      monoMerger.disconnect();
      void monoCtx.close();
    }
  }

  if (useRnnoise) {
    try {
      const { NoiseSuppressionProcessor } = await import('@shiguredo/noise-suppression');
      if (!NoiseSuppressionProcessor.isSupported()) {
        log('warn', 'Failed to load RNNoise: Insertable Streams (MediaStreamTrackProcessor) not supported');
      } else {
        const inChannels = trackIntoGraph.getSettings().channelCount ?? 1;
        if (inChannels > 1) {
          throw new Error(`RNNoise input not mono (channelCount=${inChannels})`);
        }
        processor = new NoiseSuppressionProcessor();
        const processed = await processor.startProcessing(trackIntoGraph);
        trackIntoGraph = processed;
        log('ok', 'RNNoise WASM loaded successfully');
      }
    } catch (e) {
      log('err', 'Failed to load RNNoise', e);
      log('warn', 'RNNoise bypass: microphone runs raw through GainNode only (no noise suppression)');
      processor = null;
    }
  } else {
    log('ok', 'RNNoise disabled by user setting; mono path kept');
  }

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
        monoPrepCleanup();
        rawStream.getTracks().forEach((t) => t.stop());
      },
    };
  }

  const ctx = new ACtx({ latencyHint: 'interactive', sampleRate: 48000 });
  const micStream = new MediaStream([trackIntoGraph]);
  const src = ctx.createMediaStreamSource(micStream);
  const gain = ctx.createGain();
  gain.gain.value = MIC_PRE_LIVEKIT_GAIN;
  // Keep a single-channel path after RNNoise to avoid stereo widening artifacts in voice chat.
  const monoMerger = ctx.createChannelMerger(1);
  const dst = ctx.createMediaStreamDestination();
  dst.channelCount = 1;
  dst.channelCountMode = 'explicit';
  src.connect(gain);
  gain.connect(monoMerger, 0, 0);
  monoMerger.connect(dst);

  const outTrack = dst.stream.getAudioTracks()[0];
  if (!outTrack) {
    src.disconnect();
    gain.disconnect();
    monoMerger.disconnect();
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
  try {
    await outTrack.applyConstraints({ channelCount: 1 });
  } catch {
    // Some browsers ignore channelCount constraints for processed tracks.
  }
  const onStateChange = () => {
    if (ctx.state !== 'running') void resumeIfNeeded(ctx);
  };
  ctx.addEventListener('statechange', onStateChange);
  log(
    'ok',
    'Mic graph: source(mono) →' +
      (processor?.isProcessing?.() ? ' RNNoise(mono) →' : ' ') +
      ` GainNode(×${MIC_PRE_LIVEKIT_GAIN}) → LiveKit`,
  );

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
      monoPrepCleanup();
      ctx.removeEventListener('statechange', onStateChange);
      src.disconnect();
      gain.disconnect();
      monoMerger.disconnect();
      rawStream.getTracks().forEach((t) => t.stop());
      void ctx.close();
    },
  };
}
