import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionState, Room, RoomEvent, Track } from 'livekit-client';
import type { VoicePhase } from './useVoiceRoom';

const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '');

export function useLiveKitVoice(opts: {
  enabled: boolean;
  channelId: string | null;
  userId: string;
  accessToken: string;
  micDeviceId: string;
  screenStream?: MediaStream | null;
  cameraStream?: MediaStream | null;
  screenBitrate?: number;
}) {
  const { enabled, channelId, userId, accessToken, micDeviceId, screenStream = null, cameraStream = null } = opts;

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
  const userIdNorm = String(userId);

  const [voiceDiagnostics, setVoiceDiagnostics] = useState({
    backend: 'livekit' as const,
    connectionState: 'disconnected',
    participantCount: 0,
    meshPeerConnectionCount: 0,
    meshNegotiationMsLast: null as number | null,
    meshTransportRttMs: null as number | null,
    meshInboundPacketsLost: null as number | null,
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

  const applyRemoteVolumes = useCallback((room: Room) => {
    const deaf = localDeafenedRef.current;
    room.remoteParticipants.forEach((p) => {
      const g = remoteVolRef.current.get(p.identity) ?? 1;
      const outMute = remoteOutMuteRef.current.get(p.identity) ?? false;
      const vol = deaf || outMute ? 0 : Math.min(1, Math.max(0, g));
      p.audioTrackPublications.forEach((pub) => {
        const t = pub.track;
        if (t && 'setVolume' in t) (t as { setVolume: (v: number) => void }).setVolume(vol);
      });
    });
  }, []);

  const localDeafenedRef = useRef(localDeafened);
  localDeafenedRef.current = localDeafened;

  const cleanupRoom = useCallback(async () => {
    const room = roomRef.current;
    roomRef.current = null;
    if (room) {
      room.removeAllListeners();
      await room.disconnect();
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
  }, []);

  useEffect(() => {
    if (!enabled || !channelId || !API_BASE || !accessToken.trim()) {
      void cleanupRoom();
      setPhase('idle');
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setError(null);
      setPhase('connecting_signaling');
      try {
        const tr = await fetch(
          `${API_BASE}/voice/livekit-token?channel_id=${encodeURIComponent(channelId)}`,
          { headers: { Authorization: `Bearer ${accessToken}` }, credentials: 'include' },
        );
        if (!tr.ok) {
          const errText = await tr.text().catch(() => '');
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
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        room.on(RoomEvent.ConnectionStateChanged, (s) => {
          setVoiceDiagnostics((d) => ({ ...d, connectionState: String(s) }));
        });
        room.on(RoomEvent.ParticipantConnected, () => {
          syncParticipantList(room);
          refreshRemoteScreens(room);
          applyRemoteMuteUi(room);
          applyRemoteVolumes(room);
        });
        room.on(RoomEvent.ParticipantDisconnected, () => {
          syncParticipantList(room);
          refreshRemoteScreens(room);
        });
        room.on(RoomEvent.TrackSubscribed, () => {
          refreshRemoteScreens(room);
          applyRemoteMuteUi(room);
          applyRemoteVolumes(room);
        });
        room.on(RoomEvent.TrackMuted, () => {
          applyRemoteMuteUi(room);
        });
        room.on(RoomEvent.TrackUnmuted, () => {
          applyRemoteMuteUi(room);
        });
        room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
          const m: Record<string, boolean> = {};
          for (const p of speakers) m[p.identity] = true;
          setSpeakingPeers(m);
        });

        await room.connect(url, token, { autoSubscribe: true });
        if (cancelled) {
          await room.disconnect();
          return;
        }

        await room.localParticipant.setMicrophoneEnabled(true, {
          deviceId: micDeviceId && micDeviceId !== 'default' ? { exact: micDeviceId } : undefined,
        });

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
  }, [enabled, channelId, accessToken, micDeviceId, cleanupRoom, syncParticipantList, refreshRemoteScreens, applyRemoteMuteUi, applyRemoteVolumes]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
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

  return {
    phase,
    error,
    participants: participants.length ? participants : enabled && channelId ? [userIdNorm] : [],
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
