import React from 'react';
import {
  Crown,
  ExternalLink,
  Globe,
  MessageSquare,
  MoreHorizontal,
  Phone,
  Radio,
  StickyNote,
  UserPlus,
  Volume2,
  X,
} from 'lucide-react';
import { NickLabel } from './nickAppearance';
import { resolveMediaUrl } from './resolveMediaUrl';

export type ProfileWorkspaceRole = {
  id: string;
  name: string;
  color: string;
  bg: string;
  border: string;
  glow: string;
  icon: React.ElementType;
};

export type ProfileCardUser = {
  id: string;
  name: string;
  nick?: string;
  roleId: string;
  roleIds?: string[];
  status: 'online' | 'idle' | 'dnd' | 'offline';
  avatarUrl?: string;
  nickColor?: string;
  nickGlow?: string;
  bannerUrl?: string;
  bio?: string;
};

type Props = {
  user: ProfileCardUser;
  workspaceRoles: ProfileWorkspaceRole[];
  serverName: string;
  voiceActivity: { channelId: string; channelName: string; serverName: string } | null;
  apiBase: string;
  publicOrigin: string;
  originLabel: string;
  note: string;
  onNoteChange: (v: string) => void;
  onSaveNote: (text: string) => void;
  onClose: () => void;
  onDm: () => void;
  onVoiceCall: () => void;
  onOpenVoiceChannel: () => void;
  onCopyOrigin: () => void;
  friendRelation?: 'add' | 'pending' | 'incoming' | 'friend';
  incomingFriendRequestId?: string;
  onAddFriend?: () => void;
  onAcceptFriendRequest?: (requestId: string) => void;
  onRejectFriendRequest?: (requestId: string) => void;
};

const VISIBLE_ROLES = 4;

export function MemberProfileCard({
  user: pc,
  workspaceRoles,
  serverName,
  voiceActivity,
  apiBase,
  publicOrigin,
  originLabel,
  note,
  onNoteChange,
  onSaveNote,
  onClose,
  onDm,
  onVoiceCall,
  onOpenVoiceChannel,
  onCopyOrigin,
  friendRelation,
  incomingFriendRequestId,
  onAddFriend,
  onAcceptFriendRequest,
  onRejectFriendRequest,
}: Props) {
  const avatarAbs = resolveMediaUrl(apiBase, pc.avatarUrl);
  const bannerAbs = resolveMediaUrl(apiBase, pc.bannerUrl);
  const handle = (pc.nick?.trim() || pc.name || '').replace(/\s+/g, '_').toLowerCase() || `u${pc.id.slice(-6)}`;

  const statusDot =
    pc.status === 'online'
      ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]'
      : pc.status === 'idle'
        ? 'bg-amber-400'
        : pc.status === 'dnd'
          ? 'bg-red-500'
          : 'bg-zinc-600';

  const roleIdsOrdered = pc.roleIds?.length ? pc.roleIds : pc.roleId ? [pc.roleId] : [];
  const roleObjs = roleIdsOrdered
    .map((id) => workspaceRoles.find((r) => r.id === id))
    .filter(Boolean) as ProfileWorkspaceRole[];
  const extraRoleCount = Math.max(0, roleObjs.length - VISIBLE_ROLES);
  const visibleRoles = roleObjs.slice(0, VISIBLE_ROLES);

  return (
    <div
      className="fixed inset-0 z-[460] flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[400px] max-h-[92vh] overflow-y-auto custom-scrollbar rounded-xl border border-[#1f2023] bg-[#111214] shadow-[0_24px_80px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="member-profile-title"
      >
        <div className="relative h-[120px] overflow-hidden rounded-t-xl bg-[#1e1f22]">
          {bannerAbs ? (
            <img src={bannerAbs} alt="" className="absolute inset-0 h-full w-full object-cover" />
          ) : avatarAbs ? (
            <div
              className="absolute inset-0 scale-125 opacity-40"
              style={{
                backgroundImage: `url(${avatarAbs})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(28px)',
              }}
            />
          ) : null}
          <div className="absolute inset-0 bg-gradient-to-t from-[#111214] via-[#111214]/55 to-transparent" />
          <button
            type="button"
            aria-label="Zamknij"
            onClick={onClose}
            className="absolute top-2.5 right-2.5 z-10 rounded-lg p-1.5 text-white/80 hover:bg-black/40 hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="relative px-4 pb-4 -mt-12">
          <div className="flex items-end gap-3">
            <div className="relative shrink-0">
              <div className="h-[92px] w-[92px] overflow-hidden rounded-full border-[4px] border-[#111214] bg-[#1e1f22] shadow-lg ring-1 ring-black/50">
                {avatarAbs ? (
                  <img src={avatarAbs} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl font-black text-zinc-300">
                    {pc.name.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <div
                className={`absolute bottom-1 right-1 z-10 h-[18px] w-[18px] rounded-full border-[3px] border-[#111214] ${statusDot}`}
                title={pc.status}
              />
            </div>
            <div className="min-w-0 flex-1 pb-1">
              <button
                type="button"
                onClick={onCopyOrigin}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.08] bg-black/50 px-2.5 py-1 text-[11px] text-zinc-400 hover:border-[#00eeff]/30 hover:text-zinc-200"
              >
                <Globe size={12} className="shrink-0 text-[#00eeff]/80" />
                <span className="truncate font-medium">{originLabel}</span>
              </button>
            </div>
          </div>

          <h2 id="member-profile-title" className="mt-3 min-w-0">
            <NickLabel user={pc} fallbackColor="#f4f4f5" className="block text-xl font-bold leading-tight tracking-tight sm:text-2xl" />
          </h2>
          <p className="mt-1.5 text-[13px] text-zinc-500">
            <span className="font-medium text-zinc-400">{handle}</span>
            <span className="mx-1.5 text-zinc-700">·</span>
            <span>{serverName}</span>
          </p>

          {pc.bio?.trim() ? (
            <p className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-400">{pc.bio}</p>
          ) : (
            <p className="mt-3 text-[13px] leading-relaxed text-zinc-500">
              Brak opisu profilu. Dane z API (bio, baner) można dodać w ustawieniach konta.
            </p>
          )}

          {friendRelation === 'friend' ? (
            <p className="mt-4 text-center text-xs font-semibold text-emerald-400/90">Znajomy</p>
          ) : friendRelation === 'pending' ? (
            <p className="mt-4 text-center text-xs text-zinc-500">Zaproszenie wysłane — oczekuje na akceptację</p>
          ) : friendRelation === 'incoming' && incomingFriendRequestId && onAcceptFriendRequest && onRejectFriendRequest ? (
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => onAcceptFriendRequest(incomingFriendRequestId)}
                className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-[#00eeff] py-2.5 text-sm font-bold text-black shadow-[0_0_16px_rgba(0,238,255,0.2)] hover:brightness-110"
              >
                Akceptuj znajomość
              </button>
              <button
                type="button"
                onClick={() => onRejectFriendRequest(incomingFriendRequestId)}
                className="flex min-w-0 flex-1 items-center justify-center rounded-lg border border-white/[0.12] bg-[#2b2d31] py-2.5 text-sm font-semibold text-zinc-300 hover:bg-[#35373c]"
              >
                Odrzuć
              </button>
            </div>
          ) : friendRelation === 'add' && onAddFriend ? (
            <button
              type="button"
              onClick={onAddFriend}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg border border-white/[0.1] bg-[#2b2d31] py-2.5 text-sm font-semibold text-zinc-200 hover:border-[#00eeff]/25 hover:text-[#00eeff]"
            >
              <UserPlus size={18} className="shrink-0" />
              Dodaj do znajomych
            </button>
          ) : null}

          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={onDm}
              className="flex min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-[#00eeff] py-2.5 text-sm font-bold text-black shadow-[0_0_20px_rgba(0,238,255,0.2)] hover:brightness-110"
            >
              <MessageSquare size={18} className="shrink-0" />
              Wiadomość
            </button>
            <button
              type="button"
              title="Połączenie głosowe"
              onClick={onVoiceCall}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[#2b2d31] text-zinc-200 hover:border-[#00eeff]/25 hover:text-[#00eeff]"
            >
              <Phone size={18} />
            </button>
            <button
              type="button"
              title="Więcej"
              onClick={onDm}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/[0.1] bg-[#2b2d31] text-zinc-200 hover:bg-[#35373c]"
            >
              <MoreHorizontal size={18} />
            </button>
          </div>

          {voiceActivity ? (
            <div className="mt-5 rounded-lg border border-white/[0.06] bg-[#1e1f22] p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-500">Na kanale głosowym</span>
                <Radio size={14} className="shrink-0 text-zinc-600" />
              </div>
              <div className="flex items-start gap-2.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-black/40">
                  {avatarAbs ? (
                    <img src={avatarAbs} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-zinc-500">{pc.name.charAt(0)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1 text-[13px] font-semibold text-zinc-200">
                    <Volume2 size={14} className="text-zinc-500" />
                    <Crown size={14} className="text-amber-400/90" />
                    <span className="truncate">{voiceActivity.channelName}</span>
                  </p>
                  <p className="mt-0.5 truncate text-[11px] text-zinc-500">w {voiceActivity.serverName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={onOpenVoiceChannel}
                className="mt-3 w-full rounded-md bg-[#2b2d31] py-2 text-center text-[13px] font-semibold text-zinc-200 hover:bg-[#35373c]"
              >
                Otwórz kanał głosowy
              </button>
            </div>
          ) : null}

          {visibleRoles.length > 0 && (
            <div className="mt-5">
              <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-zinc-600">Role — {serverName}</p>
              <div className="flex flex-wrap gap-1.5">
                {visibleRoles.map((r) => (
                  <span
                    key={r.id}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold"
                    style={{
                      backgroundColor: r.bg,
                      borderColor: r.border,
                      color: r.color,
                      boxShadow: r.glow !== 'none' ? `0 0 10px ${r.color}22` : undefined,
                    }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                    <r.icon size={10} className="shrink-0 opacity-90" />
                    <span className="truncate">{r.name}</span>
                  </span>
                ))}
                {extraRoleCount > 0 && (
                  <span className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[11px] font-bold text-zinc-500">
                    +{extraRoleCount}
                  </span>
                )}
              </div>
            </div>
          )}

          <div className="mt-6 border-t border-white/[0.06] pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-600">
              <StickyNote size={12} />
              Notka (tylko u Ciebie)
            </p>
            <textarea
              value={note}
              onChange={(e) => onNoteChange(e.target.value)}
              onBlur={(e) => onSaveNote(e.target.value)}
              placeholder="Kliknij, aby dodać notkę…"
              rows={3}
              className="custom-scrollbar min-h-[76px] w-full resize-y rounded-xl border border-white/[0.08] bg-black/35 px-3 py-2.5 text-[13px] text-zinc-200 placeholder:text-zinc-600 outline-none focus:border-[#00eeff]/35"
            />
          </div>

          {publicOrigin ? (
            <a
              href={publicOrigin}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#00eeff]/90 hover:underline"
            >
              <ExternalLink size={12} />
              Otwórz w przeglądarce
            </a>
          ) : null}
        </div>
      </div>
    </div>
  );
}
