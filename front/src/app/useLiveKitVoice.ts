import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioPresets, ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';
import type { VoicePhase } from './voicePhase';
import { prepareMicTrackWithRnnoise, type PreparedMicTrack } from '../audio/rnnoisePipeline';
import {
  createVoiceActivityAudioContext,
  speakingRecordsEqual,
  startTrackRmsVad,
} from './voiceActivity';
import { resolveApiBaseUrl } from '../config/apiBase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
/** Liniowy mnożnik odsłuchu (PPM / kontekst): musi być zgodny ze `min`/`max` suwaków w App. */
export const VOICE_PEER_GAIN_MIN = 0.25;
export const VOICE_PEER_GAIN_MAX = 4;
const VOICE_LOG = '[devcord-voice]';
const VOICE_DEBUG_LOGS = import.meta.env.DEV;

export type ScreenPublishStats = {
  captureFps: number | null;
  sendBitrateKbps: number | null;
  packetsLost: number | null;
};

function logVoice(level: 'debug' | 'warn' | 'info', ...args: unknown[]) {
  if (typeof console === 'undefined') return;
  if (!VOICE_DEBUG_LOGS && (level === 'debug' || level === 'info')) return;
  const fn = console[level] ?? console.log;
  fn.call(console, VOICE_LOG, ...args);
}

/** LiveKit wymaga attach() zdalnego audio do elementu — inaczej attachedElements=0 i nie ma dźwięku (README livekit-client). */
function ensureRemoteAudioAttached(track: RemoteTrack, participantIdentity?: string, localIdentity?: string) {
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
      logVoice('debug', 'remote audio play() retry failed', { sid: track.sid, error: String(e) });
    });
    logVoice('debug', 'remote audio already has element', { sid: track.sid, n: track.attachedElements.length });
    return;
  }
  const el = track.attach();
  el.autoplay = true;
  el.setAttribute('playsinline', 'true');
  // Keep it off-screen instead of hidden to avoid browser quirks with hidden media playback.
  el.style.position = 'fixed';
  el.style.left = '-99999px';
  el.style.width = '1px';
  el.style.height = '1px';
  el.style.opacity = '0';
  el.style.pointerEvents = 'none';
  el.setAttribute('data-devcord-remote-audio', '1');
  if (!el.parentElement) document.body.appendChild(el);
  void el.play().catch((e) => {
    logVoice('debug', 'remote audio initial play() failed', { sid: track.sid, error: String(e) });
  });
  logVoice('info', 'remote audio attached', { sid: track.sid, paused: (el as HTMLAudioElement).paused });
}

function emitForceLogout(reason: string) {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent('devcord:force-logout', { detail: { reason } }));
  } catch {
    /* ignore */
  }
}

async function ensureMicPermission(deviceId: string) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) return;
  const stream = await navigator.mediaDevices.getUserMedia({
    audio:
      deviceId && deviceId !== 'default'
        ? {
            deviceId: { exact: deviceId },
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1, max: 1 },
            sampleRate: { ideal: 48000 },
          }
        : {
            echoCancellation: { ideal: true },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: true },
            channelCount: { ideal: 1, max: 1 },
            sampleRate: { ideal: 48000 },
          },
    video: false,
  });
  stream.getTracks().forEach((track) => track.stop());
}

export function useLiveKitVoice(opts: {
  enabled: boolean;
  channelId: string | null;
  dmConversationId: string | null;
  userId: string;
  accessToken: string;
  micDeviceId: string;
  screenStream?: MediaStream | null;
  cameraStream?: MediaStream | null;
  screenBitrate?: number;
  screenPreferredCodec?: 'av1' | 'h264';
  rnnoiseEnabled?: boolean;
}) {
  const {
    enabled,
    channelId,
    dmConversationId,
    userId,
    accessToken,
    micDeviceId,
    screenStream = null,
    cameraStream = null,
    screenBitrate = 4_000_000,
    screenPreferredCodec = 'h264',
    rnnoiseEnabled = true,
  } = opts;

  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});
  const [remoteScreenByUser, setRemoteScreenByUser] = useState<Record<string, MediaStream>>({});
  const [remoteVoiceState, setRemoteVoiceState] = useState<Record<string, { muted: boolean; deafened: boolean }>>({});
  const [screenPublishStats, setScreenPublishStats] = useState<ScreenPublishStats>({
    captureFps: null,
    sendBitrateKbps: null,
    packetsLost: null,
  });

  const roomRef = useRef<Room | null>(null);
  const remoteVolRef = useRef(new Map<string, number>());
  const remoteOutMuteRef = useRef(new Map<string, boolean>());
  const publishedScreenRef = useRef<Set<string>>(new Set());
  const publishedScreenAudioRef = useRef<Set<string>>(new Set());
  const publishedCamRef = useRef<Set<string>>(new Set());
  const screenBytesRef = useRef<Record<string, { bytes: number; ts: number }>>({});
  const localMicRef = useRef<PreparedMicTrack | null>(null);
  const audioGestureCleanupRef = useRef<(() => void) | null>(null);
  const uiSyncTimerRef = useRef<number | null>(null);
  const uiSyncNeedsScreensRef = useRef(false);
  const connectSessionRef = useRef(0);
  const userIdNorm = String(userId);

  const [voiceDiagnostics, setVoiceDiagnostics] = useState({
    backend: 'livekit' as const,
    connectionState: 'disconnected',
    participantCount: 0,
  });

  const syncParticipantList = useCallback((room: Room) => {
    const ids = new Set<string>();
    ids.add(room.localParticipant.identity);
    room.remoteParticipants.forEach((p) => ids.add(p.identity));
    setParticipants([...ids].sort());
    setVoiceDiagnostics((d) => ({
      ...d,
      participantCount: ids.size,
      connectionState: room.state === ConnectionState.Connected ? 'connected' : String(room.state),
    }));
  }, []);

  const refreshRemoteScreens = useCallback((room: Room) => {
    const next: Record<string, MediaStream> = {};
    room.remoteParticipants.forEach((p) => {
      const ms = new MediaStream();
      p.trackPublications.forEach((pub) => {
        if (pub.kind !== Track.Kind.Video) return;
        const t = pub.track;
        if (!t) return;
        if (pub.source === Track.Source.ScreenShare || pub.source === Track.Source.ScreenShareAudio) {
          ms.addTrack(t.mediaStreamTrack);
        }
      });
      if (ms.getTracks().length > 0) next[p.identity] = ms;
    });
    setRemoteScreenByUser(next);
  }, []);

  const applyRemoteMuteUi = useCallback((room: Room) => {
    const st: Record<string, { muted: boolean; deafened: boolean }> = {};
    room.remoteParticipants.forEach((p) => {
      let micMuted = true;
      p.audioTrackPublications.forEach((pub) => {
        if (pub.track && !pub.isMuted) micMuted = false;
      });
      const attrs = (p as unknown as { attributes?: Record<string, string> }).attributes ?? {};
      st[p.identity] = { muted: micMuted, deafened: attrs.deafened === 'true' };
    });
    setRemoteVoiceState(st);
  }, []);

  /** Przy webAudioMix: RemoteAudioTrack.setVolume ustawia GainNode (nie element.volume), więc >1 daje podbicie jak suwak 200%. */
  const applyRemoteVolumes = useCallback((room: Room) => {
    const deaf = localDeafenedRef.current;
    room.remoteParticipants.forEach((p) => {
      const g = remoteVolRef.current.get(p.identity) ?? 1;
      const outMute = remoteOutMuteRef.current.get(p.identity) ?? false;
      const vol =
        deaf || outMute ? 0 : Math.min(VOICE_PEER_GAIN_MAX, Math.max(VOICE_PEER_GAIN_MIN, g));
      p.setVolume(vol, Track.Source.Microphone);
      p.setVolume(vol, Track.Source.ScreenShareAudio);
    });
  }, []);

  const scheduleRoomUiSync = useCallback(
    (room: Room, includeScreens = false) => {
      if (includeScreens) uiSyncNeedsScreensRef.current = true;
      if (uiSyncTimerRef.current !== null) return;
      uiSyncTimerRef.current = window.setTimeout(() => {
        uiSyncTimerRef.current = null;
        if (roomRef.current !== room) return;
        syncParticipantList(room);
        if (uiSyncNeedsScreensRef.current) {
          refreshRemoteScreens(room);
          uiSyncNeedsScreensRef.current = false;
        }
        applyRemoteMuteUi(room);
        applyRemoteVolumes(room);
      }, 0);
    },
    [syncParticipantList, refreshRemoteScreens, applyRemoteMuteUi, applyRemoteVolumes],
  );

  const localDeafenedRef = useRef(localDeafened);
  localDeafenedRef.current = localDeafened;
  const localMutedRef = useRef(localMuted);
  localMutedRef.current = localMuted;

  const serverSpeakingRef = useRef<Record<string, boolean>>({});
  const probeSpeakingRef = useRef<Record<string, boolean>>({});
  const vadCtxRef = useRef<AudioContext | null>(null);
  const stopLocalVadRef = useRef<(() => void) | null>(null);
  const remoteVadStopRef = useRef(new Map<string, () => void>());

  const flushSpeakingPeers = useCallback(() => {
    const room = roomRef.current;
    if (!room) return;
    const probe = probeSpeakingRef.current;
    const server = serverSpeakingRef.current;
    const ids = new Set<string>();
    ids.add(room.localParticipant.identity);
    room.remoteParticipants.forEach((p) => ids.add(p.identity));
    const localId = room.localParticipant.identity;
    const next: Record<string, boolean> = {};
    for (const id of ids) {
      let v = Object.prototype.hasOwnProperty.call(probe, id) ? !!probe[id] : !!server[id];
      if (id === localId && localMutedRef.current) v = false;
      next[id] = v;
    }
    setSpeakingPeers((prev) => (speakingRecordsEqual(prev, next) ? prev : next));
  }, []);

  const teardownVoiceActivityProbes = useCallback(() => {
    remoteVadStopRef.current.forEach((fn) => fn());
    remoteVadStopRef.current.clear();
    stopLocalVadRef.current?.();
    stopLocalVadRef.current = null;
    try {
      void vadCtxRef.current?.close();
    } catch {
      /* ignore */
    }
    vadCtxRef.current = null;
    probeSpeakingRef.current = {};
    serverSpeakingRef.current = {};
  }, []);

  const cleanupRoom = useCallback(async () => {
    if (uiSyncTimerRef.current !== null) {
      clearTimeout(uiSyncTimerRef.current);
      uiSyncTimerRef.current = null;
    }
    uiSyncNeedsScreensRef.current = false;
    teardownVoiceActivityProbes();
    audioGestureCleanupRef.current?.();
    audioGestureCleanupRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
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
      room.removeAllListeners();
      await room.disconnect();
    }
    if (localMicRef.current) {
      localMicRef.current.cleanup();
      localMicRef.current = null;
    }
    publishedScreenRef.current.clear();
    publishedScreenAudioRef.current.clear();
    publishedCamRef.current.clear();
    screenBytesRef.current = {};
    setParticipants([]);
    setSpeakingPeers({});
    setRemoteScreenByUser({});
    setRemoteVoiceState({});
    setScreenPublishStats({ captureFps: null, sendBitrateKbps: null, packetsLost: null });
    setVoiceDiagnostics((d) => ({
      ...d,
      connectionState: 'disconnected',
      participantCount: 0,
    }));
  }, [teardownVoiceActivityProbes]);

  useEffect(() => {
    flushSpeakingPeers();
  }, [localMuted, flushSpeakingPeers]);

  useEffect(() => {
    const dm = (dmConversationId ?? '').trim();
    const ch = (channelId ?? '').trim();
    const hasTarget = dm ? true : !!ch;
    if (!enabled || !hasTarget || !API_BASE || !accessToken.trim()) {
      void cleanupRoom();
      setPhase('idle');
      setError(null);
      return;
    }
    if (dm && ch) {
      void cleanupRoom();
      setPhase('error');
      setError('Konflikt: ustaw tylko channelId albo dmConversationId.');
      return;
    }

    let cancelled = false;
    const sessionId = ++connectSessionRef.current;
    const isStale = () => cancelled || sessionId !== connectSessionRef.current;

    (async () => {
      await cleanupRoom();
      if (isStale()) return;
      setError(null);
      setPhase('connecting_signaling');
      try {
        const q = dm
          ? `dm_conversation_id=${encodeURIComponent(dm)}`
          : `channel_id=${encodeURIComponent(ch)}`;
        const tr = await fetch(`${API_BASE}/voice/livekit-token?${q}`, {
          headers: { Authorization: `Bearer ${accessToken}` },
          credentials: 'include',
        });
        if (!tr.ok) {
          const errText = await tr.text().catch(() => '');
          if (tr.status === 401) emitForceLogout('voice_token_401');
          throw new Error(
            tr.status === 503
              ? 'LiveKit nie jest skonfigurowany po stronie API (LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET).'
              : `Token głosu: ${tr.status} ${errText.slice(0, 160)}`,
          );
        }
        const body = (await tr.json()) as { token?: string; url?: string };
        const token = body.token?.trim();
        const url = body.url?.trim();
        if (!token || !url) throw new Error('Niepoprawna odpowiedź tokena LiveKit.');
        if (isStale()) return;

        try {
          await ensureMicPermission(micDeviceId);
        } catch (micError) {
          // Don't block room join on microphone permission failure.
          // User should still be able to hear others even when local mic cannot be published.
          logVoice('warn', 'mic permission preflight failed', {
            message: micError instanceof Error ? micError.message : String(micError),
          });
        }
        if (isStale()) return;

        setPhase('negotiating');
        // Hybrid mode: optimize voice bandwidth, keep high-performance screen publish settings.
        const room = new Room({
          adaptiveStream: true,
          dynacast: true,
          webAudioMix: true,
          publishDefaults: {
            audioPreset: AudioPresets.speech,
            dtx: false,
            red: false,
            forceStereo: false,
          },
        });
        roomRef.current = room;
        if (isStale()) {
          await room.disconnect();
          return;
        }

        const unlockRemoteAudio = async () => {
          try {
            await room.startAudio();
            logVoice('debug', 'startAudio ok', {
              canPlayback: room.canPlaybackAudio,
              remoteCount: room.remoteParticipants.size,
            });
          } catch (e) {
            logVoice('warn', 'startAudio failed (autoplay / gesture)', e);
          }
        };

        const ensureVadCtx = () => {
          if (!vadCtxRef.current) vadCtxRef.current = createVoiceActivityAudioContext();
          return vadCtxRef.current;
        };

        const attachRemoteMicVad = (identity: string, mediaTrack: MediaStreamTrack) => {
          const ctx = ensureVadCtx();
          if (!ctx) return;
          remoteVadStopRef.current.get(identity)?.();
          const stop = startTrackRmsVad(mediaTrack, {
            audioContext: ctx,
            onSpeakingChange: (speaking) => {
              probeSpeakingRef.current[identity] = speaking;
              flushSpeakingPeers();
            },
          });
          remoteVadStopRef.current.set(identity, stop);
        };

        const wireExistingRemoteMics = () => {
          room.remoteParticipants.forEach((p) => {
            p.audioTrackPublications.forEach((pub) => {
              if (pub.source !== Track.Source.Microphone) return;
              const t = pub.track;
              if (t?.kind === Track.Kind.Audio) attachRemoteMicVad(p.identity, t.mediaStreamTrack);
            });
          });
        };
        room.on(RoomEvent.ConnectionStateChanged, (s) => {
          setVoiceDiagnostics((d) => ({ ...d, connectionState: String(s) }));
          logVoice('info', 'ConnectionStateChanged', { state: String(s) });
        });
        room.on(RoomEvent.Disconnected, (reason) => {
          logVoice('warn', 'Disconnected', { reason: String(reason ?? 'unknown') });
        });
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          logVoice('debug', 'ParticipantConnected', { identity: participant.identity });
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.source !== Track.Source.Microphone) return;
            const t = pub.track;
            if (t?.kind === Track.Kind.Audio) attachRemoteMicVad(participant.identity, t.mediaStreamTrack);
          });
          scheduleRoomUiSync(room, true);
          void unlockRemoteAudio();
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          logVoice('debug', 'ParticipantDisconnected', { identity: participant.identity });
          remoteVadStopRef.current.get(participant.identity)?.();
          remoteVadStopRef.current.delete(participant.identity);
          delete probeSpeakingRef.current[participant.identity];
          flushSpeakingPeers();
          scheduleRoomUiSync(room, true);
        });
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          logVoice('debug', 'TrackSubscribed', {
            kind: track.kind,
            source: publication.source,
            identity: participant.identity,
            isLocal: participant.identity === room.localParticipant.identity,
          });
          if (track.kind === Track.Kind.Audio && participant.identity !== room.localParticipant.identity) {
            ensureRemoteAudioAttached(track, participant.identity, room.localParticipant.identity);
            if (publication.source === Track.Source.Microphone) {
              attachRemoteMicVad(participant.identity, track.mediaStreamTrack);
            }
            void unlockRemoteAudio();
          }
          scheduleRoomUiSync(room, track.kind === Track.Kind.Video);
        });
        room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
          if (track.kind === Track.Kind.Audio) {
            if (publication.source === Track.Source.Microphone && participant.identity !== room.localParticipant.identity) {
              remoteVadStopRef.current.get(participant.identity)?.();
              remoteVadStopRef.current.delete(participant.identity);
              delete probeSpeakingRef.current[participant.identity];
              flushSpeakingPeers();
            }
            logVoice('debug', 'TrackUnsubscribed audio, detach');
            try {
              track.detach();
            } catch (e) {
              logVoice('warn', 'detach remote audio', e);
            }
          }
          scheduleRoomUiSync(room, track.kind === Track.Kind.Video);
        });
        room.on(RoomEvent.TrackMuted, () => {
          scheduleRoomUiSync(room);
        });
        room.on(RoomEvent.TrackUnmuted, () => {
          scheduleRoomUiSync(room);
        });
        room.on(RoomEvent.ParticipantAttributesChanged, () => {
          scheduleRoomUiSync(room);
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const srv: Record<string, boolean> = {};
          room.remoteParticipants.forEach((p) => {
            srv[p.identity] = false;
          });
          srv[room.localParticipant.identity] = false;
          for (const p of speakers) srv[p.identity] = true;
          serverSpeakingRef.current = srv;
          flushSpeakingPeers();
        });

        await room.connect(url, token, { autoSubscribe: true });
        if (isStale()) {
          await room.disconnect();
          return;
        }

        room.remoteParticipants.forEach((p) => {
          p.audioTrackPublications.forEach((pub) => {
            const t = pub.track;
            if (t?.kind === Track.Kind.Audio) {
              ensureRemoteAudioAttached(t, p.identity, room.localParticipant.identity);
            }
          });
        });
        wireExistingRemoteMics();

        await unlockRemoteAudio();
        if (!room.canPlaybackAudio) {
          const onGesture = () => {
            void unlockRemoteAudio();
          };
          window.addEventListener('pointerdown', onGesture, true);
          audioGestureCleanupRef.current = () => window.removeEventListener('pointerdown', onGesture, true);
        }
        room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
          if (!room.canPlaybackAudio) void unlockRemoteAudio();
        });

        try {
          if (isStale()) return;
          const prepared = await prepareMicTrackWithRnnoise(micDeviceId, rnnoiseEnabled);
          if (isStale()) {
            prepared.cleanup();
            return;
          }
          localMicRef.current = prepared;
          await room.localParticipant.publishTrack(prepared.track, {
            source: Track.Source.Microphone,
            audioPreset: AudioPresets.speech,
            dtx: false,
            red: false,
            forceStereo: false,
          });

          stopLocalVadRef.current?.();
          const vadCtx = ensureVadCtx();
          if (vadCtx) {
            const localIdentity = room.localParticipant.identity;
            stopLocalVadRef.current = startTrackRmsVad(prepared.track, {
              audioContext: vadCtx,
              onSpeakingChange: (speaking) => {
                probeSpeakingRef.current[localIdentity] = speaking;
                flushSpeakingPeers();
              },
            });
            flushSpeakingPeers();
          }
        } catch (micError) {
          logVoice('warn', 'local mic publish failed, keep room connected for listen-only mode', {
            message: micError instanceof Error ? micError.message : String(micError),
          });
          setLocalMuted(true);
        }

        scheduleRoomUiSync(room, true);
        if (isStale()) return;
        setPhase('connected');
      } catch (e) {
        if (isStale()) return;
        setError(e instanceof Error ? e.message : 'Błąd LiveKit');
        setPhase('error');
        await cleanupRoom();
      }
    })();

    return () => {
      cancelled = true;
      if (connectSessionRef.current === sessionId) {
        connectSessionRef.current += 1;
      }
      void cleanupRoom();
    };
  }, [
    enabled,
    channelId,
    dmConversationId,
    accessToken,
    micDeviceId,
    rnnoiseEnabled,
    cleanupRoom,
    scheduleRoomUiSync,
  ]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    const micTrack = localMicRef.current?.track;
    if (micTrack) {
      micTrack.enabled = !localMuted;
      return;
    }
    // Avoid spawning an unmanaged fallback track outside our mono/RNNoise pipeline.
    logVoice('warn', 'skip setMicrophoneEnabled fallback: local mic pipeline track missing');
  }, [localMuted, phase, micDeviceId]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    void room.localParticipant
      .setAttributes({ deafened: localDeafened ? 'true' : 'false' })
      .catch((e) => logVoice('warn', 'setAttributes(deafened) failed', e));
  }, [localDeafened, phase]);

  useEffect(() => {
    if (localDeafened && !localMuted) setLocalMuted(true);
  }, [localDeafened, localMuted]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    applyRemoteVolumes(room);
  }, [localDeafened, phase, applyRemoteVolumes]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;

    const run = async () => {
      const wantS = new Set((screenStream?.getVideoTracks() ?? []).map((t) => t.id));
      const wantSA = new Set((screenStream?.getAudioTracks() ?? []).map((t) => t.id));
      const wantC = new Set((cameraStream?.getVideoTracks() ?? []).map((t) => t.id));

      for (const sid of [...publishedScreenRef.current]) {
        if (!wantS.has(sid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
            const tr = pub.track;
            if (tr?.kind === Track.Kind.Video && pub.source === Track.Source.ScreenShare && tr.mediaStreamTrack.id === sid) {
              await room.localParticipant.unpublishTrack(tr);
            }
          }
          publishedScreenRef.current.delete(sid);
        }
      }
      for (const sid of [...publishedScreenAudioRef.current]) {
        if (!wantSA.has(sid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
            const tr = pub.track;
            if (tr?.kind === Track.Kind.Audio && pub.source === Track.Source.ScreenShareAudio && tr.mediaStreamTrack.id === sid) {
              await room.localParticipant.unpublishTrack(tr);
            }
          }
          publishedScreenAudioRef.current.delete(sid);
        }
      }
      for (const cid of [...publishedCamRef.current]) {
        if (!wantC.has(cid)) {
          for (const pub of room.localParticipant.trackPublications.values()) {
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
          if (!publishedScreenAudioRef.current.has(t.id)) {
            await room.localParticipant.publishTrack(t, { source: Track.Source.ScreenShareAudio });
            publishedScreenAudioRef.current.add(t.id);
          }
        }
      }
      if (cameraStream) {
        for (const t of cameraStream.getVideoTracks()) {
          if (!publishedCamRef.current.has(t.id)) {
            await room.localParticipant.publishTrack(t, { source: Track.Source.Camera });
            publishedCamRef.current.add(t.id);
          }
        }
      }
    };

    void run();
  }, [screenStream, cameraStream, phase, screenBitrate, screenPreferredCodec]);

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
  }, [phase, screenStream]);

  const setUserVolume = useCallback(
    (peerId: string, linearGain: number) => {
      remoteVolRef.current.set(peerId, linearGain);
      const room = roomRef.current;
      if (!room) return;
      applyRemoteVolumes(room);
    },
    [applyRemoteVolumes],
  );

  const setUserOutputMuted = useCallback(
    (peerId: string, muted: boolean) => {
      remoteOutMuteRef.current.set(peerId, muted);
      const room = roomRef.current;
      if (!room) return;
      applyRemoteVolumes(room);
    },
    [applyRemoteVolumes],
  );

  const hasRoom =
    enabled && ((channelId ?? '').trim() !== '' || (dmConversationId ?? '').trim() !== '');
  return {
    phase,
    error,
    participants: participants.length ? participants : enabled && hasRoom ? [userIdNorm] : [],
    localMuted,
    setLocalMuted,
    localDeafened,
    setLocalDeafened,
    speakingPeers,
    remoteScreenByUser,
    remoteVoiceState,
    setUserVolume,
    setUserOutputMuted,
    voiceDiagnostics,
    screenPublishStats,
  };
}
