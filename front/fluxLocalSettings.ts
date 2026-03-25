/**
 * Lokalna „kopia JSON” ustawień (localStorage) — docelowo zastąpi je API / baza.
 * Klucz pliku: flux_local_settings.json
 */

export const FLUX_LOCAL_SETTINGS_KEY = 'flux_local_settings.json';

export type FluxLocalSettings = {
  version: 1;
  audio: {
    micDeviceId: string;
    micSoftwareGate: boolean;
    micGateThresholdDb: number;
  };
  screen: {
    fps: number;
    res: number;
  };
  /** Wzmocnienie głosu użytkownika (0.25–4+, liniowo; 1 = 100%) */
  userVoiceGain: Record<string, number>;
  /** Lokalne wyciszenie odsłuchu danego użytkownika (nie wpływa na jego mikrofon) */
  userOutputMuted: Record<string, boolean>;
  /** Motyw interfejsu (tylko klient) */
  appearance: {
    theme: 'dark' | 'light';
  };
};

function clampUserVoiceGainRecord(raw: Record<string, number> | undefined): Record<string, number> {
  if (!raw || typeof raw !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : 1;
    out[k] = Math.min(4, Math.max(0.25, n));
  }
  return out;
}

const defaultSettings = (): FluxLocalSettings => ({
  version: 1,
  audio: {
    micDeviceId: '',
    micSoftwareGate: false,
    micGateThresholdDb: -40,
  },
  screen: { fps: 60, res: 1080 },
  userVoiceGain: {},
  userOutputMuted: {},
  appearance: { theme: 'dark' },
});

function migrateLegacy(): Partial<FluxLocalSettings> {
  const partial: Partial<FluxLocalSettings> = {};
  try {
    const fps = localStorage.getItem('devcord_screen_fps');
    const res = localStorage.getItem('devcord_screen_res');
    if (fps) partial.screen = { ...defaultSettings().screen, fps: parseInt(fps, 10) };
    if (res)
      partial.screen = {
        ...(partial.screen ?? defaultSettings().screen),
        res: parseInt(res, 10),
      };
    const vols = localStorage.getItem('devcord_user_volumes');
    if (vols) {
      const o = JSON.parse(vols) as Record<string, number>;
      partial.userVoiceGain = clampUserVoiceGainRecord(o);
    }
    const mic = localStorage.getItem('flux_mic_device');
    if (mic) {
      partial.audio = { ...defaultSettings().audio, micDeviceId: mic };
    }
  } catch {
    /* ignore */
  }
  return partial;
}

export function loadFluxLocalSettings(): FluxLocalSettings {
  try {
    const raw = localStorage.getItem(FLUX_LOCAL_SETTINGS_KEY);
    if (raw) {
      const j = JSON.parse(raw) as Partial<FluxLocalSettings>;
      if (j && j.version === 1) {
        return {
          ...defaultSettings(),
          ...j,
          audio: { ...defaultSettings().audio, ...j.audio },
          screen: { ...defaultSettings().screen, ...j.screen },
          userVoiceGain: clampUserVoiceGainRecord(j.userVoiceGain),
          userOutputMuted: { ...(j.userOutputMuted ?? {}) },
          appearance: {
            theme: j.appearance?.theme === 'light' ? 'light' : 'dark',
          },
        };
      }
    }
  } catch {
    /* ignore */
  }
  const base = defaultSettings();
  const leg = migrateLegacy();
  return {
    ...base,
    ...leg,
    audio: { ...base.audio, ...leg.audio },
    screen: { ...base.screen, ...leg.screen },
    userVoiceGain: clampUserVoiceGainRecord({ ...base.userVoiceGain, ...leg.userVoiceGain }),
    userOutputMuted: { ...base.userOutputMuted, ...leg.userOutputMuted },
    appearance: { ...base.appearance, ...leg.appearance },
  };
}

export function saveFluxLocalSettings(next: FluxLocalSettings): void {
  try {
    localStorage.setItem(FLUX_LOCAL_SETTINGS_KEY, JSON.stringify(next, null, 2));
  } catch {
    /* ignore */
  }
}

export function patchFluxLocalSettings(patch: Partial<FluxLocalSettings>): FluxLocalSettings {
  const cur = loadFluxLocalSettings();
  const merged: FluxLocalSettings = {
    ...cur,
    ...patch,
    audio: { ...cur.audio, ...patch.audio },
    screen: { ...cur.screen, ...patch.screen },
    userVoiceGain: patch.userVoiceGain ?? cur.userVoiceGain,
    userOutputMuted: patch.userOutputMuted ?? cur.userOutputMuted,
    appearance: { ...cur.appearance, ...patch.appearance },
  };
  saveFluxLocalSettings(merged);
  return merged;
}
