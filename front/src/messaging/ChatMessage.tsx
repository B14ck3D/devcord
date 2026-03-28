import React, { useState } from 'react';
import { Edit2, MessageSquareShare, MoreHorizontal, Smile, Trash2 } from 'lucide-react';
import { NickLabel } from '../app/nickAppearance';
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
      className={`group relative flex flex-col ${tail ? '' : 'mt-[1.125rem]'} py-1 px-4 md:px-6 transition-colors duration-200 ${
        isActiveThread ? 'bg-[#5865F2]/10 border-l-2 border-[#5865F2]' : 'hover:bg-[#2e3035]/60 border-l-2 border-transparent'
      } ${(msg as ChatRow & { isOptimistic?: boolean }).isOptimistic ? 'opacity-70' : ''}`}
      onMouseEnter={() => setShowToolbar(true)}
      onMouseLeave={() => setShowToolbar(false)}
      onContextMenu={onContextMenuMessage}
    >
      {/* Toolbar */}
      {showToolbar && !isEditing && (
        <div className="absolute right-4 -top-4 bg-[#2b2d31] border border-white/5 rounded-xl shadow-lg flex items-center overflow-hidden z-10 animate-in fade-in slide-in-from-bottom-1 duration-200">
          {onReply && (
            <button
              type="button"
              onClick={() => onReply(msg)}
              className="p-2 hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
              title="Odpowiedz"
            >
              <MessageSquareShare size={16} />
            </button>
          )}
          <button
            type="button"
            className="p-2 hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
            title="Reakcja"
          >
            <Smile size={16} />
          </button>
          {isMe && onEdit && (
            <button
              type="button"
              onClick={() => onEdit(msg.id, msg.content)}
              className="p-2 hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
              title="Edytuj"
            >
              <Edit2 size={16} />
            </button>
          )}
          {isMe && onDelete && (
            <button
              type="button"
              onClick={() => onDelete(msg.id)}
              className="p-2 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
              title="Usuń"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onContextMenuMessage}
            className="p-2 hover:bg-white/10 transition-colors text-zinc-400 hover:text-zinc-200"
            title="Więcej"
          >
            <MoreHorizontal size={16} />
          </button>
        </div>
      )}

      <div className="flex min-w-0">
        {/* Left info column: 54px */}
        <div className="flex-shrink-0 flex justify-end items-start py-0.5 pr-4" style={{ width: 56 }}>
              {!tail ? (
            <button
              type="button"
              className="w-10 h-10 rounded-full overflow-hidden flex-shrink-0 hover:ring-2 hover:ring-[#5865F2]/50 transition-all shadow-sm cursor-pointer"
              onClick={() => { onOpenProfile?.(msg.userId); }}
              onContextMenu={onContextMenuUser}
              title={user?.name}
            >
              {(avatarSrc || user?.avatarUrl) ? (
                <img src={avatarSrc || user?.avatarUrl} alt={user?.name ?? ''} className="w-full h-full object-cover" />
              ) : (
                <div
                  className="w-full h-full flex items-center justify-center font-bold text-base"
                  style={{
                    background: isAI ? '#5865F2' : '#313338',
                    color: '#ffffff',
                  }}
                >
                  {(user?.name ?? msg.userId).charAt(0).toUpperCase()}
                </div>
              )}
            </button>
          ) : (
            <span
              className="text-[0.65rem] opacity-0 group-hover:opacity-100 transition-opacity mt-1 text-right text-zinc-500 select-none"
              style={{
                width: '100%',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {msg.time}
            </span>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {!tail && (
            <div className="flex items-baseline gap-2 mb-1">
              <button
                type="button"
                onClick={() => onOpenProfile?.(msg.userId)}
                onContextMenu={onContextMenuUser}
                className="font-semibold hover:underline cursor-pointer bg-transparent border-none p-0 text-left"
              >
                <NickLabel
                  user={{ name: user?.name ?? msg.userId, nickColor: user?.nickColor, nickGlow: user?.nickGlow }}
                  fallbackColor="#f2f3f5"
                  className="text-[15px] font-semibold"
                />
              </button>
              {isAI ? <span className="bg-[#5865F2] text-white text-[10px] uppercase font-bold px-1.5 py-0.5 rounded shadow-sm">APP</span> : null}
              <span
                className="text-[0.75rem] text-zinc-500 font-medium select-none ml-1"
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {msg.time}
              </span>
              {msg.isEdited && (
                <span className="text-[0.7rem] text-zinc-500 select-none italic">
                  (edytowane)
                </span>
              )}
            </div>
          )}

          {/* Message content */}
          <div className="msg-content text-[15px] text-[#dbdee1] leading-[1.375rem] min-w-0 flex flex-col gap-1">
            {isEditing ? (
              <div className="flex flex-col gap-2 mt-1">
                <textarea
                  autoFocus
                  className="w-full resize-none rounded-xl px-4 py-3 text-sm outline-none custom-scrollbar bg-[#383a40] text-white border border-white/10 focus:border-[#5865F2]/50 shadow-inner"
                  style={{
                    minHeight: 80,
                    fontFamily: 'inherit',
                  }}
                  value={editValue ?? msg.content}
                  onChange={(e) => onEditChange?.(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEditSubmit?.(); }
                    if (e.key === 'Escape') onEditCancel?.();
                  }}
                />
                <div className="flex gap-2 text-xs text-zinc-400">
                  <span>Escape aby</span>
                  <button type="button" onClick={onEditCancel} className="text-[#00eeff] hover:underline font-medium">anulować</button>
                  <span>• Enter aby</span>
                  <button type="button" onClick={onEditSubmit} className="text-[#00eeff] hover:underline font-medium">zapisać</button>
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
