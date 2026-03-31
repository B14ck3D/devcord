import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { AudioPresets, Room, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';

import { prepareMicTrackWithRnnoise, type PreparedMicTrack } from '../../audio/rnnoisePipeline';
import type { VoicePhase } from '../voicePhase';
import type { ScreenPublishStats } from './voiceTypes';

function removeMediaElements(elements: Element[]) {
  for (const element of elements) {
    if (element instanceof HTMLMediaElement) {
      try {
        element.pause();
      } catch {
        /* ignore */
      }
    }
    if (element.parentElement) {
      element.remove();
    }
  }
}

export function useVoiceTracks(opts: {
  roomRef: MutableRefObject<Room | null>;
  phase: VoicePhase;
  localMuted: boolean;
  screenStream?: MediaStream | null;
  cameraStream?: MediaStream | null;
  screenBitrate: number;
  screenPreferredCodec: 'av1' | 'h264';
  setScreenPublishStats: Dispatch<SetStateAction<ScreenPublishStats>>;
  logDebug: (message: string, detail?: unknown) => void;
  logWarn: (message: string, detail?: unknown) => void;
  userIdNorm: string;
}) {
  const {
    roomRef,
    phase,
    localMuted,
    screenStream = null,
    cameraStream = null,
    screenBitrate,
    screenPreferredCodec,
    setScreenPublishStats,
    logDebug,
    logWarn,
    userIdNorm,
  } = opts;

  const publishedScreenRef = useRef<Set<string>>(new Set());
  const publishedScreenAudioRef = useRef<Set<string>>(new Set());
  const publishedCamRef = useRef<Set<string>>(new Set());
  const screenBytesRef = useRef<Record<string, { bytes: number; ts: number }>>({});
  const localMicRef = useRef<PreparedMicTrack | null>(null);
  const syncVersionRef = useRef(0);

  const ensureRemoteAudioAttached = useCallback(
    (track: RemoteTrack, participantIdentity?: string, localIdentity?: string) => {
      if (participantIdentity && localIdentity && participantIdentity === localIdentity) return;
      if (track.kind !== Track.Kind.Audio) return;
      const existing = track.attachedElements.find((el) => el instanceof HTMLAudioElement) as
        | HTMLAudioElement
        | undefined;
      if (existing) {
        existing.autoplay = true;
        existing.setAttribute('playsinline', 'true');
        if (!existing.isConnected) document.body.appendChild(existing);
        void existing.play().catch((e) => {
          logDebug('remote audio play() retry failed', { sid: track.sid, error: String(e) });
        });
        return;
      }
      const el = track.attach();
      el.autoplay = true;
      el.setAttribute('playsinline', 'true');
      el.style.position = 'fixed';
      el.style.left = '-99999px';
      el.style.width = '1px';
      el.style.height = '1px';
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';
      el.setAttribute('data-devcord-remote-audio', '1');
      if (!el.parentElement) document.body.appendChild(el);
      void el.play().catch((e) => {
        logDebug('remote audio initial play() failed', { sid: track.sid, error: String(e) });
      });
    },
    [logDebug],
  );

  const detachAndRemoveTrackElements = useCallback((track: RemoteTrack) => {
    try {
      const detached = track.detach();
      removeMediaElements(detached);
    } catch {
      /* ignore */
    }
  }, []);

  const clearDetachedAudioElements = useCallback(() => {
    const staleNodes = document.querySelectorAll('[data-devcord-remote-audio="1"]');
    staleNodes.forEach((node) => {
      if (node instanceof HTMLMediaElement) {
        try {
          node.pause();
        } catch {
          /* ignore */
        }
      }
      node.remove();
    });
  }, []);

  const resetTrackState = useCallback(() => {
    publishedScreenRef.current.clear();
    publishedScreenAudioRef.current.clear();
    publishedCamRef.current.clear();
    screenBytesRef.current = {};
    setScreenPublishStats({ captureFps: null, sendBitrateKbps: null, packetsLost: null });
  }, [setScreenPublishStats]);

  const cleanupLocalMic = useCallback(() => {
    if (localMicRef.current) {
      localMicRef.current.cleanup();
      localMicRef.current = null;
    }
  }, []);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    const micTrack = localMicRef.current?.track;
    if (micTrack) {
      micTrack.enabled = !localMuted;
      return;
    }
    logWarn('skip setMicrophoneEnabled fallback: local mic pipeline track missing');
  }, [roomRef, phase, localMuted, logWarn]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;

    let cancelled = false;
    const version = ++syncVersionRef.current;
    const isStale = () => cancelled || syncVersionRef.current !== version || roomRef.current !== room;

    const run = async () => {
      const wantS = new Set((screenStream?.getVideoTracks() ?? []).map((t) => t.id));
      const wantSA = new Set((screenStream?.getAudioTracks() ?? []).map((t) => t.id));
      const wantC = new Set((cameraStream?.getVideoTracks() ?? []).map((t) => t.id));

      for (const sid of [...publishedScreenRef.current]) {
        if (isStale()) return;
        if (!wantS.has(sid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
            if (isStale()) return;
            const tr = pub.track;
            if (tr?.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare && tr.mediaStreamTrack.id === sid) {
              await room.localParticipant.unpublishTrack(tr);
            }
          }
          publishedScreenRef.current.delete(sid);
        }
      }
      for (const sid of [...publishedScreenAudioRef.current]) {
        if (isStale()) return;
        if (!wantSA.has(sid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
            if (isStale()) return;
            const tr = pub.track;
            if (tr?.kind === Track.Kind.Audio && pub.source === Track.Source.ScreenShareAudio && tr.mediaStreamTrack.id === sid) {
              await room.localParticipant.unpublishTrack(tr);
            }
          }
          publishedScreenAudioRef.current.delete(sid);
        }
      }
      for (const cid of [...publishedCamRef.current]) {
        if (isStale()) return;
        if (!wantC.has(cid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
            if (isStale()) return;
            const tr = pub.track;
            if (tr?.kind === Track.Kind.Video && pub.source === Track.Source.Camera && tr.mediaStreamTrack.id === cid) {
              await room.localParticipant.unpublishTrack(tr);
            }
          }
          publishedCamRef.current.delete(cid);
        }
      }

      if (screenStream) {
        for (const t of screenStream.getVideoTracks()) {
          if (isStale()) return;
          if (!publishedScreenRef.current.has(t.id)) {
            await room.localParticipant.publishTrack(
              t,
              {
                source: Track.Source.ScreenShare,
                simulcast: false,
                videoCodec: screenPreferredCodec,
                videoEncoding: { maxBitrate: screenBitrate, maxFramerate: 240 },
              } as never,
            );
            publishedScreenRef.current.add(t.id);
          }
        }
        for (const t of screenStream.getAudioTracks()) {
          if (isStale()) return;
          if (!publishedScreenAudioRef.current.has(t.id)) {
            await room.localParticipant.publishTrack(t, { source: Track.Source.ScreenShareAudio });
            publishedScreenAudioRef.current.add(t.id);
          }
        }
      }
      if (cameraStream) {
        for (const t of cameraStream.getVideoTracks()) {
          if (isStale()) return;
          if (!publishedCamRef.current.has(t.id)) {
            await room.localParticipant.publishTrack(t, { source: Track.Source.Camera });
            publishedCamRef.current.add(t.id);
          }
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [roomRef, phase, screenStream, cameraStream, screenBitrate, screenPreferredCodec]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    let alive = true;
    const poll = async () => {
      const pubs = [...room.localParticipant.trackPublications.values()].filter(
        (p) => p.source === Track.Source.ScreenShare && p.kind === Track.Kind.Video,
      );
      if (pubs.length === 0) {
        if (alive) setScreenPublishStats({ captureFps: null, sendBitrateKbps: null, packetsLost: null });
        return;
      }
      const pub = pubs[0];
      const t = pub.track;
      const captureFps = t?.mediaStreamTrack?.getSettings?.().frameRate ?? null;
      let sendBitrateKbps: number | null = null;
      let packetsLost: number | null = null;

      const statsFn = (t as unknown as { getRTCStatsReport?: () => Promise<RTCStatsReport> }).getRTCStatsReport;
      if (typeof statsFn === 'function') {
        try {
          const report = await statsFn.call(t);
          report.forEach((s: RTCStats) => {
            const sAny = s as RTCStats & {
              kind?: string;
              bytesSent?: number;
              packetsLost?: number;
            };
            if (sAny.type === 'outbound-rtp' && sAny.kind === 'video' && typeof sAny.bytesSent === 'number') {
              const key = sAny.id || pub.trackSid || 'screen';
              const prev = screenBytesRef.current[key];
              if (prev) {
                const dt = (sAny.timestamp - prev.ts) / 1000;
                if (dt > 0) {
                  const bytesDiff = sAny.bytesSent - prev.bytes;
                  sendBitrateKbps = Math.max(0, Math.round((bytesDiff * 8) / dt / 1000));
                }
              }
              screenBytesRef.current[key] = { bytes: sAny.bytesSent, ts: sAny.timestamp };
            }
            if (
              sAny.type === 'remote-inbound-rtp' &&
              sAny.kind === 'video' &&
              typeof sAny.packetsLost === 'number'
            ) {
              packetsLost = sAny.packetsLost;
            }
          });
        } catch {
          /* ignore */
        }
      }

      if (alive) setScreenPublishStats({ captureFps, sendBitrateKbps, packetsLost });
    };
    void poll();
    const id = window.setInterval(() => void poll(), 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [roomRef, phase, screenStream, setScreenPublishStats]);

  const publishLocalMic = useCallback(
    async (room: Room, micDeviceId: string, rnnoiseEnabled: boolean) => {
      const prepared = await prepareMicTrackWithRnnoise(micDeviceId, rnnoiseEnabled);
      localMicRef.current = prepared;
      await room.localParticipant.publishTrack(prepared.track, {
        source: Track.Source.Microphone,
        audioPreset: AudioPresets.speech,
        dtx: false,
        red: false,
        forceStereo: false,
      });
      return prepared;
    },
    [],
  );

  const stopAllLocalPublications = useCallback(async (room: Room) => {
    for (const pub of room.localParticipant.trackPublications.values()) {
      const tr = pub.track;
      if (!tr) continue;
      try {
        await room.localParticipant.unpublishTrack(tr);
      } catch {
        /* ignore */
      }
      try {
        tr.mediaStreamTrack.stop();
      } catch {
        /* ignore */
      }
    }
  }, []);

  return {
    userIdNorm,
    localMicRef,
    publishedScreenRef,
    publishedScreenAudioRef,
    publishedCamRef,
    ensureRemoteAudioAttached,
    detachAndRemoveTrackElements,
    clearDetachedAudioElements,
    cleanupLocalMic,
    resetTrackState,
    publishLocalMic,
    stopAllLocalPublications,
  };
}
