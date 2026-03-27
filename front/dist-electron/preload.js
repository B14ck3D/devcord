import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('devcordDesktop', {
    isElectron: true,
    listScreenSources: () => ipcRenderer.invoke('devcord:desktop-capturer:list-sources'),
    getAppVersion: () => ipcRenderer.invoke('devcord:app-version'),
    onShortcutAction: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('devcord:shortcut-action', wrapped);
        return () => ipcRenderer.removeListener('devcord:shortcut-action', wrapped);
    },
    onUpdaterStatus: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('devcord:updater-status', wrapped);
        return () => ipcRenderer.removeListener('devcord:updater-status', wrapped);
    },
});
//# sourceMappingURL=preload.js.map