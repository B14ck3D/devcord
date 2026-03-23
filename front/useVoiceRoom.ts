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

export function useVoiceRoom(opts: {
  enabled: boolean;
  roomId: string | null;
  userId: string;
  micDeviceId: string;
}) {
  const { enabled, roomId, userId, micDeviceId } = opts;
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [localMuted, setLocalMuted] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;

  const sendSignal = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

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

  const cleanupAll = useCallback(() => {
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
            let el = audioElsRef.current.get(peerId);
            if (!el) {
              el = document.createElement('audio');
              el.autoplay = true;
              el.setAttribute('playsinline', '');
              el.volume = 1;
              document.body.appendChild(el);
              audioElsRef.current.set(peerId, el);
            }
            el.srcObject = ev.streams[0];
            void el.play().catch(() => {});
          };
          const s = streamRef.current;
          if (s) s.getTracks().forEach((t) => pc!.addTrack(t, s));
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
  }, [enabled, roomId, userId, micDeviceId, cleanupAll, flushIce, sendSignal]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !localMuted;
    });
  }, [localMuted]);

  return { phase, error, participants, localMuted, setLocalMuted };
}
