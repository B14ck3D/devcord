import React, { useCallback, useRef, useState } from 'react';
import Picker from '@emoji-mart/react';
import data from '@emoji-mart/data';
import { Paperclip, Plus, Send, Smile, Sparkles, X } from 'lucide-react';

export type MessageInputProps = {
  inputValue: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  onAttach?: () => void;
  isAIPromptOpen?: boolean;
  onOpenAI?: () => void;
  onCloseAI?: () => void;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  isZenMode?: boolean;
  replyTo?: { name: string; content: string } | null;
  onCancelReply?: () => void;
  pickerTheme?: 'light' | 'dark' | 'auto';
};

export function MessageInput({
  inputValue,
  onChange,
  onSend,
  onKeyDown,
  placeholder = 'Napisz wiadomość...',
  disabled,
  onAttach,
  isAIPromptOpen,
  onOpenAI,
  onCloseAI,
  textareaRef,
  isZenMode,
  replyTo,
  onCancelReply,
  pickerTheme = 'dark',
}: MessageInputProps) {
  const [showPicker, setShowPicker] = useState(false);
  const ownRef = useRef<HTMLTextAreaElement | null>(null);
  const ref = textareaRef ?? ownRef;

  const insertEmoji = useCallback(
    (emoji: { native?: string; unified?: string }) => {
      const char = emoji.native ?? (emoji.unified ? String.fromCodePoint(parseInt(emoji.unified, 16)) : '');
      if (!char) return;
      onChange(inputValue + char);
      setShowPicker(false);
      setTimeout(() => ref.current?.focus(), 0);
    },
    [inputValue, onChange, ref],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
      return;
    }
    onKeyDown?.(e);
  };

  return (
    <div
      className="flex-shrink-0 px-[var(--gap-lg)] pb-[var(--gap-lg)] pt-0 flex flex-col gap-[var(--gap-sm)]"
    >
      {/* Reply banner */}
      {replyTo && (
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-t-md3-md text-xs"
          style={{
            background: 'var(--md-sys-color-surface-container)',
            color: 'var(--md-sys-color-on-surface-variant)',
          }}
        >
          <span>
            Odpowiadasz <strong style={{ color: 'var(--md-sys-color-on-surface)' }}>{replyTo.name}</strong>
            {' — '}
            <span className="truncate max-w-[200px] inline-block align-bottom">{replyTo.content}</span>
          </span>
          <button type="button" onClick={onCancelReply} className="ml-2 p-0.5 rounded hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* AI prompt bar */}
      {isAIPromptOpen && (
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-md3-md text-sm animate-slide-up"
          style={{
            background: 'var(--md-sys-color-surface-container)',
            color: 'var(--md-sys-color-on-surface)',
            border: '1px solid var(--md-sys-color-outline-variant)',
          }}
        >
          <Sparkles size={14} style={{ color: 'var(--md-sys-color-primary)', flexShrink: 0 }} />
          <span style={{ color: 'var(--md-sys-color-outline)', fontSize: 12 }}>Prompt AI</span>
          <button type="button" onClick={onCloseAI} className="ml-auto p-0.5 rounded hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main composer box */}
      <div
        className={`relative flex items-end gap-[var(--gap-sm)] rounded-md3-xl px-[var(--gap-md)] py-[var(--gap-sm)] ${replyTo ? 'rounded-t-none' : ''}`}
        style={{
          background: 'var(--md-sys-color-surface-container-high)',
          maxHeight: 'var(--layout-height-message-box)',
        }}
      >
        {/* Attach */}
        <button
          type="button"
          onClick={onAttach}
          className="flex-shrink-0 p-1.5 rounded-md3-full transition-colors hover:bg-white/10"
          style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
          title="Załącz plik"
        >
          <Plus size={20} />
        </button>

        {/* Textarea */}
        <textarea
          ref={ref}
          rows={1}
          disabled={disabled}
          value={inputValue}
          onChange={(e) => {
            onChange(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="flex-1 resize-none bg-transparent outline-none border-none text-sm py-1.5 min-h-[36px] overflow-y-auto"
          style={{
            color: 'var(--md-sys-color-on-surface)',
            caretColor: 'var(--md-sys-color-primary)',
            fontFamily: 'inherit',
            fontSize: 'var(--message-size)',
            maxHeight: 200,
          }}
        />

        {/* Right actions */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Emoji picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="p-1.5 rounded-md3-full transition-colors hover:bg-white/10"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              title="Emoji"
            >
              <Smile size={20} />
            </button>
            {showPicker && (
              <div
                className="absolute bottom-10 right-0 z-50 shadow-md3 animate-slide-up"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Picker
                  data={data}
                  theme={pickerTheme}
                  onEmojiSelect={insertEmoji}
                  locale="pl"
                />
              </div>
            )}
          </div>

          {/* AI toggle */}
          {onOpenAI && (
            <button
              type="button"
              onClick={isAIPromptOpen ? onCloseAI : onOpenAI}
              className="p-1.5 rounded-md3-full transition-colors hover:bg-white/10"
              style={{ color: isAIPromptOpen ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-on-surface-variant)' }}
              title="AI prompt"
            >
              <Sparkles size={18} />
            </button>
          )}

          {/* Attach (right side alias) */}
          {!onAttach && (
            <button
              type="button"
              className="p-1.5 rounded-md3-full transition-colors hover:bg-white/10"
              style={{ color: 'var(--md-sys-color-on-surface-variant)' }}
              title="Załącz plik"
            >
              <Paperclip size={18} />
            </button>
          )}

          {/* Send */}
          {inputValue.trim() && (
            <button
              type="button"
              onClick={onSend}
              disabled={disabled}
              className="ml-1 p-1.5 rounded-md3-full transition-colors disabled:opacity-40"
              style={{
                background: 'var(--md-sys-color-primary-container)',
                color: 'var(--md-sys-color-on-primary-container)',
              }}
              title="Wyślij"
            >
              <Send size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Zen mode hint */}
      {isZenMode && (
        <p className="text-[11px] text-center" style={{ color: 'var(--md-sys-color-outline)' }}>
          Tryb zen — wciśnij Esc aby wyjść
        </p>
      )}
    </div>
  );
}
