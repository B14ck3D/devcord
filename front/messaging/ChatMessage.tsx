import React, { useState } from 'react';
import { Edit2, MessageSquareShare, MoreHorizontal, Smile, Trash2 } from 'lucide-react';
import { NickLabel } from '../nickAppearance';
import type { ChatRow } from '../store/chatStore';

export type ChatMessageUser = {
  id: string;
  name: string;
  nickColor?: string;
  nickGlow?: string;
  avatarUrl?: string;
  roleId?: string;
};

export type ChatMessageProps = {
  msg: ChatRow;
  tail: boolean;
  user?: ChatMessageUser;
  isMe?: boolean;
  isAI?: boolean;
  role?: { name?: string; color?: string } | null;
  avatarSrc?: string;
  activeThreadId?: string | null;
  renderContent: (content: string, msgId: string) => React.ReactNode;
  onDelete?: (id: string) => void;
  onEdit?: (id: string, content: string) => void;
  onReply?: (msg: ChatRow) => void;
  onOpenProfile?: (userId: string) => void;
  onReaction?: (msgId: string, emoji: string) => void;
  onContextMenuMessage?: (e: React.MouseEvent) => void;
  onContextMenuUser?: (e: React.MouseEvent) => void;
  onCreateTask?: () => void;
  onOpenThread?: () => void;
  editingId?: string | null;
  editValue?: string;
  onEditChange?: (v: string) => void;
  onEditSubmit?: () => void;
  onEditCancel?: () => void;
};

export function ChatMessage({
  msg,
  tail,
  user,
  isMe,
  isAI,
  avatarSrc,
  activeThreadId,
  renderContent,
  onDelete,
  onEdit,
  onReply,
  onOpenProfile,
  onContextMenuMessage,
  onContextMenuUser,
  onCreateTask,
  onOpenThread,
  editingId,
  editValue,
  onEditChange,
  onEditSubmit,
  onEditCancel,
}: ChatMessageProps) {
  const [showToolbar, setShowToolbar] = useState(false);
  const isEditing = editingId === msg.id;
  const isActiveThread = activeThreadId === msg.id;

  return (
    <div
      id={`msg-${msg.id}`}
      className={`msg-row relative flex flex-col ${tail ? '' : 'mt-[var(--message-group-spacing)]'} py-0.5 rounded-[var(--borderRadius-md)] transition-colors duration-100 ${
        isActiveThread ? 'bg-primary-container/30' : 'hover:bg-surf-ch'
      } ${msg.isOptimistic ? 'opacity-70' : ''}`}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
    >
      {/* Toolbar */}
      {showToolbar && !isEditing && (
        <div className="msg-toolbar flex" style={{ display: 'flex' }}>
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(msg)}
              className="p-[var(--gap-sm)] cursor-pointer hover:bg-white/10 transition-colors"
              title="Odpowiedz"
            >
              <MessageSquareShare size={16} />
            </button>
          )}
          <button
            type="button"
            className="p-[var(--gap-sm)] cursor-pointer hover:bg-white/10 transition-colors"
            title="Reakcja"
          >
            <Smile size={16} />
          </button>
          {isMe && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(msg.id, msg.content)}
              className="p-[var(--gap-sm)] cursor-pointer hover:bg-white/10 transition-colors"
              title="Edytuj"
            >
              <Edit2 size={16} />
            </button>
          )}
          {isMe && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className="p-[var(--gap-sm)] cursor-pointer hover:bg-error/20 text-error transition-colors"
              title="Usuń"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="button"
            className="p-[var(--gap-sm)] cursor-pointer hover:bg-white/10 transition-colors"
            title="Więcej"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}

      <div className="flex min-w-0">
        {/* Left info column: 54px */}
        <div
          className="flex-shrink-0 flex justify-end items-start py-0.5 px-[var(--gap-sm)]"
          style={{ width: 54 }}
        >
              {!tail ? (
            <button
              type="button"
              className="w-9 h-9 rounded-md3-md overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-primary/40 transition-all"
              onClick={() => { onOpenProfile?.(msg.userId); }}
              onContextMenu={onContextMenuUser}
              title={user?.name}
            >
              {(avatarSrc || user?.avatarUrl) ? (
                <img src={avatarSrc || user?.avatarUrl} alt={user?.name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-sm"
                  style={{
                    background: isAI ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-secondary-container)',
                    color: isAI ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-secondary-container)',
                  }}
                >
                  {(user?.name ?? msg.userId).charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <span
              className="text-[0.68em] opacity-0 group-hover:opacity-100 transition-opacity mt-[0.15em] text-right"
              style={{
                width: '7ch',
                color: 'var(--md-sys-color-outline)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {msg.time}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden pe-[var(--gap-lg)]">
          {!tail && (
            <div className="flex items-baseline gap-[var(--gap-md)] mb-[2px]">
              <button
                type="button"
                onClick={() => onOpenProfile?.(msg.userId)}
                className="font-semibold hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
              >
                <NickLabel
                  user={{ name: user?.name ?? msg.userId, nickColor: user?.nickColor, nickGlow: user?.nickGlow }}
                  fallbackColor="var(--md-sys-color-on-surface)"
                  className="text-[15px] font-semibold"
                />
              </button>
              <span
                className="text-[0.7em]"
                style={{ color: 'var(--md-sys-color-outline)', fontVariantNumeric: 'tabular-nums' }}
              >
                {msg.time}
              </span>
              {msg.isEdited && (
                <span className="text-[0.68em]" style={{ color: 'var(--md-sys-color-outline)' }}>
                  (edytowane)
                </span>
              )}
            </div>
          )}

          {/* Message content */}
          <div className="msg-content min-w-0 flex flex-col gap-[var(--gap-sm)]" style={{ fontSize: 'var(--message-size)' }}>
            {isEditing ? (
              <div className="flex flex-col gap-[var(--gap-sm)]">
                <textarea
                  autoFocus
                  className="w-full resize-none rounded-md3-sm px-3 py-2 text-sm outline-none"
                  style={{
                    background: 'var(--md-sys-color-surface-container)',
                    color: 'var(--md-sys-color-on-surface)',
                    border: '1px solid var(--md-sys-color-outline-variant)',
                    minHeight: 72,
                    fontFamily: 'inherit',
                    fontSize: 'var(--message-size)',
                  }}
                  value={editValue ?? msg.content}
                  onChange={(e) => onEditChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSubmit?.(); }
                    if (e.key === 'Escape') onEditCancel?.();
                  }}
                />
                <div className="flex gap-[var(--gap-sm)] text-xs" style={{ color: 'var(--md-sys-color-outline)' }}>
                  <span>Escape — </span>
                  <button type="button" onClick={onEditCancel} className="hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>anuluj</button>
                  <span>· Enter — </span>
                  <button type="button" onClick={onEditSubmit} className="hover:underline" style={{ color: 'var(--md-sys-color-primary)' }}>zapisz</button>
                </div>
              </div>
            ) : (
              renderContent(msg.content, msg.id)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
