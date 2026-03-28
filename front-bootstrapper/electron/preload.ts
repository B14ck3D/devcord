import { contextBridge, ipcRenderer } from 'electron';

export type InstallState =
  | 'idle'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'creating_shortcuts'
  | 'launching'
  | 'done'
  | 'error';

export type InstallEvent = {
  state: InstallState;
  message: string;
  progress?: number;
  detail?: string;
};

contextBridge.exposeInMainWorld('bootstrapper', {
  startInstall: (payload?: { installRoot?: string; cleanInstallRoot?: boolean }) => ipcRenderer.invoke('bootstrapper:start-install', payload) as Promise<{ ok: boolean; error?: string }>,
  pickInstallDir: () => ipcRenderer.invoke('bootstrapper:pick-install-dir') as Promise<{ ok: boolean; path?: string }>,
  getInstallationState: (payload?: { installRoot?: string }) => ipcRenderer.invoke('bootstrapper:get-installation-state', payload) as Promise<{
    installed: boolean;
    installRoot: string;
    appDir: string;
    exePath?: string;
  }>,
  uninstall: (payload?: { installRoot?: string }) => ipcRenderer.invoke('bootstrapper:uninstall', payload) as Promise<{ ok: boolean; error?: string }>,
  onStatus: (listener: (event: InstallEvent) => void) => {
    const wrapped = (_event: unknown, payload: InstallEvent) => listener(payload);
    ipcRenderer.on('bootstrapper:status', wrapped);
    return () => ipcRenderer.removeListener('bootstrapper:status', wrapped);
  },
});

contextBridge.exposeInMainWorld('electronAPI', {
  minimizeWindow: () => ipcRenderer.invoke('bootstrapper:window-minimize') as Promise<{ ok: boolean }>,
  closeWindow: () => ipcRenderer.invoke('bootstrapper:window-close') as Promise<{ ok: boolean }>,
});

