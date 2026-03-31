import { useCallback, useRef, useState } from 'react';
import { ConnectionState, Room, Track } from 'livekit-client';

import type { ScreenPublishStats } from './voiceTypes';

type VoiceDiagnostics = {
  backend: 'livekit';
  connectionState: string;
  participantCount: number;
};

export function useVoiceParticipants(opts: {
  applyRemoteVolumes: (room: Room) => void;
}) {
  const { applyRemoteVolumes } = opts;

  const [participants, setParticipants] = useState<string[]>([]);
  const [remoteScreenByUser, setRemoteScreenByUser] = useState<Record<string, MediaStream>>({});
  const [remoteVoiceState, setRemoteVoiceState] = useState<Record<string, { muted: boolean; deafened: boolean }>>({});
  const [voiceDiagnostics, setVoiceDiagnostics] = useState<VoiceDiagnostics>({
    backend: 'livekit',
    connectionState: 'disconnected',
    participantCount: 0,
  });
  const [screenPublishStats, setScreenPublishStats] = useState<ScreenPublishStats>({
    captureFps: null,
    sendBitrateKbps: null,
    packetsLost: null,
  });

  const uiSyncTimerRef = useRef<number | null>(null);
  const uiSyncNeedsScreensRef = useRef(false);

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

  const scheduleRoomUiSync = useCallback(
    (room: Room, includeScreens = false) => {
      if (includeScreens) uiSyncNeedsScreensRef.current = true;
      if (uiSyncTimerRef.current !== null) return;
      uiSyncTimerRef.current = window.setTimeout(() => {
        uiSyncTimerRef.current = null;
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

  const clearUiSyncTimer = useCallback(() => {
    if (uiSyncTimerRef.current !== null) {
      clearTimeout(uiSyncTimerRef.current);
      uiSyncTimerRef.current = null;
    }
    uiSyncNeedsScreensRef.current = false;
  }, []);

  const resetParticipantState = useCallback(() => {
    setParticipants([]);
    setRemoteScreenByUser({});
    setRemoteVoiceState({});
    setVoiceDiagnostics((d) => ({
      ...d,
      connectionState: 'disconnected',
      participantCount: 0,
    }));
    setScreenPublishStats({ captureFps: null, sendBitrateKbps: null, packetsLost: null });
  }, []);

  return {
    participants,
    remoteScreenByUser,
    remoteVoiceState,
    voiceDiagnostics,
    setVoiceDiagnostics,
    screenPublishStats,
    setScreenPublishStats,
    syncParticipantList,
    refreshRemoteScreens,
    applyRemoteMuteUi,
    scheduleRoomUiSync,
    clearUiSyncTimer,
    resetParticipantState,
  };
}
