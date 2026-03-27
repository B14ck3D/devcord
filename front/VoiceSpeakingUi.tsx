import React, { memo } from 'react';
import { Headphones, MicOff, Monitor, Video } from 'lucide-react';
import { NickLabel, type NickAppearanceFields } from './nickAppearance';

/** VAD indicator - isolated to avoid full-list re-renders */
export const VoiceSpeakingDot = memo(function VoiceSpeakingDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      aria-hidden
      className="shrink-0"
      style={{ color: 'var(--md-sys-color-primary)' }}
    >
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
});

type SidebarRowUser = NickAppearanceFields & { id?: string; avatarUrl?: string };

/** Row in the channel's voice participant preview list */
export const VoiceSidebarParticipantRow = memo(function VoiceSidebarParticipantRow({
  user,
  isMe,
  voicePhaseConnected,
  sidebarVoiceVad,
  isSpeaking,
  onContextMenu,
}: {
  user: SidebarRowUser;
  isMe: boolean;
  voicePhaseConnected: boolean;
  sidebarVoiceVad: boolean;
  isSpeaking: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
}) {
  const speakingStyle: React.CSSProperties = isSpeaking && sidebarVoiceVad
    ? { outline: '2px solid var(--md-sys-color-primary)', outlineOffset: 1, borderRadius: '50%' }
    : {};

  return (
    <div
      onContextMenu={onContextMenu}
      className="flex items-center gap-[var(--gap-md)] p-[var(--gap-sm)] rounded-md3-md cursor-pointer transition-colors"
      style={{
        color: isSpeaking && sidebarVoiceVad
          ? 'var(--md-sys-color-on-surface)'
          : 'var(--md-sys-color-on-surface-variant)',
      }}
      title={sidebarVoiceVad ? (isSpeaking ? 'Mówi' : 'Cisza') : undefined}
    >
      {/* Avatar with speaking ring */}
      <div className="relative shrink-0" style={speakingStyle}>
        {user.avatarUrl?.trim() ? (
          <img
            src={user.avatarUrl}
            alt=""
            className="w-6 h-6 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold"
            style={{
              background: 'var(--md-sys-color-secondary-container)',
              color: 'var(--md-sys-color-on-secondary-container)',
            }}
          >
            {(user.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
        {(isMe || voicePhaseConnected) && (
          <div
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
            style={{
              background: 'var(--color-status-online)',
              borderColor: 'var(--md-sys-color-surface-container-low)',
            }}
          />
        )}
      </div>

      {/* Name */}
      <span className="flex items-center gap-[var(--gap-sm)] min-w-0 flex-1 overflow-hidden">
        {sidebarVoiceVad && <VoiceSpeakingDot active={isSpeaking} />}
        <NickLabel
          user={user}
          fallbackColor={isMe ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)'}
          className="truncate text-xs font-medium"
        />
      </span>
    </div>
  );
});

type StageUser = NickAppearanceFields & { avatarUrl?: string };

/** Full-size participant tile in the voice call grid (Stoat VoiceCallCard / UserTile style) */
export const VoiceStageParticipantTile = memo(function VoiceStageParticipantTile({
  user,
  isSelf,
  isSpeaking,
  isScreenSharing,
  muted,
  deafened,
  statusLine,
  voicePhase,
  voiceHasScreenActivity,
  onContextMenu,
  onToggleDeafen,
}: {
  user: StageUser;
  isSelf: boolean;
  isSpeaking: boolean;
  isScreenSharing: boolean;
  muted: boolean;
  deafened: boolean;
  statusLine: string;
  voicePhase: string;
  voiceHasScreenActivity: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onToggleDeafen: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      onContextMenu={onContextMenu}
      className="group relative flex flex-col rounded-md3-lg overflow-hidden cursor-pointer"
      style={{
        background: 'rgba(0,0,0,0.15)',
        aspectRatio: '16/9',
        outline: isSpeaking ? '3px solid var(--md-sys-color-primary)' : '1px solid transparent',
        outlineOffset: 0,
        transition: 'outline 0.1s ease',
        minWidth: 180,
      }}
    >
      {/* Main content — avatar centered */}
      <div className="flex-1 flex items-center justify-center">
        {user.avatarUrl?.trim() ? (
          <img
            src={user.avatarUrl}
            alt={user.name ?? ''}
            className="w-12 h-12 rounded-full object-cover"
          />
        ) : (
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold"
            style={{
              background: 'var(--md-sys-color-secondary-container)',
              color: 'var(--md-sys-color-on-secondary-container)',
            }}
          >
            {(user.name ?? '?').charAt(0).toUpperCase()}
          </div>
        )}
      </div>

      {/* Bottom overlay bar */}
      <div
        className="absolute bottom-0 left-0 right-0 flex items-center justify-between px-[var(--gap-md)] py-[var(--gap-sm)]"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
          paddingBottom: 8,
          paddingTop: 20,
        }}
      >
        {/* Name + speaking indicator */}
        <div className="flex items-center gap-[var(--gap-sm)] min-w-0 flex-1 overflow-hidden">
          {isSpeaking && (
            <svg width="12" height="12" viewBox="0 0 8 8" style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }}>
              <circle cx="4" cy="4" r="4" fill="currentColor" />
            </svg>
          )}
          <NickLabel
            user={user}
            fallbackColor="#fff"
            className="text-xs font-medium truncate text-white"
          />
        </div>

        {/* Icons */}
        <div className="flex items-center gap-[var(--gap-xs)] shrink-0">
          {isScreenSharing && <Monitor size={12} style={{ color: 'var(--md-sys-color-primary)' }} />}
          {muted && <MicOff size={12} style={{ color: 'var(--md-sys-color-error)' }} />}
          {deafened && <Headphones size={12} style={{ color: 'var(--md-sys-color-error)' }} />}
        </div>

        {/* Deafen toggle (self only, hover) */}
        {isSelf && (
          <button
            type="button"
            onClick={onToggleDeafen}
            disabled={voicePhase !== 'connected'}
            title={deafened ? 'Włącz odsłuch' : 'Wycisz odsłuch'}
            className="ml-[var(--gap-sm)] w-7 h-7 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity disabled:opacity-40"
            style={{
              background: deafened
                ? 'var(--md-sys-color-error-container)'
                : 'var(--md-sys-color-surface-container)',
              color: deafened
                ? 'var(--md-sys-color-on-error-container)'
                : 'var(--md-sys-color-on-surface-variant)',
            }}
          >
            <Headphones size={14} />
          </button>
        )}
      </div>

      {/* Screen share badge */}
      {isScreenSharing && (
        <div
          className="absolute top-[var(--gap-sm)] right-[var(--gap-sm)] rounded-md3-xs px-1.5 py-0.5 flex items-center gap-1 text-[10px] font-medium"
          style={{
            background: 'var(--md-sys-color-primary-container)',
            color: 'var(--md-sys-color-on-primary-container)',
          }}
        >
          <Monitor size={10} />
          Ekran
        </div>
      )}
    </div>
  );
});

/** Compact voice card for "in channel" bottom-of-sidebar display */
export const VoiceCallCardStatus = memo(function VoiceCallCardStatus({
  phase,
}: {
  phase: string;
}) {
  const isConnected = phase === 'connected';
  return (
    <div
      className="flex items-center gap-[var(--gap-sm)] text-xs font-medium"
      style={{ color: isConnected ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)' }}
    >
      <div
        className="w-2 h-2 rounded-full"
        style={{ background: isConnected ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline)' }}
      />
      {isConnected ? 'Połączono' : phase === 'connecting_signaling' ? 'Łączenie...' : phase === 'negotiating' ? 'Negocjacja...' : 'Rozłączono'}
    </div>
  );
});
