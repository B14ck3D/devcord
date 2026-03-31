import { useEffect, useMemo, useState } from 'react';
import { Monitor } from 'lucide-react';

type Props = {
  open: boolean;
  includeSystemAudio: boolean;
  onIncludeSystemAudioChange: (value: boolean) => void;
  onClose: () => void;
  onPickSource: (sourceId: string, includeSystemAudio: boolean) => void;
  captureError?: string | null;
};

export function ScreensharePickerModal(props: Props) {
  const {
    open,
    includeSystemAudio,
    onIncludeSystemAudioChange,
    onClose,
    onPickSource,
    captureError = null,
  } = props;

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sources, setSources] = useState<DevcordDesktopSourceInfo[]>([]);

  useEffect(() => {
    if (!open) return;
    const getDesktopSources =
      window.electronAPI?.getDesktopSources ??
      window.devcordDesktop?.getDesktopSources ??
      window.devcordDesktop?.listScreenSources;
    if (!getDesktopSources) {
      setError('Desktop capturer niedostępny.');
      setSources([]);
      setIsLoading(false);
      return;
    }
    let cancelled = false;
    setError(null);
    setIsLoading(true);
    setSources([]);
    void getDesktopSources()
      .then((result) => {
        if (cancelled) return;
        if (!Array.isArray(result) || result.length === 0) {
          setError('Brak dostępnych źródeł przechwytywania.');
          return;
        }
        setSources(result);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Nie udało się pobrać źródeł.');
      })
      .finally(() => {
        if (cancelled) return;
        setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  const screens = useMemo(() => sources.filter((src) => src.id.startsWith('screen:')), [sources]);
  const windows = useMemo(() => sources.filter((src) => !src.id.startsWith('screen:')), [sources]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[340] bg-black/70 backdrop-blur-sm flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl bg-[#0c0c0e] border border-white/[0.12] rounded-2xl p-5 max-h-[85vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white">Wybierz okno lub ekran do udostępnienia</h3>
          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-sm text-zinc-300 hover:text-white hover:bg-white/[0.08]"
          >
            Zamknij
          </button>
        </div>

        {error || captureError ? (
          <div className="mb-3 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-xs">
            {error ?? captureError}
          </div>
        ) : null}

        <label className="mb-3 inline-flex items-center gap-2 text-xs text-zinc-300 select-none">
          <input
            type="checkbox"
            checked={includeSystemAudio}
            onChange={(e) => onIncludeSystemAudioChange(e.target.checked)}
            className="accent-[#00eeff]"
          />
          Udostępnij dźwięk systemu
        </label>

        {isLoading ? (
          <div className="flex-1 min-h-[240px] flex items-center justify-center text-sm text-zinc-400">
            Ładowanie źródeł...
          </div>
        ) : (
          <div className="space-y-4 overflow-y-auto custom-scrollbar pr-1">
            <div>
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Ekrany</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {screens.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => onPickSource(src.id, includeSystemAudio)}
                    className="text-left border border-white/[0.1] hover:border-[#00eeff]/60 bg-black/30 hover:bg-[#00eeff]/10 rounded-xl p-2 transition-colors"
                  >
                    <div className="aspect-video rounded-lg overflow-hidden border border-white/[0.08] bg-black/50 flex items-center justify-center">
                      {src.thumbnailDataUrl ? (
                        <img src={src.thumbnailDataUrl} alt={src.name} className="w-full h-full object-cover" />
                      ) : (
                        <Monitor size={22} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-zinc-200 truncate">{src.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{src.id}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h4 className="mb-2 text-[11px] uppercase tracking-[0.15em] text-zinc-400 font-semibold">Aplikacje</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {windows.map((src) => (
                  <button
                    key={src.id}
                    type="button"
                    onClick={() => onPickSource(src.id, includeSystemAudio)}
                    className="text-left border border-white/[0.1] hover:border-[#00eeff]/60 bg-black/30 hover:bg-[#00eeff]/10 rounded-xl p-2 transition-colors"
                  >
                    <div className="aspect-video rounded-lg overflow-hidden border border-white/[0.08] bg-black/50 flex items-center justify-center">
                      {src.thumbnailDataUrl ? (
                        <img src={src.thumbnailDataUrl} alt={src.name} className="w-full h-full object-cover" />
                      ) : (
                        <Monitor size={22} className="text-zinc-500" />
                      )}
                    </div>
                    <div className="mt-2 text-xs font-semibold text-zinc-200 truncate">{src.name}</div>
                    <div className="text-[10px] text-zinc-500 truncate">{src.id}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
