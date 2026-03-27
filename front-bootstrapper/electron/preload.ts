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
  startInstall: () => ipcRenderer.invoke('bootstrapper:start-install') as Promise<{ ok: boolean; error?: string }>,
  onStatus: (listener: (event: InstallEvent) => void) => {
    const wrapped = (_event: unknown, payload: InstallEvent) => listener(payload);
    ipcRenderer.on('bootstrapper:status', wrapped);
    return () => ipcRenderer.removeListener('bootstrapper:status', wrapped);
  },
});

