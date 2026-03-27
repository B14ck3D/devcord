import React from 'react';
import { X } from 'lucide-react';
import type { SettingsTab } from '../../store/settingsStore';

type SettingsOverlayProps = {
  open: boolean;
  activeTab: SettingsTab;
  onTabChange: (tab: SettingsTab) => void;
  onClose: () => void;
  success?: string;
  error?: string;
  children: React.ReactNode;
};

const tabs: Array<{ id: SettingsTab; label: string; section: string }> = [
  { id: 'profile', label: 'Mój Profil', section: 'Ustawienia Użytkownika' },
  { id: 'appearance', label: 'Wygląd', section: 'Ustawienia Użytkownika' },
  { id: 'privacy', label: 'Prywatność i Konto', section: 'Ustawienia Użytkownika' },
  { id: 'audio', label: 'Głos i Wideo', section: 'Ustawienia Użytkownika' },
  { id: 'video', label: 'Stream Wideo', section: 'Ustawienia Użytkownika' },
];

export function SettingsOverlay({
  open,
  activeTab,
  onTabChange,
  onClose,
  success,
  error,
  children,
}: SettingsOverlayProps) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[500] bg-black/60 backdrop-blur-md flex justify-center items-center p-4 sm:p-8 devcord-animate-scrim"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="bg-[#1e1f22] border border-white/5 rounded-3xl w-full max-w-5xl relative flex flex-col sm:flex-row gap-2 sm:gap-6 h-full max-h-[85vh] shadow-[0_20px_60px_rgba(0,0,0,0.5)] overflow-hidden devcord-animate-modal-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="settings-title"
      >
        <div className="flex flex-row sm:flex-col gap-1 w-full sm:w-56 bg-[#111214] sm:bg-transparent sm:border-r border-white/5 p-4 sm:pr-6 sm:py-8 shrink-0 overflow-x-auto sm:overflow-y-auto">
          <h2 id="settings-title" className="text-[11px] font-bold text-zinc-500 uppercase tracking-widest mb-2 px-3 hidden sm:block">
            Ustawienia Użytkownika
          </h2>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold text-left transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-[#2b2d31] text-white shadow-sm'
                  : 'text-zinc-400 hover:bg-[#2b2d31]/50 hover:text-zinc-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 sm:p-8 sm:pl-2 relative">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 sm:top-6 sm:right-6 text-zinc-400 hover:text-white bg-black/20 hover:bg-white/10 p-2 rounded-full transition-all border border-white/5"
          >
            <X size={20} />
          </button>
          {success ? (
            <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl text-sm flex items-center gap-2 font-medium animate-in slide-in-from-top-4">
              {success}
            </div>
          ) : null}
          {error ? (
            <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-sm flex items-center gap-2 font-medium animate-in slide-in-from-top-4">
              {error}
            </div>
          ) : null}
          {children}
        </div>
      </div>
    </div>
  );
}
