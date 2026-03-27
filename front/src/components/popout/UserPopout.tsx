import React from 'react';
import { MessageSquare, User as UserIcon } from 'lucide-react';
import { NickLabel } from '../../../nickAppearance';

type UserShape = {
  id: string;
  name: string;
  avatarUrl?: string;
  nickColor?: string;
  nickGlow?: string;
  status?: 'online' | 'idle' | 'dnd' | 'offline';
};

type UserPopoutProps = {
  user: UserShape;
  x: number;
  y: number;
  onClose: () => void;
  onOpenProfile: () => void;
  onOpenDm: () => void;
};

function statusColor(status?: UserShape['status']) {
  if (status === 'online') return 'var(--color-status-online)';
  if (status === 'idle') return 'var(--color-status-idle)';
  if (status === 'dnd') return 'var(--md-sys-color-error)';
  return 'var(--md-sys-color-outline)';
}

export function UserPopout({ user, x, y, onClose, onOpenProfile, onOpenDm }: UserPopoutProps) {
  const top = Math.min(y, window.innerHeight - 220);
  const left = Math.min(x, window.innerWidth - 300);
  return (
    <div className="fixed inset-0 z-[420]" onClick={onClose} role="presentation">
      <div
        className="fixed w-[280px] rounded-2xl border border-white/[0.1] bg-[#0c0c0e]/95 backdrop-blur-xl p-3 shadow-[0_24px_72px_rgba(0,0,0,0.75)] devcord-animate-modal-panel"
        style={{ top, left }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 rounded-xl p-2 bg-white/[0.02] border border-white/[0.06]">
          {user.avatarUrl?.trim() ? (
            <img src={user.avatarUrl} alt="" className="w-11 h-11 rounded-xl object-cover" />
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)' }}
            >
              {user.name.charAt(0)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <NickLabel
              user={user}
              fallbackColor="var(--md-sys-color-on-surface)"
              className="text-sm font-semibold truncate"
            />
            <div className="mt-1 flex items-center gap-1.5">
              <span className="inline-block w-2 h-2 rounded-full" style={{ background: statusColor(user.status) }} />
              <span className="text-[11px]" style={{ color: 'var(--md-sys-color-on-surface-variant)' }}>
                {user.status === 'online' ? 'Online' : user.status === 'idle' ? 'Zaraz wracam' : user.status === 'dnd' ? 'Nie przeszkadzać' : 'Offline'}
              </span>
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onOpenProfile}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold border border-white/[0.1] text-zinc-200 hover:bg-white/[0.06] transition-colors"
          >
            <UserIcon size={14} /> Profil
          </button>
          <button
            type="button"
            onClick={onOpenDm}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold bg-[#00eeff] text-black hover:brightness-110 transition-[filter]"
          >
            <MessageSquare size={14} /> DM
          </button>
        </div>
      </div>
    </div>
  );
}
