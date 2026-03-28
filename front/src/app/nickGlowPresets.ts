/** Wartości `nick_glow`: legacy = czysty CSS `text-shadow` / `none`, albo JSON `v:2` z efektami Nitro. */

export type NickGlowPreset = { id: string; label: string; value: string };

const LEGACY: NickGlowPreset[] = [
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

/** Presety Nitro (JSON w bazie — pełne kolory i czcionka w jednym polu). */
const NITRO: NickGlowPreset[] = [
  {
    id: 'v2_gradient_cyan_magenta',
    label: 'Nitro: gradient neon',
    value: '{"v":2,"fx":"gradient","g1":"#00eeff","g2":"#ff00aa","font":"\'Outfit\',system-ui,sans-serif"}',
  },
  {
    id: 'v2_gradient_neon',
    label: 'Nitro: gradient + puls poświaty',
    value:
      '{"v":2,"fx":"gradient_neon","g1":"#00ffcc","g2":"#ff006e","font":"\'Space Grotesk\',system-ui,sans-serif"}',
  },
  {
    id: 'v2_neon_pulse',
    label: 'Nitro: pulsujący neon',
    value: '{"v":2,"fx":"neon_pulse","g1":"#00eeff","g2":"#bf5fff","font":"\'Orbitron\',sans-serif"}',
  },
  {
    id: 'v2_shimmer',
    label: 'Nitro: shimmer (Discord-like)',
    value: '{"v":2,"fx":"shimmer","g1":"#67e8f9","g2":"#e879f9","font":"\'Outfit\',system-ui,sans-serif"}',
  },
  {
    id: 'v2_double',
    label: 'Nitro: podwójna obwódka świetlna',
    value: '{"v":2,"fx":"double_outline","g1":"#22d3ee","g2":"#f472b6","font":"\'Space Grotesk\',system-ui,sans-serif"}',
  },
];

export const NICK_GLOW_PRESETS: NickGlowPreset[] = [...NITRO, ...LEGACY];

export const NICK_FONT_STACKS: { id: string; label: string; stack: string }[] = [
  { id: 'default', label: 'Domyślna (UI)', stack: '' },
  { id: 'outfit', label: 'Outfit', stack: "'Outfit',system-ui,sans-serif" },
  { id: 'orbitron', label: 'Orbitron', stack: "'Orbitron',sans-serif" },
  { id: 'space', label: 'Space Grotesk', stack: "'Space Grotesk',system-ui,sans-serif" },
];

function parseV2Fx(value: string): string | null {
  try {
    const j = JSON.parse(value) as { v?: number; fx?: string };
    if (j && j.v === 2 && typeof j.fx === 'string') return j.fx;
  } catch {
    return null;
  }
  return null;
}

export function nickGlowLabelForValue(value: string): string {
  const hit = NICK_GLOW_PRESETS.find((p) => p.value === value);
  if (hit) return hit.label;
  const fx = parseV2Fx(value);
  if (fx) {
    const map: Record<string, string> = {
      gradient: 'Niestandardowy: gradient',
      gradient_neon: 'Niestandardowy: gradient + puls',
      neon_pulse: 'Niestandardowy: puls neon',
      shimmer: 'Niestandardowy: shimmer',
      double_outline: 'Niestandardowy: podwójna obwódka',
    };
    return map[fx] ?? 'Niestandardowy styl Nitro (JSON)';
  }
  if (!value || value === 'none') return 'Brak poświaty';
  return 'Własna poświata (tekst / serwer)';
}

/** Buduje JSON zapisywany w `nick_glow` z zakładki „studio” profilu. */
export function buildNickGlowJson(opts: {
  fx: 'gradient' | 'gradient_neon' | 'neon_pulse' | 'shimmer' | 'double_outline';
  g1: string;
  g2: string;
  fontStack: string;
}): string {
  return JSON.stringify({
    v: 2,
    fx: opts.fx,
    g1: opts.g1,
    g2: opts.g2,
    ...(opts.fontStack ? { font: opts.fontStack } : {}),
  });
}
