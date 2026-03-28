import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('bootstrapper', {
    startInstall: (payload) => ipcRenderer.invoke('bootstrapper:start-install', payload),
    pickInstallDir: () => ipcRenderer.invoke('bootstrapper:pick-install-dir'),
    getInstallationState: (payload) => ipcRenderer.invoke('bootstrapper:get-installation-state', payload),
    uninstall: (payload) => ipcRenderer.invoke('bootstrapper:uninstall', payload),
    onStatus: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('bootstrapper:status', wrapped);
        return () => ipcRenderer.removeListener('bootstrapper:status', wrapped);
    },
});
contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.invoke('bootstrapper:window-minimize'),
    closeWindow: () => ipcRenderer.invoke('bootstrapper:window-close'),
});
//# sourceMappingURL=preload.js.map