import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain } from 'electron';
import electronUpdaterPkg from 'electron-updater';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const { autoUpdater } = electronUpdaterPkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !!process.env.ELECTRON_DEV_SERVER_URL;
const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL ?? 'http://127.0.0.1:5173';
const defaultApiOrigin = 'https://devcord.ndevelopment.org';
const defaultUpdaterFeedUrl = `${defaultApiOrigin}/api/updates`;
const shortcutMute = process.env.DEVCORD_SHORTCUT_MUTE ?? 'CommandOrControl+M';
const shortcutDeafen = process.env.DEVCORD_SHORTCUT_DEAFEN ?? 'CommandOrControl+D';
const updateFeedUrl = process.env.DEVCORD_UPDATE_BASE_URL?.trim() || defaultUpdaterFeedUrl;
if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA?.trim();
    if (localAppData) {
        const userDataPath = path.join(localAppData, 'Devcord');
        app.setPath('userData', userDataPath);
        app.setPath('sessionData', path.join(userDataPath, 'Session'));
    }
}
app.commandLine.appendSwitch('enable-webrtc-hw-encoding');
app.commandLine.appendSwitch('enable-webrtc-hw-decoding');
app.commandLine.appendSwitch('force-high-performance-gpu');
let mainWindow = null;
function broadcast(channel, payload) {
    for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed())
            win.webContents.send(channel, payload);
    }
}
function createMainWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');
    const iconPath = path.join(__dirname, '..', 'build', 'icons', 'icon.ico');
    const win = new BrowserWindow({
        title: 'Devcord',
        width: 1480,
        height: 920,
        minWidth: 1280,
        minHeight: 720,
        backgroundColor: '#111214',
        show: false,
        icon: process.platform === 'win32' ? iconPath : undefined,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false,
            partition: 'persist:devcord-main',
        },
    });
    win.once('ready-to-show', () => win.show());
    if (isDev) {
        void win.loadURL(devServerUrl);
        win.webContents.openDevTools({ mode: 'detach' });
    }
    else {
        const appHtml = path.join(__dirname, '..', 'dist', 'index.html');
        void win.loadFile(appHtml);
    }
    return win;
}
function setupIpc() {
    ipcMain.handle('devcord:desktop-capturer:list-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['screen', 'window'],
            thumbnailSize: { width: 320, height: 180 },
            fetchWindowIcons: true,
        });
        return sources.map((s) => ({
            id: s.id,
            name: s.name,
            displayId: s.display_id,
            thumbnailDataUrl: s.thumbnail?.toDataURL?.() ?? '',
            appIconDataUrl: s.appIcon?.toDataURL?.() ?? '',
        }));
    });
    ipcMain.handle('devcord:app-version', () => app.getVersion());
}
function setupGlobalShortcuts() {
    globalShortcut.unregisterAll();
    globalShortcut.register(shortcutMute, () => {
        broadcast('devcord:shortcut-action', { action: 'toggle-mute' });
    });
    globalShortcut.register(shortcutDeafen, () => {
        broadcast('devcord:shortcut-action', { action: 'toggle-deafen' });
    });
}
function setupAutoUpdater() {
    if (isDev)
        return;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.setFeedURL({ provider: 'generic', url: updateFeedUrl });
    autoUpdater.on('checking-for-update', () => {
        broadcast('devcord:updater-status', { state: 'checking' });
    });
    autoUpdater.on('update-available', (info) => {
        broadcast('devcord:updater-status', { state: 'available', info });
    });
    autoUpdater.on('update-not-available', (info) => {
        broadcast('devcord:updater-status', { state: 'not-available', info });
    });
    autoUpdater.on('error', (error) => {
        broadcast('devcord:updater-status', {
            state: 'error',
            message: error?.message ?? String(error),
        });
    });
    autoUpdater.on('download-progress', (progress) => {
        broadcast('devcord:updater-status', { state: 'downloading', progress });
    });
    autoUpdater.on('update-downloaded', (info) => {
        broadcast('devcord:updater-status', { state: 'downloaded', info });
        setTimeout(() => {
            try {
                autoUpdater.quitAndInstall(false, true);
            }
            catch (e) {
                broadcast('devcord:updater-status', {
                    state: 'error',
                    message: e instanceof Error ? e.message : 'quitAndInstall failed',
                });
            }
        }, 1500);
    });
    void autoUpdater.checkForUpdates().catch((e) => {
        broadcast('devcord:updater-status', {
            state: 'error',
            message: e instanceof Error ? e.message : 'Unknown updater error',
        });
    });
}
app.whenReady().then(() => {
    setupIpc();
    mainWindow = createMainWindow();
    setupGlobalShortcuts();
    setupAutoUpdater();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            mainWindow = createMainWindow();
            setupGlobalShortcuts();
        }
    });
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});
//# sourceMappingURL=main.js.map