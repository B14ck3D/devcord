/** Wartości `nick_glow` / text-shadow — użytkownik wybiera tylko etykietę w UI. */

export type NickGlowPreset = { id: string; label: string; value: string };

export const NICK_GLOW_PRESETS: NickGlowPreset[] = [
  { id: 'none', label: 'Brak poświaty', value: 'none' },
  { id: 'soft_cyan', label: 'Cyan — delikatna', value: '0 0 14px rgba(0,238,255,0.45)' },
  { id: 'strong_cyan', label: 'Cyan — intensywna', value: '0 0 22px rgba(0,238,255,0.7)' },
  { id: 'mint', label: 'Miętowa', value: '0 0 16px rgba(0,255,204,0.55)' },
  { id: 'purple', label: 'Fioletowa', value: '0 0 16px rgba(178,102,255,0.6)' },
  { id: 'rose', label: 'Różowa', value: '0 0 16px rgba(251,113,133,0.55)' },
  { id: 'gold', label: 'Złota', value: '0 0 14px rgba(250,204,21,0.5)' },
  { id: 'ember', label: 'Bursztynowa', value: '0 0 16px rgba(251,146,60,0.55)' },
  { id: 'white', label: 'Biała poświata', value: '0 0 12px rgba(255,255,255,0.45)' },
];

export function nickGlowLabelForValue(value: string): string {
  const hit = NICK_GLOW_PRESETS.find((p) => p.value === value);
  if (hit) return hit.label;
  if (!value || value === 'none') return 'Brak poświaty';
  return 'Niestandardowa (z serwera)';
}
