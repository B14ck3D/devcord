import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
} from 'react';
import { AudioPresets, Room, RoomEvent, Track } from 'livekit-client';

import {
  createVoiceActivityAudioContext,
  speakingRecordsEqual,
  startTrackRmsVad,
} from '../voiceActivity';

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

export function useVoiceConnection(opts: {
  enabled: boolean;
  channelId: string | null;
  dmConversationId: string | null;
  accessToken: string;
  micDeviceId: string;
  rnnoiseEnabled: boolean;
  apiBase: string;
  setPhase: Dispatch<SetStateAction<import('../voicePhase').VoicePhase>>;
  setError: Dispatch<SetStateAction<string | null>>;
  roomRef: MutableRefObject<Room | null>;
  localMutedRef: MutableRefObject<boolean>;
  setLocalMuted: Dispatch<SetStateAction<boolean>>;
  syncParticipantList: (room: Room) => void;
  refreshRemoteScreens: (room: Room) => void;
  scheduleRoomUiSync: (room: Room, includeScreens?: boolean) => void;
  setVoiceDiagnostics: Dispatch<SetStateAction<{ backend: 'livekit'; connectionState: string; participantCount: number }>>;
  clearUiSyncTimer: () => void;
  resetParticipantState: () => void;
  ensureRemoteAudioAttached: (
    track: import('livekit-client').RemoteTrack,
    participantIdentity?: string,
    localIdentity?: string,
  ) => void;
  detachAndRemoveTrackElements: (track: import('livekit-client').RemoteTrack) => void;
  clearDetachedAudioElements: () => void;
  cleanupLocalMic: () => void;
  resetTrackState: () => void;
  publishLocalMic: (room: Room, micDeviceId: string, rnnoiseEnabled: boolean) => Promise<{ track: MediaStreamTrack }>;
  stopAllLocalPublications: (room: Room) => Promise<void>;
  logDebug: (message: string, detail?: unknown) => void;
  logInfo: (message: string, detail?: unknown) => void;
  logWarn: (message: string, detail?: unknown) => void;
}) {
  const {
    enabled,
    channelId,
    dmConversationId,
    accessToken,
    micDeviceId,
    rnnoiseEnabled,
    apiBase,
    setPhase,
    setError,
    roomRef,
    localMutedRef,
    setLocalMuted,
    syncParticipantList,
    refreshRemoteScreens,
    scheduleRoomUiSync,
    setVoiceDiagnostics,
    clearUiSyncTimer,
    resetParticipantState,
    ensureRemoteAudioAttached,
    detachAndRemoveTrackElements,
    clearDetachedAudioElements,
    cleanupLocalMic,
    resetTrackState,
    publishLocalMic,
    stopAllLocalPublications,
    logDebug,
    logInfo,
    logWarn,
  } = opts;

  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});

  const audioGestureCleanupRef = useRef<(() => void) | null>(null);
  const connectSessionRef = useRef(0);
  const teardownChainRef = useRef<Promise<void>>(Promise.resolve());

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
  }, [localMutedRef, roomRef]);

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
    const run = async () => {
      clearUiSyncTimer();
      teardownVoiceActivityProbes();
      audioGestureCleanupRef.current?.();
      audioGestureCleanupRef.current = null;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        await stopAllLocalPublications(room);
        room.removeAllListeners();
        await room.disconnect();
      }
      cleanupLocalMic();
      clearDetachedAudioElements();
      resetTrackState();
      setSpeakingPeers({});
      resetParticipantState();
      setVoiceDiagnostics((d) => ({
        ...d,
        connectionState: 'disconnected',
        participantCount: 0,
      }));
    };

    teardownChainRef.current = teardownChainRef.current.then(run, run);
    await teardownChainRef.current;
  }, [
    clearUiSyncTimer,
    teardownVoiceActivityProbes,
    roomRef,
    stopAllLocalPublications,
    cleanupLocalMic,
    clearDetachedAudioElements,
    resetTrackState,
    resetParticipantState,
    setVoiceDiagnostics,
  ]);

  useEffect(() => {
    flushSpeakingPeers();
  }, [flushSpeakingPeers]);

  useEffect(() => {
    const dm = (dmConversationId ?? '').trim();
    const ch = (channelId ?? '').trim();
    const hasTarget = dm ? true : !!ch;
    if (!enabled || !hasTarget || !apiBase || !accessToken.trim()) {
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

    void (async () => {
      await cleanupRoom();
      if (isStale()) return;
      setError(null);
      setPhase('connecting_signaling');
      try {
        const q = dm
          ? `dm_conversation_id=${encodeURIComponent(dm)}`
          : `channel_id=${encodeURIComponent(ch)}`;
        const tr = await fetch(`${apiBase}/voice/livekit-token?${q}`, {
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
          logWarn('mic permission preflight failed', {
            message: micError instanceof Error ? micError.message : String(micError),
          });
        }
        if (isStale()) return;

        setPhase('negotiating');
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
            logDebug('startAudio ok', {
              canPlayback: room.canPlaybackAudio,
              remoteCount: room.remoteParticipants.size,
            });
          } catch (e) {
            logWarn('startAudio failed (autoplay / gesture)', e);
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
          logInfo('ConnectionStateChanged', { state: String(s) });
        });
        room.on(RoomEvent.Disconnected, (reason) => {
          logWarn('Disconnected', { reason: String(reason ?? 'unknown') });
        });
        room.on(RoomEvent.ParticipantConnected, (participant) => {
          participant.audioTrackPublications.forEach((pub) => {
            if (pub.source !== Track.Source.Microphone) return;
            const t = pub.track;
            if (t?.kind === Track.Kind.Audio) attachRemoteMicVad(participant.identity, t.mediaStreamTrack);
          });
          scheduleRoomUiSync(room, true);
          void unlockRemoteAudio();
        });
        room.on(RoomEvent.ParticipantDisconnected, (participant) => {
          remoteVadStopRef.current.get(participant.identity)?.();
          remoteVadStopRef.current.delete(participant.identity);
          delete probeSpeakingRef.current[participant.identity];
          flushSpeakingPeers();
          scheduleRoomUiSync(room, true);
        });
        room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
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
            detachAndRemoveTrackElements(track);
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
          const prepared = await publishLocalMic(room, micDeviceId, rnnoiseEnabled);
          if (isStale()) {
            prepared.track.stop();
            return;
          }
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
          logWarn('local mic publish failed, keep room connected for listen-only mode', {
            message: micError instanceof Error ? micError.message : String(micError),
          });
          setLocalMuted(true);
        }

        syncParticipantList(room);
        refreshRemoteScreens(room);
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
    apiBase,
    roomRef,
    setLocalMuted,
    localMutedRef,
    syncParticipantList,
    refreshRemoteScreens,
    scheduleRoomUiSync,
    setVoiceDiagnostics,
    ensureRemoteAudioAttached,
    detachAndRemoveTrackElements,
    publishLocalMic,
    cleanupRoom,
    flushSpeakingPeers,
    logDebug,
    logInfo,
    logWarn,
  ]);

  return { speakingPeers, cleanupRoom, flushSpeakingPeers };
}
