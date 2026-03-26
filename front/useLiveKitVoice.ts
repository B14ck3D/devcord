import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
import type { RemoteTrack } from 'livekit-client';
import type { VoicePhase } from './voicePhase';
import { prepareMicTrackWithRnnoise, type PreparedMicTrack } from './audio/rnnoisePipeline';
import {
  createVoiceActivityAudioContext,
  speakingRecordsEqual,
  startTrackRmsVad,
} from './voiceActivity';

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');
/** Liniowy mnożnik odsłuchu (PPM / kontekst): musi być zgodny ze `min`/`max` suwaków w App. */
export const VOICE_PEER_GAIN_MIN = 0.25;
export const VOICE_PEER_GAIN_MAX = 4;
const VOICE_LOG = '[devcord-voice]';

function logVoice(level: 'debug' | 'warn' | 'info', ...args: unknown[]) {
  if (typeof console === 'undefined') return;
  const fn = console[level] ?? console.log;
  fn.call(console, VOICE_LOG, ...args);
}

/** LiveKit wymaga attach() zdalnego audio do elementu — inaczej attachedElements=0 i nie ma dźwięku (README livekit-client). */
function ensureRemoteAudioAttached(track: RemoteTrack) {
  if (track.kind !== Track.Kind.Audio) return;
  if (track.attachedElements.length > 0) {
    logVoice('debug', 'remote audio already has elements', { sid: track.sid, n: track.attachedElements.length });
    return;
  }
  const el = track.attach();
  el.hidden = true;
  el.setAttribute('data-devcord-remote-audio', '1');
  if (!el.parentElement) document.body.appendChild(el);
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

  const roomRef = useRef<Room | null>(null);
  const remoteVolRef = useRef(new Map<string, number>());
  const remoteOutMuteRef = useRef(new Map<string, boolean>());
  const publishedScreenRef = useRef<Set<string>>(new Set());
  const publishedCamRef = useRef<Set<string>>(new Set());
  const localMicRef = useRef<PreparedMicTrack | null>(null);
  const audioGestureCleanupRef = useRef<(() => void) | null>(null);
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
      st[p.identity] = { muted: micMuted, deafened: false };
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
    teardownVoiceActivityProbes();
    audioGestureCleanupRef.current?.();
    audioGestureCleanupRef.current = null;
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      for (const pub of room.localParticipant.trackPublications.values()) {
        const tr = pub.track;
        if (tr?.kind === Track.Kind.Audio && pub.source === Track.Source.Microphone) {
          await room.localParticipant.unpublishTrack(tr);
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
    publishedCamRef.current.clear();
    setParticipants([]);
    setSpeakingPeers({});
    setRemoteScreenByUser({});
    setRemoteVoiceState({});
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

    (async () => {
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
        if (cancelled) return;

        setPhase('negotiating');
        const room = new Room({ adaptiveStream: true, dynacast: true, webAudioMix: true });
        roomRef.current = room;

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
        });
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          logVoice('debug', 'ParticipantConnected', { identity: participant.identity });
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.source !== Track.Source.Microphone) return;
            const t = pub.track;
            if (t?.kind === Track.Kind.Audio) attachRemoteMicVad(participant.identity, t.mediaStreamTrack);
          });
          syncParticipantList(room);
          refreshRemoteScreens(room);
          applyRemoteMuteUi(room);
          applyRemoteVolumes(room);
          void unlockRemoteAudio();
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          logVoice('debug', 'ParticipantDisconnected', { identity: participant.identity });
          remoteVadStopRef.current.get(participant.identity)?.();
          remoteVadStopRef.current.delete(participant.identity);
          delete probeSpeakingRef.current[participant.identity];
          flushSpeakingPeers();
          syncParticipantList(room);
          refreshRemoteScreens(room);
        });
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
          logVoice('debug', 'TrackSubscribed', {
            kind: track.kind,
            source: publication.source,
            identity: participant.identity,
            isLocal: participant.identity === room.localParticipant.identity,
          });
          if (track.kind === Track.Kind.Audio && participant.identity !== room.localParticipant.identity) {
            ensureRemoteAudioAttached(track);
            if (publication.source === Track.Source.Microphone) {
              attachRemoteMicVad(participant.identity, track.mediaStreamTrack);
            }
            void unlockRemoteAudio();
          }
          refreshRemoteScreens(room);
          applyRemoteMuteUi(room);
          applyRemoteVolumes(room);
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
        });
        room.on(RoomEvent.TrackMuted, () => {
          applyRemoteMuteUi(room);
        });
        room.on(RoomEvent.TrackUnmuted, () => {
          applyRemoteMuteUi(room);
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
        if (cancelled) {
          await room.disconnect();
          return;
        }

        room.remoteParticipants.forEach((p) => {
          p.audioTrackPublications.forEach((pub) => {
            const t = pub.track;
            if (t) ensureRemoteAudioAttached(t);
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

        const prepared = await prepareMicTrackWithRnnoise(micDeviceId, rnnoiseEnabled);
        localMicRef.current = prepared;
        await room.localParticipant.publishTrack(prepared.track, { source: Track.Source.Microphone });

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

        syncParticipantList(room);
        refreshRemoteScreens(room);
        applyRemoteMuteUi(room);
        applyRemoteVolumes(room);
        setPhase('connected');
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Błąd LiveKit');
        setPhase('error');
        await cleanupRoom();
      }
    })();

    return () => {
      cancelled = true;
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
    syncParticipantList,
    refreshRemoteScreens,
    applyRemoteMuteUi,
    applyRemoteVolumes,
  ]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    const micTrack = localMicRef.current?.track;
    if (micTrack) {
      micTrack.enabled = !localMuted;
      return;
    }
    void room.localParticipant.setMicrophoneEnabled(!localMuted, {
      deviceId: micDeviceId && micDeviceId !== 'default' ? { exact: micDeviceId } : undefined,
    });
  }, [localMuted, phase, micDeviceId]);

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
            await room.localParticipant.publishTrack(t, { source: Track.Source.ScreenShare });
            publishedScreenRef.current.add(t.id);
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
  }, [screenStream, cameraStream, phase]);

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
  };
}
