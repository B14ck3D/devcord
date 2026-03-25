import { useCallback, useEffect, useRef, useState } from 'react';
import { createMicNoiseGate } from './micNoiseGate';

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
  cameraStream?: MediaStream | null;
  /** Max bitrate for screen track output in bits per second */
  screenBitrate?: number;
  /** Bramka progu w Web Audio — wycina to, co jest poniżej progu dBFS */
  micSoftwareGate?: boolean;
  /** Im wyższa wartość (bliżej 0 dBFS), tym głośniejszy sygnał musi być, żeby przejść (ostrzejsze cięcie szumu) */
  micGateThresholdDb?: number;
}) {
  const {
    enabled,
    roomId,
    userId,
    micDeviceId,
    screenStream = null,
    cameraStream = null,
    screenBitrate,
    micSoftwareGate = false,
    micGateThresholdDb = -40,
  } = opts;
  const [phase, setPhase] = useState<VoicePhase>('idle');
  const [error, setError] = useState<string | null>(null);
  const [participants, setParticipants] = useState<string[]>([]);
  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);
  const [speakingPeers, setSpeakingPeers] = useState<Record<string, boolean>>({});
  const [remoteScreenByUser, setRemoteScreenByUser] = useState<Record<string, MediaStream>>({});
  const [remoteVoiceState, setRemoteVoiceState] = useState<Record<string, { muted: boolean; deafened: boolean }>>({});

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const micRawStreamRef = useRef<MediaStream | null>(null);
  const micGateDisposeRef = useRef<(() => void) | null>(null);
  const micGateThresholdRef = useRef(micGateThresholdDb);
  micGateThresholdRef.current = micGateThresholdDb;
  const pcsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const iceQueuesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const remoteAudioCombinedRef = useRef<Map<string, MediaStream>>(new Map());
  const audioElsRef = useRef(new Map<string, HTMLAudioElement>());
  /** GainNode: przy >100% to „boost” — element audio w przeglądarce i tak ma max. głośność 1. */
  const remoteAudioGraphRef = useRef(
    new Map<string, { ctx: AudioContext; gain: GainNode; src: MediaElementAudioSourceNode }>(),
  );
  const remoteVadStopRef = useRef(new Map<string, () => void>());
  const remoteVolRef = useRef(new Map<string, number>());
  const remoteMuteRef = useRef(new Map<string, boolean>());
  const remoteScreenTracksRef = useRef<Record<string, MediaStream>>({});
  const screenStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const prevScreenTrackIdsRef = useRef<Set<string>>(new Set());
  const prevCameraTrackIdsRef = useRef<Set<string>>(new Set());
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const localMutedRef = useRef(localMuted);
  localMutedRef.current = localMuted;
  const localDeafenedRef = useRef(localDeafened);
  localDeafenedRef.current = localDeafened;

  const speakingSnapRef = useRef<Record<string, boolean>>({});
  const localVadStopRef = useRef<(() => void) | null>(null);
  const flushSpeaking = useCallback((id: string, speaking: boolean) => {
    if (speakingSnapRef.current[id] === speaking) return;
    speakingSnapRef.current[id] = speaking;
    setSpeakingPeers((prev) => ({ ...prev, [id]: speaking }));
  }, []);

  const sendSignal = useCallback((obj: unknown) => {
    const ws = wsRef.current;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj));
  }, []);

  const disposeRemotePlayback = useCallback((peerId: string) => {
    remoteVadStopRef.current.get(peerId)?.();
    remoteVadStopRef.current.delete(peerId);
    const graph = remoteAudioGraphRef.current.get(peerId);
    if (graph) {
      try {
        graph.src.disconnect();
        graph.gain.disconnect();
        void graph.ctx.close();
      } catch {
        /* ignore */
      }
      remoteAudioGraphRef.current.delete(peerId);
    }
    const el = audioElsRef.current.get(peerId);
    if (el) {
      el.srcObject = null;
      el.remove();
      audioElsRef.current.delete(peerId);
    }
  }, []);

  const syncRemoteAudioElement = useCallback(
    (peerId: string) => {
      const combined = remoteAudioCombinedRef.current.get(peerId);
      if (!combined?.getAudioTracks().length) {
        disposeRemotePlayback(peerId);
        return;
      }
      disposeRemotePlayback(peerId);
      const el = document.createElement('audio');
      el.autoplay = true;
      el.setAttribute('playsinline', '');
      el.srcObject = combined;
      el.volume = 1;
      el.muted = localDeafenedRef.current || !!remoteMuteRef.current.get(peerId);
      document.body.appendChild(el);
      audioElsRef.current.set(peerId, el);
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AC();
      void ctx.resume().catch(() => {});
      const source = ctx.createMediaElementSource(el);
      const gainNode = ctx.createGain();
      const g = remoteVolRef.current.get(peerId) ?? 1;
      gainNode.gain.value = Math.min(4, Math.max(0, g));
      source.connect(gainNode).connect(ctx.destination);
      remoteAudioGraphRef.current.set(peerId, { ctx, gain: gainNode, src: source });
      void el.play().catch(() => {});
      const stopVad = createSpeakingLevelMonitor(
        combined,
        peerId,
        () => localDeafenedRef.current || !!remoteMuteRef.current.get(peerId),
        flushSpeaking,
      );
      remoteVadStopRef.current.set(peerId, stopVad);
    },
    [disposeRemotePlayback, flushSpeaking],
  );

  const applyAllRemoteAudioOutputs = useCallback(() => {
    for (const peerId of audioElsRef.current.keys()) {
      const el = audioElsRef.current.get(peerId);
      if (!el) continue;
      const graph = remoteAudioGraphRef.current.get(peerId);
      const g = remoteVolRef.current.get(peerId) ?? 1;
      if (graph) {
        graph.gain.gain.value = Math.min(4, Math.max(0, g));
      } else {
        el.volume = Math.min(1, Math.max(0, g));
      }
      el.muted = localDeafenedRef.current || !!remoteMuteRef.current.get(peerId);
    }
  }, []);

  const setUserVolume = useCallback((peerId: string, linearGain: number) => {
    remoteVolRef.current.set(peerId, linearGain);
    const g = Math.min(4, Math.max(0, linearGain));
    const graph = remoteAudioGraphRef.current.get(peerId);
    if (graph) {
      graph.gain.gain.value = g;
    } else {
      const el = audioElsRef.current.get(peerId);
      if (el) {
        el.volume = Math.min(1, g);
      }
    }
    const el = audioElsRef.current.get(peerId);
    if (el) {
      el.muted = localDeafenedRef.current || !!remoteMuteRef.current.get(peerId);
    }
  }, []);

  const setUserOutputMuted = useCallback((peerId: string, muted: boolean) => {
    remoteMuteRef.current.set(peerId, muted);
    const el = audioElsRef.current.get(peerId);
    if (el) {
      el.muted = localDeafenedRef.current || muted;
      const g = remoteVolRef.current.get(peerId) ?? 1;
      const graph = remoteAudioGraphRef.current.get(peerId);
      if (graph) {
        graph.gain.gain.value = Math.min(4, Math.max(0, g));
      } else {
        el.volume = Math.min(1, Math.max(0, g));
      }
    }
  }, []);

  screenStreamRef.current = screenStream;
  cameraStreamRef.current = cameraStream;

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

  const syncAuxMediaTracks = useCallback(async () => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const screen = screenStreamRef.current;
    const camera = cameraStreamRef.current;
    const newScreenIds = new Set((screen?.getTracks() ?? []).map((t) => t.id));
    const newCamIds = new Set((camera?.getTracks() ?? []).map((t) => t.id));
    const oldAll = new Set([...prevScreenTrackIdsRef.current, ...prevCameraTrackIdsRef.current]);
    const newAll = new Set([...newScreenIds, ...newCamIds]);

    for (const [peerId, pc] of pcsRef.current) {
      let changed = false;
      for (const sender of [...pc.getSenders()]) {
        const tr = sender.track;
        if (tr && oldAll.has(tr.id) && !newAll.has(tr.id)) {
          pc.removeTrack(sender);
          changed = true;
        }
      }
      const addTracks = (stream: MediaStream | null, isScreen: boolean) => {
        if (!stream) return;
        const existing = new Set(
          pc.getSenders().map((s) => s.track?.id).filter(Boolean) as string[],
        );
        for (const t of stream.getTracks()) {
          if (!existing.has(t.id)) {
            const sender = pc.addTrack(t, stream);
            if (isScreen && t.kind === 'video' && screenBitrate) {
              const params = sender.getParameters();
              if (!params.encodings) params.encodings = [{}];
              params.encodings[0].maxBitrate = screenBitrate;
              sender.setParameters(params).catch(() => {});
            }
            changed = true;
          }
        }
      };
      addTracks(screen, true);
      addTracks(camera, false);
      if (!changed) continue;
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
    prevScreenTrackIdsRef.current = newScreenIds;
    prevCameraTrackIdsRef.current = newCamIds;
  }, [sendSignal, screenBitrate]);

  const cleanupAll = useCallback(() => {
    localVadStopRef.current?.();
    localVadStopRef.current = null;
    speakingSnapRef.current = {};
    setSpeakingPeers({});

    iceQueuesRef.current.clear();
    for (const [, pc] of pcsRef.current) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.close();
    }
    pcsRef.current.clear();
    for (const pid of [...audioElsRef.current.keys()]) disposeRemotePlayback(pid);
    remoteVadStopRef.current.clear();
    remoteAudioCombinedRef.current.clear();
    remoteScreenTracksRef.current = {};
    prevScreenTrackIdsRef.current.clear();
    prevCameraTrackIdsRef.current.clear();
    setRemoteScreenByUser({});
    micGateDisposeRef.current?.();
    micGateDisposeRef.current = null;
    micRawStreamRef.current?.getTracks().forEach((t) => t.stop());
    micRawStreamRef.current = null;
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
  }, [disposeRemotePlayback]);

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
            ? {
                deviceId: { exact: micDeviceId },
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: false,
              }
            : {
                echoCancellation: true,
                noiseSuppression: false,
                autoGainControl: false,
              };
        const rawStream = await md.getUserMedia({
          audio: audioConstraints,
          video: false,
        });
        if (cancelled) {
          rawStream.getTracks().forEach((t) => t.stop());
          return;
        }
        micRawStreamRef.current = rawStream;

        let sendStream: MediaStream = rawStream;
        if (micSoftwareGate) {
          const gate = createMicNoiseGate(rawStream, {
            getOpenThresholdDb: () => micGateThresholdRef.current,
            getHardMuted: () => localMutedRef.current,
            hysteresisDb: 6,
          });
          sendStream = gate.stream;
          micGateDisposeRef.current = gate.dispose;
        } else {
          micGateDisposeRef.current = null;
        }
        streamRef.current = sendStream;

        localVadStopRef.current?.();
        localVadStopRef.current = createSpeakingLevelMonitor(
          sendStream,
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

        const attachAuxMediaIfAny = (pc: RTCPeerConnection) => {
          const add = (stream: MediaStream | null, isScreen: boolean) => {
            if (!stream) return;
            const existing = new Set(
              pc.getSenders().map((s) => s.track?.id).filter(Boolean) as string[],
            );
            for (const t of stream.getTracks()) {
              if (!existing.has(t.id)) {
                const sender = pc.addTrack(t, stream);
                if (isScreen && t.kind === 'video' && screenBitrate) {
                  const params = sender.getParameters();
                  if (!params.encodings) params.encodings = [{}];
                  params.encodings[0].maxBitrate = screenBitrate;
                  sender.setParameters(params).catch(() => {});
                }
              }
            }
          };
          add(screenStreamRef.current, true);
          add(cameraStreamRef.current, false);
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
              let ms = remoteScreenTracksRef.current[peerId];
              if (!ms) ms = new MediaStream();
              if (!ms.getTracks().some((t) => t.id === ev.track.id)) {
                ms.addTrack(ev.track);
              }
              remoteScreenTracksRef.current[peerId] = ms;
              const combined = remoteAudioCombinedRef.current.get(peerId);
              if (combined) {
                for (const t of [...combined.getAudioTracks()]) {
                  if (ms.getAudioTracks().some((s) => s.id === t.id)) {
                    combined.removeTrack(t);
                  }
                }
                syncRemoteAudioElement(peerId);
              }
              setRemoteScreenByUser((prev) => ({ ...prev, [peerId]: ms }));
              ev.track.addEventListener('ended', () => {
                const curMs = remoteScreenTracksRef.current[peerId];
                try {
                  curMs?.removeTrack(ev.track);
                } catch {
                  /* ignore */
                }
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
            syncRemoteAudioElement(peerId);

            ev.track.addEventListener('ended', () => {
              try {
                combined?.removeTrack(ev.track);
              } catch {
                /* ignore */
              }
              syncRemoteAudioElement(peerId);
            });
          };
          const s = streamRef.current;
          if (s) s.getTracks().forEach((t) => pc!.addTrack(t, s));
          attachAuxMediaIfAny(pc);
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
            sendSignal({
              type: 'voice_state',
              payload: { user_id: userIdRef.current, muted: localMutedRef.current, deafened: localDeafenedRef.current }
            });
            return;
          }

          if (env.type === 'user_joined') {
            const uid = pl.user_id as string;
            if (uid && uid !== userIdRef.current) {
              setParticipants((prev) => [...new Set([...prev, uid])].sort());
            }
            return;
          }

          if (env.type === 'voice_state') {
            const uid = pl.user_id as string;
            if (uid) {
              setRemoteVoiceState((prev) => ({
                ...prev,
                [uid]: { muted: !!pl.muted, deafened: !!pl.deafened }
              }));
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
            disposeRemotePlayback(uid);
            remoteAudioCombinedRef.current.delete(uid);
            delete remoteScreenTracksRef.current[uid];
            setRemoteScreenByUser((prev) => {
              const n = { ...prev };
              delete n[uid];
              return n;
            });
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
            const polite = userIdRef.current < from;
            if (pc.signalingState === 'have-local-offer') {
              if (!polite) {
                return;
              }
              try {
                await pc.setLocalDescription({ type: 'rollback' });
              } catch {
                return;
              }
            }
            try {
              await pc.setRemoteDescription({ type: typ, sdp });
            } catch {
              return;
            }
            await flushIce(from);
            try {
              const answer = await pc.createAnswer();
              await pc.setLocalDescription(answer);
              sendSignal({
                type: 'answer',
                payload: { target_user_id: from, sdp: answer.sdp, type: answer.type },
              });
            } catch {
              /* ignore */
            }
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
            if (pc.signalingState !== 'have-local-offer') {
              return;
            }
            try {
              await pc.setRemoteDescription({ type: typ, sdp });
            } catch {
              return;
            }
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
  }, [
    enabled,
    roomId,
    userId,
    micDeviceId,
    micSoftwareGate,
    cleanupAll,
    flushIce,
    sendSignal,
    flushSpeaking,
    syncRemoteAudioElement,
  ]);

  useEffect(() => {
    if (!enabled || !roomId) return;
    const id = window.setTimeout(() => void syncAuxMediaTracks(), 30);
    return () => clearTimeout(id);
  }, [screenStream, cameraStream, screenBitrate, enabled, roomId, phase, syncAuxMediaTracks]);

  useEffect(() => {
    applyAllRemoteAudioOutputs();
  }, [localDeafened, applyAllRemoteAudioOutputs]);

  /** Tryb głuchy = brak odsłuchu innych; mikrofon musi być wyłączony (jak w typowych komunikatorach). */
  useEffect(() => {
    if (localDeafened && !localMuted) setLocalMuted(true);
  }, [localDeafened, localMuted]);

  useEffect(() => {
    streamRef.current?.getAudioTracks().forEach((t) => {
      t.enabled = !localMuted;
    });
    if (wsRef.current?.readyState === WebSocket.OPEN && phase === 'connected') {
      wsRef.current.send(JSON.stringify({
        type: 'voice_state',
        payload: { user_id: userId, muted: localMuted, deafened: localDeafened }
      }));
    }
  }, [localMuted, localDeafened, phase, userId]);

  return {
    phase,
    error,
    participants,
    localMuted,
    setLocalMuted,
    localDeafened,
    setLocalDeafened,
    speakingPeers,
    remoteScreenByUser,
    remoteVoiceState,
    setUserVolume,
    setUserOutputMuted,
  };
}
