import { create } from 'zustand';
import { loadDevcordLocalSettings } from '../../devcordLocalSettings';

export type SettingsTab = 'profile' | 'appearance' | 'audio' | 'video' | 'privacy';

type SettingsStore = {
  isSettingsOpen: boolean;
  settingsTab: SettingsTab;
  localTheme: 'dark' | 'light';
  micDeviceId: string;
  rnnoiseEnabled: boolean;
  screenFps: number;
  screenRes: number;
  setSettingsOpen: (open: boolean) => void;
  setSettingsTab: (tab: SettingsTab) => void;
  setLocalTheme: (theme: 'dark' | 'light') => void;
  setMicDeviceId: (deviceId: string) => void;
  setRnnoiseEnabled: (enabled: boolean) => void;
  setScreenFps: (fps: number) => void;
  setScreenRes: (res: number) => void;
};

function readSeed() {
  if (typeof window === 'undefined') {
    return {
      localTheme: 'dark' as const,
      micDeviceId: '',
      rnnoiseEnabled: true,
      screenFps: 60,
      screenRes: 1080,
    };
  }
  const s = loadDevcordLocalSettings();
  return {
    localTheme: s.appearance.theme === 'light' ? 'light' : 'dark',
    micDeviceId: s.audio.micDeviceId ?? '',
    rnnoiseEnabled: !!s.audio.rnnoiseEnabled,
    screenFps: s.screen.fps ?? 60,
    screenRes: s.screen.res ?? 1080,
  };
}

const seed = readSeed();

export const useSettingsStore = create<SettingsStore>((set) => ({
  isSettingsOpen: false,
  settingsTab: 'profile',
  localTheme: seed.localTheme,
  micDeviceId: seed.micDeviceId,
  rnnoiseEnabled: seed.rnnoiseEnabled,
  screenFps: seed.screenFps,
  screenRes: seed.screenRes,
  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  setLocalTheme: (theme) => set({ localTheme: theme }),
  setMicDeviceId: (deviceId) => set({ micDeviceId: deviceId }),
  setRnnoiseEnabled: (enabled) => set({ rnnoiseEnabled: enabled }),
  setScreenFps: (fps) => set({ screenFps: fps }),
  setScreenRes: (res) => set({ screenRes: res }),
}));
