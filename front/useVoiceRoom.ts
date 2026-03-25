import { useCallback, useEffect, useRef, useState } from 'react';

export type VoicePhase =
  | 'idle'
  | 'requesting_microphone'
  | 'connecting_signaling'
  | 'joining_room'
  | 'negotiating'
  | 'connected'
  | 'error';

const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

function signalingWsURL(): string {
  const env = import.meta.env.VITE_WS_URL;
  if (env) return env;
  const p = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${p}//${location.host}/ws`;
}

type SigPayload = Record<string, unknown>;

/** Analiza poziomu z MediaStream (mikrofon lub zdalne audio WebRTC) — histereza, żeby UI nie migało. */
function createSpeakingLevelMonitor(
  stream: MediaStream,
  peerId: string,
  isMuted: () => boolean,
  onSpeaking: (id: string, speaking: boolean) => void,
): () => void {
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AC();
  void ctx.resume().catch(() => {});
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.55;
  source.connect(analyser);
  const data = new Uint8Array(analyser.frequencyBinCount);
  let raf = 0;
  let speaking = false;
  const hi = 13;
  const lo = 7;

  const tick = () => {
    if (isMuted()) {
      if (speaking) {
        speaking = false;
        onSpeaking(peerId, false);
      }
      raf = requestAnimationFrame(tick);
      return;
    }
    analyser.getByteFrequencyData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) sum += data[i];
    const avg = sum / data.length;
    if (!speaking && avg >= hi) {
      speaking = true;
      onSpeaking(peerId, true);
    } else if (speaking && avg <= lo) {
      speaking = false;
      onSpeaking(peerId, false);
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    cancelAnimationFrame(raf);
    source.disconnect();
    analyser.disconnect();
    void ctx.close();
    onSpeaking(peerId, false);
  };
}

export function useVoiceRoom(opts: {
  enabled: boolean;
  roomId: string | null;
  userId: string;
  micDeviceId: string;
  screenStream?: MediaStream | null;
}) {
  const { enabled, roomId, userId, micDeviceId, screenStream = null } = opts;
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [localMuted, setLocalMuted] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});
  const [remoteScreenByUser, setRemoteScreenByUser] = useState<Record<string, MediaStream>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const remoteAudioCombinedRef = useRef<Map<string, MediaStream>>(new Map());
  const remoteScreenTracksRef = useRef<Record<string, MediaStream>>({});
  const screenStreamRef = useRef<MediaStream | null>(null);
  const prevScreenTrackIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const localMutedRef = useRef(localMuted);
  localMutedRef.current = localMuted;

  const speakingSnapRef = useRef<Record<string, boolean>>({});
  const localVadStopRef = useRef<(() => void) | null>(null);
  const remoteVadStopRef = useRef<Map<string, () => void>>(new Map());

  const flushSpeaking = useCallback((id: string, speaking: boolean) => {
    if (speakingSnapRef.current[id] === speaking) return;
    speakingSnapRef.current[id] = speaking;
    setSpeakingPeers((prev) => ({ ...prev, [id]: speaking }));
  }, []);

  const sendSignal = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  screenStreamRef.current = screenStream;

  const flushIce = useCallback(
    async (peerId: string) => {
      const pc = pcsRef.current.get(peerId);
      if (!pc?.remoteDescription) return;
      const q = iceQueuesRef.current.get(peerId) ?? [];
      iceQueuesRef.current.set(peerId, []);
      for (const c of q) {
        try {
          await pc.addIceCandidate(c);
        } catch {
          /* ignore */
        }
      }
    },
    [],
  );

  const syncScreenShareTracks = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const screen = screenStreamRef.current;
    const oldIds = prevScreenTrackIdsRef.current;
    const newIds = new Set((screen?.getTracks() ?? []).map((t) => t.id));

    for (const [peerId, pc] of pcsRef.current) {
      for (const sender of [...pc.getSenders()]) {
        const tr = sender.track;
        if (tr && oldIds.has(tr.id) && !newIds.has(tr.id)) {
          pc.removeTrack(sender);
        }
      }
      if (screen) {
        const existing = new Set(
          pc.getSenders().map((s) => s.track?.id).filter(Boolean) as string[],
        );
        for (const t of screen.getTracks()) {
          if (!existing.has(t.id)) {
            pc.addTrack(t, screen);
          }
        }
      }
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        sendSignal({
          type: 'offer',
          payload: { target_user_id: peerId, sdp: offer.sdp, type: offer.type },
        });
      } catch {
        /* ignore */
      }
    }
    prevScreenTrackIdsRef.current = newIds;
  }, [sendSignal]);

  const cleanupAll = useCallback(() => {
    localVadStopRef.current?.();
    localVadStopRef.current = null;
    for (const stop of remoteVadStopRef.current.values()) stop();
    remoteVadStopRef.current.clear();
    speakingSnapRef.current = {};
    setSpeakingPeers({});

    iceQueuesRef.current.clear();
    for (const [, pc] of pcsRef.current) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
    }
    pcsRef.current.clear();
    for (const [, el] of audioElsRef.current) {
      el.remove();
    }
    audioElsRef.current.clear();
    remoteAudioCombinedRef.current.clear();
    remoteScreenTracksRef.current = {};
    prevScreenTrackIdsRef.current.clear();
    setRemoteScreenByUser({});
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (wsRef.current) {
      try {
        wsRef.current.send(JSON.stringify({ type: 'leave', payload: {} }));
      } catch {
        /* ignore */
      }
      wsRef.current.close();
      wsRef.current = null;
    }
    setParticipants([]);
  }, []);

  useEffect(() => {
    if (!enabled || !roomId) {
      cleanupAll();
      setPhase('idle');
      setError(null);
      return;
    }

    let cancelled = false;

    (async () => {
      setError(null);
      setPhase('requesting_microphone');
      try {
        const md = navigator.mediaDevices;
        if (!md?.getUserMedia) {
          const hint =
            typeof window !== 'undefined' && !window.isSecureContext
              ? ' Na adresie IP użyj HTTPS: npm run dev:https, potem https://TenSamHost:5173 (zaakceptuj certyfikat). Albo localhost. Zwykły http://IP nie da mikrofonu.'
              : '';
          throw new Error(`Brak dostępu do API mikrofonu w tej przeglądarce.${hint}`);
        }
        const audioConstraints: MediaTrackConstraints =
          micDeviceId && micDeviceId !== 'default'
            ? { deviceId: { exact: micDeviceId }, echoCancellation: true, noiseSuppression: true }
            : { echoCancellation: true, noiseSuppression: true };
        const stream = await md.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        localVadStopRef.current?.();
        localVadStopRef.current = createSpeakingLevelMonitor(
          stream,
          userIdRef.current,
          () => localMutedRef.current,
          flushSpeaking,
        );

        setPhase('connecting_signaling');
        const ws = new WebSocket(signalingWsURL());
        wsRef.current = ws;

        await new Promise<void>((resolve, reject) => {
          const t = window.setTimeout(() => reject(new Error('timeout WebSocket')), 15000);
          ws.onopen = () => {
            window.clearTimeout(t);
            resolve();
          };
          ws.onerror = () => {
            window.clearTimeout(t);
            reject(new Error('WebSocket'));
          };
        });

        if (cancelled) return;

        const attachScreenIfAny = (pc: RTCPeerConnection) => {
          const scr = screenStreamRef.current;
          if (!scr) return;
          const existing = new Set(
            pc.getSenders().map((s) => s.track?.id).filter(Boolean) as string[],
          );
          for (const t of scr.getTracks()) {
            if (!existing.has(t.id)) {
              pc.addTrack(t, scr);
            }
          }
        };

        const ensurePc = (peerId: string): RTCPeerConnection => {
          let pc = pcsRef.current.get(peerId);
          if (pc) return pc;
          pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
          pc.onicecandidate = (ev) => {
            if (ev.candidate) {
              sendSignal({
                type: 'ice_candidate',
                payload: { target_user_id: peerId, candidate: ev.candidate.toJSON() },
              });
            }
          };
          pc.ontrack = (ev) => {
            if (ev.track.kind === 'video') {
              const ms = ev.streams[0] ?? new MediaStream([ev.track]);
              remoteScreenTracksRef.current[peerId] = ms;
              const combined = remoteAudioCombinedRef.current.get(peerId);
              if (combined) {
                for (const t of [...combined.getAudioTracks()]) {
                  if (ms.getAudioTracks().some((s) => s.id === t.id)) {
                    combined.removeTrack(t);
                  }
                }
                const el = audioElsRef.current.get(peerId);
                if (el) el.srcObject = combined;
              }
              setRemoteScreenByUser((prev) => ({ ...prev, [peerId]: ms }));
              ev.track.addEventListener('ended', () => {
                setRemoteScreenByUser((prev) => {
                  const next = { ...prev };
                  const cur = next[peerId];
                  if (!cur?.getVideoTracks().some((t) => t.readyState === 'live')) {
                    delete next[peerId];
                    delete remoteScreenTracksRef.current[peerId];
                  }
                  return next;
                });
              });
              return;
            }
            if (ev.track.kind !== 'audio') return;
            const screenMs = remoteScreenTracksRef.current[peerId];
            if (screenMs?.getTracks().some((t) => t.id === ev.track.id)) {
              return;
            }
            let combined = remoteAudioCombinedRef.current.get(peerId);
            if (!combined) {
              combined = new MediaStream();
              remoteAudioCombinedRef.current.set(peerId, combined);
            }
            if (!combined.getAudioTracks().some((t) => t.id === ev.track.id)) {
              combined.addTrack(ev.track);
            }
            let el = audioElsRef.current.get(peerId);
            if (!el) {
              el = document.createElement('audio');
              el.autoplay = true;
              el.setAttribute('playsinline', '');
              el.volume = 1;
              document.body.appendChild(el);
              audioElsRef.current.set(peerId, el);
            }
            el.srcObject = combined;
            void el.play().catch(() => {});

            remoteVadStopRef.current.get(peerId)?.();
            const stopRemoteVad = createSpeakingLevelMonitor(combined, peerId, () => false, flushSpeaking);
            remoteVadStopRef.current.set(peerId, stopRemoteVad);

            ev.track.addEventListener('ended', () => {
              try {
                combined?.removeTrack(ev.track);
              } catch {
                /* ignore */
              }
            });
          };
          const s = streamRef.current;
          if (s) s.getTracks().forEach((t) => pc!.addTrack(t, s));
          attachScreenIfAny(pc);
          pcsRef.current.set(peerId, pc);
          return pc;
        };

        const connectToPeer = async (peerId: string) => {
          if (peerId === userIdRef.current) return;
          setPhase('negotiating');
          const pc = ensurePc(peerId);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendSignal({
            type: 'offer',
            payload: { target_user_id: peerId, sdp: offer.sdp, type: offer.type },
          });
        };

        ws.onmessage = async (ev) => {
          let env: { type: string; payload?: SigPayload };
          try {
            env = JSON.parse(ev.data as string);
          } catch {
            return;
          }
          const pl = env.payload ?? {};

          if (env.type === 'joined') {
            const uid = pl.user_id as string;
            const pids = (pl.peer_ids as string[]) ?? [];
            const all = [uid, ...pids].filter(Boolean);
            setParticipants([...new Set(all)].sort());
            setPhase('negotiating');
            for (const pid of pids) {
              await connectToPeer(pid);
            }
            setPhase('connected');
            return;
          }

          if (env.type === 'user_joined') {
            const uid = pl.user_id as string;
            if (uid && uid !== userIdRef.current) {
              setParticipants((prev) => [...new Set([...prev, uid])].sort());
            }
            return;
          }

          if (env.type === 'user_disconnected') {
            const uid = pl.user_id as string;
            setParticipants((prev) => prev.filter((x) => x !== uid));
            const pc = pcsRef.current.get(uid);
            if (pc) {
              pc.close();
              pcsRef.current.delete(uid);
            }
            const el = audioElsRef.current.get(uid);
            if (el) {
              el.remove();
              audioElsRef.current.delete(uid);
            }
            remoteAudioCombinedRef.current.delete(uid);
            delete remoteScreenTracksRef.current[uid];
            setRemoteScreenByUser((prev) => {
              const n = { ...prev };
              delete n[uid];
              return n;
            });
            remoteVadStopRef.current.get(uid)?.();
            remoteVadStopRef.current.delete(uid);
            iceQueuesRef.current.delete(uid);
            return;
          }

          if (env.type === 'error') {
            const msg = (pl.message as string) || 'błąd sygnalizacji';
            setError(msg);
            setPhase('error');
            return;
          }

          if (env.type === 'offer') {
            const from = pl.from_user_id as string;
            const sdp = pl.sdp as string;
            const typ = pl.type as RTCSdpType;
            if (!from || !sdp) return;
            setPhase('negotiating');
            const pc = ensurePc(from);
            await pc.setRemoteDescription({ type: typ, sdp });
            await flushIce(from);
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            sendSignal({
              type: 'answer',
              payload: { target_user_id: from, sdp: answer.sdp, type: answer.type },
            });
            setPhase('connected');
            return;
          }

          if (env.type === 'answer') {
            const from = pl.from_user_id as string;
            const sdp = pl.sdp as string;
            const typ = pl.type as RTCSdpType;
            if (!from || !sdp) return;
            const pc = pcsRef.current.get(from);
            if (!pc) return;
            await pc.setRemoteDescription({ type: typ, sdp });
            await flushIce(from);
            setPhase('connected');
            return;
          }

          if (env.type === 'ice_candidate') {
            const from = pl.from_user_id as string;
            const cand = pl.candidate as RTCIceCandidateInit | undefined;
            if (!from || !cand) return;
            const pc = pcsRef.current.get(from);
            if (!pc) {
              const q = iceQueuesRef.current.get(from) ?? [];
              q.push(cand);
              iceQueuesRef.current.set(from, q);
              return;
            }
            if (!pc.remoteDescription) {
              const q = iceQueuesRef.current.get(from) ?? [];
              q.push(cand);
              iceQueuesRef.current.set(from, q);
              return;
            }
            try {
              await pc.addIceCandidate(cand);
            } catch {
              /* ignore */
            }
          }
        };

        setPhase('joining_room');
        ws.send(JSON.stringify({ type: 'join_room', payload: { user_id: userIdRef.current, room_id: roomId } }));
      } catch (e) {
        if (cancelled) return;
        const msg =
          e instanceof Error
            ? e.name === 'NotAllowedError'
              ? 'Brak dostępu do mikrofonu'
              : e.message
            : 'Błąd';
        setError(msg);
        setPhase('error');
        cleanupAll();
      }
    })();

    return () => {
      cancelled = true;
      cleanupAll();
    };
  }, [enabled, roomId, userId, micDeviceId, cleanupAll, flushIce, sendSignal, flushSpeaking]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    const id = window.setTimeout(() => void syncScreenShareTracks(), 30);
    return () => clearTimeout(id);
  }, [screenStream, enabled, roomId, phase, syncScreenShareTracks]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !localMuted;
    });
  }, [localMuted]);

  return {
    phase,
    error,
    participants,
    localMuted,
    setLocalMuted,
    speakingPeers,
    remoteScreenByUser,
  };
}
