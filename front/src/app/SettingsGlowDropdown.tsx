import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { NICK_GLOW_PRESETS, nickGlowLabelForValue as glowLabel } from './nickGlowPresets';

type Props = {
  value: string;
  onChange: (nextShadowValue: string) => void;
  disabled?: boolean;
};

export function SettingsGlowDropdown({ value, onChange, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const label = glowLabel(value);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 bg-[#151515] border border-white/[0.1] rounded-xl px-3 py-2.5 text-sm text-left text-white outline-none focus:border-[#00eeff]/40 transition-colors disabled:opacity-40"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate">{label}</span>
        <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul
          className="absolute z-50 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border border-white/[0.12] bg-[#0c0c0e] shadow-[0_20px_50px_rgba(0,0,0,0.85)] py-1"
          role="listbox"
        >
          {NICK_GLOW_PRESETS.map((p) => {
            const selected = value === p.value;
            return (
              <li key={p.id} role="option" aria-selected={selected}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(p.value);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    selected ? 'bg-[#00eeff]/15 text-[#00eeff]' : 'text-zinc-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {p.label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
