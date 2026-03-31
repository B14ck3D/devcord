import { useCallback, useEffect, useRef, useState } from 'react';
import { Room } from 'livekit-client';

import { resolveApiBaseUrl } from '../config/apiBase';
import { useVoiceConnection } from './voice/useVoiceConnection';
import { VOICE_PEER_GAIN_MAX, VOICE_PEER_GAIN_MIN } from './voice/voiceConstants';
import { useVoiceControls } from './voice/useVoiceControls';
import { useVoiceParticipants } from './voice/useVoiceParticipants';
import { useVoiceTracks } from './voice/useVoiceTracks';
import type { ScreenPublishStats } from './voice/voiceTypes';
import type { VoicePhase } from './voicePhase';

const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL as string | undefined);
const VOICE_LOG = '[devcord-voice]';
const VOICE_DEBUG_LOGS = import.meta.env.DEV;

function logVoice(level: 'debug' | 'warn' | 'info', ...args: unknown[]) {
  if (typeof console === 'undefined') return;
  if (!VOICE_DEBUG_LOGS && (level === 'debug' || level === 'info')) return;
  const fn = console[level] ?? console.log;
  fn.call(console, VOICE_LOG, ...args);
}

export { VOICE_PEER_GAIN_MAX, VOICE_PEER_GAIN_MIN };
export type { ScreenPublishStats };

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
  const roomRef = useRef<Room | null>(null);
  const logDebug = useCallback((message: string, detail?: unknown) => {
    logVoice('debug', message, detail);
  }, []);
  const logInfo = useCallback((message: string, detail?: unknown) => {
    logVoice('info', message, detail);
  }, []);
  const logWarn = useCallback((message: string, detail?: unknown) => {
    logVoice('warn', message, detail);
  }, []);

  const controls = useVoiceControls({ roomRef });
  const participantsState = useVoiceParticipants({
    applyRemoteVolumes: controls.applyRemoteVolumes,
  });
  const tracks = useVoiceTracks({
    roomRef,
    phase,
    localMuted: controls.localMuted,
    screenStream,
    cameraStream,
    screenBitrate,
    screenPreferredCodec,
    setScreenPublishStats: participantsState.setScreenPublishStats,
    logDebug,
    logWarn,
    userIdNorm: String(userId),
  });
  const { speakingPeers, flushSpeakingPeers } = useVoiceConnection({
    enabled,
    channelId,
    dmConversationId,
    accessToken,
    micDeviceId,
    rnnoiseEnabled,
    apiBase: API_BASE,
    setPhase,
    setError,
    roomRef,
    localMutedRef: controls.localMutedRef,
    setLocalMuted: controls.setLocalMuted,
    syncParticipantList: participantsState.syncParticipantList,
    refreshRemoteScreens: participantsState.refreshRemoteScreens,
    scheduleRoomUiSync: participantsState.scheduleRoomUiSync,
    setVoiceDiagnostics: participantsState.setVoiceDiagnostics,
    clearUiSyncTimer: participantsState.clearUiSyncTimer,
    resetParticipantState: participantsState.resetParticipantState,
    ensureRemoteAudioAttached: tracks.ensureRemoteAudioAttached,
    detachAndRemoveTrackElements: tracks.detachAndRemoveTrackElements,
    clearDetachedAudioElements: tracks.clearDetachedAudioElements,
    cleanupLocalMic: tracks.cleanupLocalMic,
    resetTrackState: tracks.resetTrackState,
    publishLocalMic: tracks.publishLocalMic,
    stopAllLocalPublications: tracks.stopAllLocalPublications,
    logDebug,
    logInfo,
    logWarn,
  });

  useEffect(() => {
    flushSpeakingPeers();
  }, [flushSpeakingPeers, controls.localMuted]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    void room.localParticipant
      .setAttributes({ deafened: controls.localDeafened ? 'true' : 'false' })
      .catch((e) => logVoice('warn', 'setAttributes(deafened) failed', e));
  }, [phase, controls.localDeafened]);

  useEffect(() => {
    const room = roomRef.current;
    if (!room || phase !== 'connected') return;
    controls.applyRemoteVolumes(room);
  }, [phase, controls.localDeafened, controls.applyRemoteVolumes]);

  const hasRoom =
    enabled && ((channelId ?? '').trim() !== '' || (dmConversationId ?? '').trim() !== '');

  return {
    phase,
    error,
    participants: participantsState.participants.length
      ? participantsState.participants
      : enabled && hasRoom
        ? [String(userId)]
        : [],
    localMuted: controls.localMuted,
    setLocalMuted: controls.setLocalMuted,
    localDeafened: controls.localDeafened,
    setLocalDeafened: controls.setLocalDeafened,
    speakingPeers,
    remoteScreenByUser: participantsState.remoteScreenByUser,
    remoteVoiceState: participantsState.remoteVoiceState,
    setUserVolume: controls.setUserVolume,
    setUserOutputMuted: controls.setUserOutputMuted,
    voiceDiagnostics: participantsState.voiceDiagnostics,
    screenPublishStats: participantsState.screenPublishStats,
  };
}
