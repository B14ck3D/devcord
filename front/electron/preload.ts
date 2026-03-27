import { contextBridge, ipcRenderer } from 'electron';

type ShortcutAction = 'toggle-mute' | 'toggle-deafen';

export type DesktopSourceInfo = {
  id: string;
  name: string;
  displayId: string;
  thumbnailDataUrl: string;
  appIconDataUrl: string;
};

contextBridge.exposeInMainWorld('devcordDesktop', {
  isElectron: true,
  listScreenSources: () =>
    ipcRenderer.invoke('devcord:desktop-capturer:list-sources') as Promise<DesktopSourceInfo[]>,
  getAppVersion: () => ipcRenderer.invoke('devcord:app-version') as Promise<string>,
  onShortcutAction: (listener: (payload: { action: ShortcutAction }) => void) => {
    const wrapped = (_event: unknown, payload: { action: ShortcutAction }) => listener(payload);
    ipcRenderer.on('devcord:shortcut-action', wrapped);
    return () => ipcRenderer.removeListener('devcord:shortcut-action', wrapped);
  },
  onUpdaterStatus: (listener: (payload: unknown) => void) => {
    const wrapped = (_event: unknown, payload: unknown) => listener(payload);
    ipcRenderer.on('devcord:updater-status', wrapped);
    return () => ipcRenderer.removeListener('devcord:updater-status', wrapped);
  },
});
