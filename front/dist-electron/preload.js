import { contextBridge, ipcRenderer } from 'electron';
contextBridge.exposeInMainWorld('devcordDesktop', {
    isElectron: true,
    listScreenSources: () => ipcRenderer.invoke('devcord:desktop-capturer:list-sources'),
    getDesktopSources: () => ipcRenderer.invoke('devcord:get-desktop-sources'),
    getAppVersion: () => ipcRenderer.invoke('devcord:app-version'),
    checkForUpdatesNow: () => ipcRenderer.invoke('devcord:updater-check-now'),
    installUpdateNow: () => ipcRenderer.invoke('devcord:updater-install-now'),
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
contextBridge.exposeInMainWorld('electronAPI', {
    getDesktopSources: () => ipcRenderer.invoke('app:get-desktop-sources'),
});
//# sourceMappingURL=preload.js.map