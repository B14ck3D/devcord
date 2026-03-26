import React, { memo } from 'react';
import { Headphones, MicOff, Monitor } from 'lucide-react';
import { NickLabel, type NickAppearanceFields } from './nickAppearance';

/** Izolacja VAD: zmiana `isSpeaking` dla jednego uczestnika nie musi re-renderować całej listy. */
export const VoiceSpeakingDot = memo(function VoiceSpeakingDot({ active }: { active: boolean }) {
  if (!active) return null;
  return (
    <span className="w-1.5 h-1.5 rounded-full bg-[#00eeff] shadow-[0_0_6px_#00eeff] animate-pulse shrink-0" aria-hidden />
  );
});

type SidebarRowUser = NickAppearanceFields & { id?: string; avatarUrl?: string };

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
  return (
    <div
      onContextMenu={onContextMenu}
      title={sidebarVoiceVad ? (isSpeaking ? 'Mówi' : 'Cisza') : undefined}
      className="flex items-center gap-2 text-xs text-zinc-400 py-1 px-2 rounded-md hover:bg-white/[0.05] cursor-pointer transition-colors border border-transparent hover:border-white/[0.05] min-w-0"
    >
      <div className="relative shrink-0">
        {user.avatarUrl?.trim() ? (
          <img src={user.avatarUrl} alt="" className="w-5 h-5 rounded-md object-cover border border-white/[0.05]" />
        ) : (
          <div className="w-5 h-5 rounded-md bg-zinc-800 flex items-center justify-center text-[9px] font-bold text-white border border-white/[0.05]">
            {(user.name ?? '?').charAt(0)}
          </div>
        )}
        <div
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 border-2 rounded-full ${
            isMe && voicePhaseConnected ? 'bg-[#00eeff] border-[#080808]' : 'bg-emerald-500 border-[#080808]'
          }`}
        />
      </div>
      <span className={`truncate min-w-0 flex items-center gap-1.5 ${isMe ? 'text-[#00eeff] font-medium' : ''}`}>
        {sidebarVoiceVad ? <VoiceSpeakingDot active={isSpeaking} /> : null}
        <NickLabel user={user} fallbackColor={isMe ? '#00eeff' : '#a1a1aa'} className="truncate font-medium" />
      </span>
    </div>
  );
});

type StageUser = NickAppearanceFields & { avatarUrl?: string };

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
      className={`group flex items-center gap-4 p-2.5 pr-6 rounded-full bg-gradient-to-r from-black/90 to-[#0a0a0c] border backdrop-blur-xl transition-all duration-500 shadow-xl cursor-pointer ${
        isSpeaking ? 'border-[#00eeff]/50 shadow-[0_0_30px_rgba(0,238,255,0.15)] scale-105' : 'border-white/[0.05] hover:border-white/[0.15]'
      } ${voiceHasScreenActivity ? 'w-64' : 'w-72 sm:w-80'}`}
    >
      <div className="relative shrink-0">
        <div
          className={`absolute inset-0 rounded-full blur-md transition-all duration-500 ${
            isSpeaking ? 'bg-[#00eeff] opacity-50 animate-pulse' : 'opacity-0'
          }`}
        />
        <div
          className={`w-14 h-14 relative z-10 rounded-full flex items-center justify-center text-xl font-black transition-colors duration-500 overflow-hidden shrink-0 ${
            isSpeaking ? 'bg-[#000] border-2 border-[#00eeff] text-[#00eeff]' : 'bg-[#151515] border border-white/[0.1] text-zinc-400'
          }`}
        >
          {user.avatarUrl?.trim() ? (
            <img src={user.avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            (user.name ?? '?').charAt(0)
          )}
        </div>
        <div
          className={`absolute bottom-0 right-0 w-4 h-4 rounded-full border-2 border-[#050505] flex items-center justify-center z-20 ${
            muted || deafened ? 'bg-red-500' : 'bg-emerald-500'
          }`}
        >
          {deafened ? <Headphones size={8} className="text-black" /> : muted ? <MicOff size={8} className="text-black" /> : null}
        </div>
        {isScreenSharing && (
          <div
            className="absolute -top-0.5 -left-0.5 z-30 w-5 h-5 rounded-md bg-[#00eeff]/20 border border-[#00eeff]/50 flex items-center justify-center"
            title="Udostępnia ekran"
          >
            <Monitor size={10} className="text-[#00eeff]" />
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 min-w-0 justify-center">
        <span className={`text-[15px] font-bold truncate block transition-colors duration-300 ${isSpeaking ? 'drop-shadow-[0_0_8px_rgba(0,238,255,0.4)]' : ''}`}>
          <NickLabel user={user} fallbackColor={isSpeaking ? '#00eeff' : '#e4e4e7'} className="font-bold truncate" />
        </span>
        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold flex items-center gap-1 mt-0.5">
          {isScreenSharing ? (
            <>
              <Monitor size={10} className="text-[#00eeff]" /> Ekran ·{' '}
            </>
          ) : null}
          {statusLine}
        </span>
      </div>
      {isSelf ? (
        <button
          type="button"
          title={deafened ? 'Włącz odsłuch innych i mikrofon' : 'Wycisz mikrofon i przestań słyszeć innych u siebie'}
          onClick={onToggleDeafen}
          disabled={voicePhase !== 'connected'}
          className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center transition-colors border ${
            deafened ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-white/[0.05] text-zinc-200 border-white/[0.08] hover:bg-white/[0.1]'
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Headphones size={18} className={deafened ? 'opacity-50' : ''} />
        </button>
      ) : null}
      {isSpeaking ? (
        <div className="flex items-center gap-1 h-4 opacity-80 shrink-0">
          <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-2" style={{ animationDuration: '0.5s' }} />
          <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-4" style={{ animationDuration: '0.8s' }} />
          <div className="w-1 bg-[#00eeff] rounded-full animate-pulse h-3" style={{ animationDuration: '0.6s' }} />
        </div>
      ) : null}
    </div>
  );
});
