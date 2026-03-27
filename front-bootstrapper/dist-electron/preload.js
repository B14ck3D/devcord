import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('bootstrapper', {
    startInstall: () => ipcRenderer.invoke('bootstrapper:start-install'),
    onStatus: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('bootstrapper:status', wrapped);
        return () => ipcRenderer.removeListener('bootstrapper:status', wrapped);
    },
});
//# sourceMappingURL=preload.js.map