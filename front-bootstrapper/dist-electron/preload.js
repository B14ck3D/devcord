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
    onInstallProgress: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('install-progress', wrapped);
        return () => ipcRenderer.removeListener('install-progress', wrapped);
    },
    onInstallError: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('install-error', wrapped);
        return () => ipcRenderer.removeListener('install-error', wrapped);
    },
    onInstallComplete: (listener) => {
        const wrapped = () => listener();
        ipcRenderer.on('install-complete', wrapped);
        return () => ipcRenderer.removeListener('install-complete', wrapped);
    },
    openLogFile: () => ipcRenderer.invoke('bootstrapper:open-log'),
});
contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => ipcRenderer.invoke('bootstrapper:window-minimize'),
    closeWindow: () => ipcRenderer.invoke('bootstrapper:window-close'),
    onInstallProgress: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('install-progress', wrapped);
        return () => ipcRenderer.removeListener('install-progress', wrapped);
    },
    onInstallError: (listener) => {
        const wrapped = (_event, payload) => listener(payload);
        ipcRenderer.on('install-error', wrapped);
        return () => ipcRenderer.removeListener('install-error', wrapped);
    },
    onInstallComplete: (listener) => {
        const wrapped = () => listener();
        ipcRenderer.on('install-complete', wrapped);
        return () => ipcRenderer.removeListener('install-complete', wrapped);
    },
});
//# sourceMappingURL=preload.js.map