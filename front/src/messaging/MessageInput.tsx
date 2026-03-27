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
      className="flex-shrink-0 px-4 md:px-6 pb-6 pt-2 flex flex-col gap-2 w-full max-w-[100vw]"
    >
      {/* Reply banner */}
      {replyTo && (
        <div
          className="flex items-center justify-between px-4 py-2 rounded-t-2xl text-xs bg-[#2b2d31] text-zinc-400 border border-b-0 border-white/5 mx-2"
        >
          <span>
            Odpowiadasz <strong className="text-white font-medium">{replyTo.name}</strong>
            {' — '}
            <span className="truncate max-w-[200px] inline-block align-bottom">{replyTo.content}</span>
          </span>
          <button type="button" onClick={onCancelReply} className="p-1 rounded-full hover:bg-white/10 transition-colors text-zinc-300">
            <X size={14} />
          </button>
        </div>
      )}

      {/* AI prompt bar */}
      {isAIPromptOpen && (
        <div
          className="flex items-center gap-3 px-4 py-3 rounded-2xl text-sm animate-in slide-in-from-bottom-2 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 border border-indigo-500/20 text-white shadow-lg mx-2 mb-2"
        >
          <Sparkles size={16} className="text-indigo-400 flex-shrink-0 animate-pulse" />
          <span className="font-medium">Devcord AI Ready</span>
          <button type="button" onClick={onCloseAI} className="ml-auto p-1.5 rounded-full hover:bg-white/10 transition-colors">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Main composer box */}
      <div
        className={`relative flex items-end gap-3 rounded-2xl px-4 py-2.5 bg-[#383a40] shadow-sm transition-all border border-transparent focus-within:border-white/10 ${replyTo ? 'rounded-t-none mx-2' : ''}`}
      >
        {/* Attach */}
        <button
          type="button"
          onClick={onAttach}
          className="flex-shrink-0 p-2 rounded-full transition-all hover:bg-[#4e5058] text-zinc-400 hover:text-zinc-200"
          title="Załącz plik"
        >
          <Plus size={22} />
        </button>

        {/* Textarea */}
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
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
          className="flex-1 resize-none bg-transparent outline-none border-none text-[15px] py-2 min-h-[40px] overflow-y-auto custom-scrollbar text-[#dbdee1] placeholder-zinc-500"
          style={{
            fontFamily: 'inherit',
            maxHeight: 200,
          }}
        />

        {/* Right actions */}
        <div className="flex items-center gap-1 flex-shrink-0 mb-0.5">
          {/* Emoji picker */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowPicker((v) => !v)}
              className="p-2 rounded-full transition-all hover:bg-[#4e5058] text-zinc-400 hover:text-zinc-200"
              title="Emoji"
            >
              <Smile size={22} />
            </button>
            {showPicker && (
              <div
                className="absolute bottom-12 right-0 z-50 shadow-2xl animate-in zoom-in-95 bg-[#2b2d31] p-1 rounded-2xl border border-white/5"
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
              className={`p-2 rounded-full transition-all hover:bg-[#4e5058] ${isAIPromptOpen ? 'text-indigo-400 bg-indigo-500/10' : 'text-zinc-400 hover:text-zinc-200'}`}
              title="AI prompt"
            >
              <Sparkles size={20} />
            </button>
          )}

          {/* Attach (right side alias) */}
          {!onAttach && (
            <button
              type="button"
              className="p-2 rounded-full transition-all hover:bg-[#4e5058] text-zinc-400 hover:text-zinc-200"
              title="Załącz plik"
            >
              <Paperclip size={20} />
            </button>
          )}

          {/* Send */}
          {inputValue.trim() && (
            <button
              type="button"
              onClick={onSend}
              disabled={disabled}
              className="ml-2 p-2 rounded-full transition-all disabled:opacity-40 bg-[#5865F2] hover:bg-[#4752c4] text-white shadow-md active:scale-95"
              title="Wyślij"
            >
              <Send size={18} className="translate-x-[1px] -translate-y-[1px]" />
            </button>
          )}
        </div>
      </div>

      {/* Zen mode hint */}
      {isZenMode && (
        <p className="text-[11px] font-medium text-center text-zinc-500 mt-1">
          Tryb zen aktywny — wciśnij Esc aby wyjść
        </p>
      )}
    </div>
  );
}
