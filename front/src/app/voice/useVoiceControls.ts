import { useCallback, useEffect, useRef, useState, type MutableRefObject } from 'react';
import { Room, Track } from 'livekit-client';

import { VOICE_PEER_GAIN_MAX, VOICE_PEER_GAIN_MIN } from './voiceConstants';

export function useVoiceControls(opts: {
  roomRef: MutableRefObject<Room | null>;
}) {
  const { roomRef } = opts;

  const [localMuted, setLocalMuted] = useState(false);
  const [localDeafened, setLocalDeafened] = useState(false);

  const localDeafenedRef = useRef(localDeafened);
  localDeafenedRef.current = localDeafened;
  const localMutedRef = useRef(localMuted);
  localMutedRef.current = localMuted;

  const remoteVolRef = useRef(new Map<string, number>());
  const remoteOutMuteRef = useRef(new Map<string, boolean>());

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

  const setUserVolume = useCallback(
    (peerId: string, linearGain: number) => {
      remoteVolRef.current.set(peerId, linearGain);
      const room = roomRef.current;
      if (!room) return;
      applyRemoteVolumes(room);
    },
    [applyRemoteVolumes, roomRef],
  );

  const setUserOutputMuted = useCallback(
    (peerId: string, muted: boolean) => {
      remoteOutMuteRef.current.set(peerId, muted);
      const room = roomRef.current;
      if (!room) return;
      applyRemoteVolumes(room);
    },
    [applyRemoteVolumes, roomRef],
  );

  useEffect(() => {
    if (localDeafened && !localMuted) setLocalMuted(true);
  }, [localDeafened, localMuted]);

  return {
    localMuted,
    setLocalMuted,
    localDeafened,
    setLocalDeafened,
    localMutedRef,
    applyRemoteVolumes,
    setUserVolume,
    setUserOutputMuted,
  };
}
