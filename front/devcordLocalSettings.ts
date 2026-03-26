export const DEVCORD_LOCAL_SETTINGS_KEY = 'devcord_local_settings.json';
const LEGACY_FLUX_LOCAL_SETTINGS_KEY = 'flux_local_settings.json';

export type DevcordLocalSettings = {
  version: 1;
  audio: {
    micDeviceId: string;
    micSoftwareGate: boolean;
    micGateThresholdDb: number;
    rnnoiseEnabled: boolean;
  };
  screen: {
    fps: number;
    res: number;
  };
  userVoiceGain: Record<string, number>;
  userOutputMuted: Record<string, boolean>;
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

const defaultSettings = (): DevcordLocalSettings => ({
  version: 1,
  audio: {
    micDeviceId: '',
    micSoftwareGate: false,
    micGateThresholdDb: -40,
    rnnoiseEnabled: true,
  },
  screen: { fps: 60, res: 1080 },
  userVoiceGain: {},
  userOutputMuted: {},
  appearance: { theme: 'dark' },
});

function migrateLegacy(): Partial<DevcordLocalSettings> {
  const partial: Partial<DevcordLocalSettings> = {};
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
    const mic =
      localStorage.getItem('devcord_mic_device') ?? localStorage.getItem('flux_mic_device');
    if (mic) {
      partial.audio = { ...defaultSettings().audio, micDeviceId: mic };
    }
  } catch {
    /* ignore */
  }
  return partial;
}

function parseStored(raw: string | null): DevcordLocalSettings | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw) as Partial<DevcordLocalSettings>;
    if (j && j.version === 1) {
      const d = defaultSettings();
      return {
        ...d,
        ...j,
        audio: {
          ...d.audio,
          ...j.audio,
          rnnoiseEnabled: typeof j.audio?.rnnoiseEnabled === 'boolean' ? j.audio.rnnoiseEnabled : d.audio.rnnoiseEnabled,
        },
        screen: { ...d.screen, ...j.screen },
        userVoiceGain: clampUserVoiceGainRecord(j.userVoiceGain),
        userOutputMuted: { ...(j.userOutputMuted ?? {}) },
        appearance: {
          theme: j.appearance?.theme === 'light' ? 'light' : 'dark',
        },
      };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function loadDevcordLocalSettings(): DevcordLocalSettings {
  try {
    let raw = localStorage.getItem(DEVCORD_LOCAL_SETTINGS_KEY);
    if (!raw) raw = localStorage.getItem(LEGACY_FLUX_LOCAL_SETTINGS_KEY);
    const parsed = parseStored(raw);
    if (parsed) return parsed;
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

export function saveDevcordLocalSettings(next: DevcordLocalSettings): void {
  try {
    localStorage.setItem(DEVCORD_LOCAL_SETTINGS_KEY, JSON.stringify(next, null, 2));
    localStorage.removeItem(LEGACY_FLUX_LOCAL_SETTINGS_KEY);
  } catch {
    /* ignore */
  }
}

export function patchDevcordLocalSettings(patch: Partial<DevcordLocalSettings>): DevcordLocalSettings {
  const cur = loadDevcordLocalSettings();
  const merged: DevcordLocalSettings = {
    ...cur,
    ...patch,
    audio: { ...cur.audio, ...patch.audio },
    screen: { ...cur.screen, ...patch.screen },
    userVoiceGain: patch.userVoiceGain ?? cur.userVoiceGain,
    userOutputMuted: patch.userOutputMuted ?? cur.userOutputMuted,
    appearance: { ...cur.appearance, ...patch.appearance },
  };
  saveDevcordLocalSettings(merged);
  return merged;
}
