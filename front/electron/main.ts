import { app, BrowserWindow, desktopCapturer, globalShortcut, ipcMain, session } from 'electron';
import electronUpdaterPkg from 'electron-updater';
import log from 'electron-log';
import fs from 'node:fs';
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
app.commandLine.appendSwitch('enable-features', 'WebRtcHideLocalIpsWithMdns,WebRtcApmInAudioService');
app.commandLine.appendSwitch('force-webrtc-ip-handling-policy', 'default_public_interface_only');

let mainWindow: BrowserWindow | null = null;
let updateInstallInProgress = false;

function configureElectronLog() {
  try {
    const logDir = path.join(app.getPath('appData'), 'Devcord', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    log.transports.file.resolvePathFn = () => path.join(logDir, 'main.log');
    log.initialize();
    log.info('electron-log initialized', { logDir });
  } catch {
    // If logger init fails, fallback is stderr in logMain.
  }
}

function logMain(message: string, detail?: unknown) {
  let serialized = '';
  if (detail !== undefined) {
    try {
      serialized = ` ${JSON.stringify(detail)}`;
    } catch {
      serialized = ` ${String(detail)}`;
    }
  }
  const line = `${message}${serialized}`;
  try {
    log.info(line);
  } catch {
    process.stderr.write(`[${new Date().toISOString()}] ${line}\n`);
  }
}

function resolveWindowIconPath() {
  if (process.platform !== 'win32') return undefined;
  if (!app.isPackaged) return path.join(__dirname, '..', 'build', 'icons', 'icon.ico');
  return path.join(process.resourcesPath, 'icon.ico');
}

function broadcast(channel: string, payload: unknown) {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, payload);
  }
}

function createMainWindow() {
  const preloadPath = path.join(__dirname, 'preload.js');
  const iconPath = resolveWindowIconPath();
  const win = new BrowserWindow({
    title: 'Devcord',
    width: 1480,
    height: 920,
    minWidth: 1280,
    minHeight: 720,
    backgroundColor: '#111214',
    autoHideMenuBar: true,
    show: false,
    icon: iconPath,
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false,
      sandbox: false,
      spellcheck: false,
      partition: 'persist:devcord-main',
    },
  });
  win.setMenu(null);
  win.setMenuBarVisibility(false);

  win.once('ready-to-show', () => win.show());
  win.on('unresponsive', () => {
    logMain('window unresponsive');
  });
  win.webContents.on('did-finish-load', () => {
    logMain('renderer did-finish-load');
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logMain('renderer preload-error', { preloadPath, error: String(error) });
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logMain('renderer render-process-gone', details);
  });
  win.webContents.on('did-fail-load', (_event, code, desc) => {
    logMain('renderer did-fail-load', { code, desc });
  });

  if (isDev) {
    void win.loadURL(devServerUrl);
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    const appHtml = path.join(app.getAppPath(), 'dist-desktop', 'index.html');
    logMain('renderer loadFile', { appHtml });
    void win.loadFile(appHtml);
  }

  return win;
}

function setupDesktopSessionNetworking() {
  const installMediaPermissions = (ses: ReturnType<typeof session.fromPartition>) => {
    ses.setPermissionCheckHandler((_webContents, permission) => {
      const perm = String(permission);
      if (perm === 'media' || perm === 'audioCapture' || perm === 'videoCapture') {
        return true;
      }
      return true;
    });
    ses.setPermissionRequestHandler((_webContents, permission, callback) => {
      const perm = String(permission);
      if (perm === 'media' || perm === 'audioCapture' || perm === 'videoCapture') {
        callback(true);
        return;
      }
      callback(true);
    });
  };
  const ses = session.fromPartition('persist:devcord-main');
  installMediaPermissions(ses);
  installMediaPermissions(session.defaultSession);
  ses.webRequest.onBeforeSendHeaders((details, callback) => {
    const headers = details.requestHeaders ?? {};
    const target = details.url || '';
    const targetIsApi = target.startsWith(defaultApiOrigin);
    if (targetIsApi) {
      const origin = String(headers.Origin ?? headers.origin ?? '');
      if (!origin || origin.startsWith('file://')) {
        headers.Origin = defaultApiOrigin;
      }
      const referer = String(headers.Referer ?? headers.referer ?? '');
      if (!referer || referer.startsWith('file://')) {
        headers.Referer = `${defaultApiOrigin}/`;
      }
    }
    callback({ requestHeaders: headers });
  });
}

function setupIpc() {
  const listDesktopSources = async () => {
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
  };

  ipcMain.handle('devcord:desktop-capturer:list-sources', listDesktopSources);
  ipcMain.handle('devcord:get-desktop-sources', listDesktopSources);

  ipcMain.handle('devcord:app-version', () => app.getVersion());
  ipcMain.handle('devcord:updater-check-now', async () => {
    if (isDev) {
      return { ok: false as const, reason: 'dev-mode', message: 'Aktualizacje są niedostępne w trybie deweloperskim.' };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true as const };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logMain('updater check-now failed', { message });
      return { ok: false as const, message };
    }
  });
  ipcMain.handle('devcord:updater-install-now', async () => {
    if (isDev) {
      return { ok: false as const, reason: 'dev-mode', message: 'Instalacja aktualizacji jest niedostępna w trybie deweloperskim.' };
    }
    if (updateInstallInProgress) {
      return { ok: false as const, reason: 'in-progress', message: 'Instalacja aktualizacji już trwa.' };
    }
    try {
      updateInstallInProgress = true;
      broadcast('devcord:updater-status', { state: 'installing' });
      logMain('updater install-now requested');
      autoUpdater.quitAndInstall(false, true);
      return { ok: true as const };
    } catch (error) {
      updateInstallInProgress = false;
      const message = error instanceof Error ? error.message : String(error);
      logMain('updater install-now failed', { message });
      return { ok: false as const, reason: 'error', message };
    }
  });
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
  if (isDev) return;

  const ensureUpdateConfigFile = () => {
    try {
      const configPath = path.join(process.resourcesPath, 'app-update.yml');
      if (fs.existsSync(configPath)) return;
      const yaml = `provider: generic\nurl: ${updateFeedUrl}\nupdaterCacheDirName: devcord-updater\n`;
      fs.writeFileSync(configPath, yaml, 'utf8');
      logMain('updater app-update.yml created', { configPath, url: updateFeedUrl });
    } catch (error) {
      logMain('updater app-update.yml create failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  ensureUpdateConfigFile();
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;
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
    updateInstallInProgress = false;
    broadcast('devcord:updater-status', { state: 'downloaded', info });
    logMain('updater update-downloaded; waiting for explicit install action');
  });

  void autoUpdater.checkForUpdates().catch((e) => {
    broadcast('devcord:updater-status', {
      state: 'error',
      message: e instanceof Error ? e.message : 'Unknown updater error',
    });
  });
}

app.whenReady().then(() => {
  configureElectronLog();
  process.on('uncaughtException', (error) => {
    logMain('uncaughtException', { error: String(error) });
  });
  process.on('unhandledRejection', (reason) => {
    logMain('unhandledRejection', { reason: String(reason) });
  });
  app.on('render-process-gone', (_event, _contents, details) => {
    logMain('app render-process-gone', details);
  });
  setupIpc();
  setupDesktopSessionNetworking();
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
  if (process.platform !== 'darwin') app.quit();
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
