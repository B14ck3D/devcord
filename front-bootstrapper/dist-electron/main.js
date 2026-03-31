import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { execSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL ?? 'http://127.0.0.1:5180';
const updatesApiUrl = process.env.DEVCORD_UPDATES_API_URL?.trim() || 'https://devcord.ndevelopment.org/api/updates/latest';
const shouldOpenDevTools = process.env.DEVCORD_BOOTSTRAPPER_DEVTOOLS === '1' || !app.isPackaged;
const fallbackRendererHtml = `<!doctype html><html><head><meta charset="utf-8"><title>Devcord Installer</title></head><body style="background:#0b1020;color:#dbe7ff;font-family:Segoe UI,Arial,sans-serif;padding:24px"><h2>Bootstrapper renderer failed to load</h2><p>Check bootstrapper-main.log for details.</p></body></html>`;
// Transparent windows start faster without GPU composition warm-up.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-software-rasterizer');
app.commandLine.appendSwitch('disable-gpu');
app.commandLine.appendSwitch('disable-gpu-compositing');
app.commandLine.appendSwitch('disable-features', 'VizDisplayCompositor');
function inferArchiveName(archive) {
    const explicit = archive?.fileName?.trim();
    if (explicit)
        return explicit;
    const fromUrl = archive?.url?.trim();
    if (fromUrl) {
        try {
            const u = new URL(fromUrl);
            const base = path.basename(u.pathname);
            if (base)
                return base;
        }
        catch {
            const base = path.basename(fromUrl);
            if (base)
                return base;
        }
    }
    return 'Devcord-App-latest.zip';
}
let mainWindow = null;
let mainLogPath = null;
function parseLaunchArgs(argv) {
    let updateMode = false;
    let archivePath = null;
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--update-mode') {
            updateMode = true;
            continue;
        }
        if (arg.startsWith('--archive-path=')) {
            archivePath = arg.slice('--archive-path='.length).trim() || null;
            continue;
        }
        if (arg === '--archive-path') {
            const next = argv[i + 1];
            if (next) {
                archivePath = next.trim();
                i += 1;
            }
        }
    }
    return { updateMode, archivePath };
}
const launchArgs = parseLaunchArgs(process.argv);
if (process.platform === 'win32') {
    app.setAppUserModelId('com.devcord.installer');
}
function formatErr(error) {
    if (error instanceof Error)
        return error.stack || error.message;
    try {
        return JSON.stringify(error);
    }
    catch {
        return String(error);
    }
}
function ensureMainLogPath() {
    if (mainLogPath)
        return mainLogPath;
    try {
        const userData = app.getPath('userData');
        fs.mkdirSync(userData, { recursive: true });
        mainLogPath = path.join(userData, 'bootstrapper-main.log');
        return mainLogPath;
    }
    catch {
        return null;
    }
}
function logMain(message, detail) {
    const line = `[${new Date().toISOString()}] ${message}${detail === undefined ? '' : ` ${formatErr(detail)}`}\n`;
    const target = ensureMainLogPath();
    if (target) {
        try {
            fs.appendFileSync(target, line, 'utf8');
            return;
        }
        catch {
            // Fall through to stderr when file logging fails.
        }
    }
    process.stderr.write(line);
}
function resolvePreloadPath() {
    const candidates = [
        path.join(__dirname, 'preload.js'),
        path.join(app.getAppPath(), 'dist-electron', 'preload.js'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return candidates[0];
}
function resolveIconPath() {
    if (process.platform !== 'win32')
        return undefined;
    const candidates = app.isPackaged
        ? [
            path.join(process.resourcesPath, 'icon.ico'),
            path.join(app.getAppPath(), 'build', 'icons', 'icon.ico'),
        ]
        : [
            path.join(app.getAppPath(), 'build', 'icons', 'icon.ico'),
            path.join(__dirname, '..', 'build', 'icons', 'icon.ico'),
        ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return candidate;
    }
    return undefined;
}
function resolveRendererEntry() {
    if (!app.isPackaged) {
        return { kind: 'url', value: devServerUrl };
    }
    const candidates = [
        path.join(app.getAppPath(), 'dist', 'index.html'),
        path.join(__dirname, '..', 'dist', 'index.html'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate))
            return { kind: 'file', value: candidate };
    }
    return { kind: 'file', value: candidates[0] };
}
function attachWindowDiagnostics(win) {
    win.on('unresponsive', () => {
        logMain('window unresponsive');
    });
    win.webContents.on('did-finish-load', () => {
        logMain('renderer did-finish-load');
        void win.webContents.executeJavaScript('document.body ? document.body.innerHTML : "<no-body>"', true)
            .then((bodyHtml) => {
            const domPreview = String(bodyHtml).slice(0, 500);
            logMain('renderer dom snapshot', { length: String(bodyHtml).length, preview: domPreview });
        })
            .catch((error) => {
            logMain('renderer dom snapshot failed', error);
        });
    });
    win.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
        logMain('renderer did-fail-load', { errorCode, errorDescription, validatedURL, isMainFrame });
    });
    win.webContents.on('preload-error', (_event, preloadPath, error) => {
        logMain('renderer preload-error', { preloadPath, error: formatErr(error) });
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        logMain('renderer process gone', details);
    });
    win.webContents.on('console-message', (_event, level, message, line, sourceId) => {
        logMain('renderer console-message', { level, message, line, sourceId });
    });
}
async function loadRendererWithFallback(win) {
    const entry = resolveRendererEntry();
    logMain('renderer entry selected', entry);
    try {
        if (entry.kind === 'url') {
            await win.loadURL(entry.value);
            return;
        }
        await win.loadFile(entry.value);
    }
    catch (error) {
        logMain('renderer load failed', error);
        const dataUrl = `data:text/html;charset=UTF-8,${encodeURIComponent(fallbackRendererHtml)}`;
        await win.loadURL(dataUrl);
        if (!win.isVisible())
            win.show();
    }
}
function setupGlobalDiagnostics() {
    process.on('uncaughtException', (error) => {
        logMain('uncaughtException', error);
    });
    process.on('unhandledRejection', (reason) => {
        logMain('unhandledRejection', reason);
    });
    app.on('render-process-gone', (_event, _webContents, details) => {
        logMain('app render-process-gone', details);
    });
}
function sendStatus(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bootstrapper:status', payload);
        mainWindow.webContents.send('install-progress', {
            progress: payload.progress ?? 0,
            status: payload.message,
            state: payload.state,
            detail: payload.detail,
        });
    }
}
function sendInstallError(message) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-error', message);
    }
}
function sendInstallComplete() {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('install-complete');
    }
}
function createWindow() {
    const preloadPath = resolvePreloadPath();
    const iconPath = resolveIconPath();
    logMain('createWindow paths', { preloadPath, iconPath, appPath: app.getAppPath(), resourcesPath: process.resourcesPath });
    const win = new BrowserWindow({
        title: 'Devcord Installer',
        width: 850,
        height: 550,
        frame: false,
        transparent: true,
        hasShadow: false,
        resizable: false,
        maximizable: false,
        minimizable: true,
        autoHideMenuBar: true,
        show: false,
        backgroundColor: '#00000000',
        icon: process.platform === 'win32' ? iconPath : undefined,
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            allowRunningInsecureContent: process.env.DEVCORD_ALLOW_INSECURE_CONTENT === '1',
            sandbox: false,
            spellcheck: false,
        },
    });
    attachWindowDiagnostics(win);
    win.setMenu(null);
    win.setMenuBarVisibility(false);
    if (iconPath) {
        win.setIcon(iconPath);
    }
    win.once('ready-to-show', () => win.show());
    if (shouldOpenDevTools) {
        win.webContents.openDevTools({ mode: 'detach' });
    }
    void loadRendererWithFallback(win);
    return win;
}
async function ensureDir(dirPath) {
    await fsp.mkdir(dirPath, { recursive: true });
}
async function removeDirContents(dirPath) {
    await ensureDir(dirPath);
    const entries = await fsp.readdir(dirPath, { withFileTypes: true });
    await Promise.all(entries.map(async (entry) => {
        const p = path.join(dirPath, entry.name);
        await fsp.rm(p, { recursive: true, force: true });
    }));
}
async function fetchLatestInfo() {
    const res = await fetch(updatesApiUrl, { method: 'GET' });
    if (!res.ok) {
        throw new Error(`Updates API failed: ${res.status}`);
    }
    return (await res.json());
}
async function downloadFile(url, outFile, expectedSize) {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok || !res.body) {
        throw new Error(`Download failed: ${res.status}`);
    }
    await ensureDir(path.dirname(outFile));
    const total = Number(res.headers.get('content-length') ?? expectedSize ?? 0);
    let loaded = 0;
    const reader = res.body.getReader();
    const file = fs.createWriteStream(outFile);
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            if (value) {
                loaded += value.length;
                file.write(Buffer.from(value));
                if (total > 0) {
                    const raw = Math.min(1, loaded / total);
                    const mapped = 0.1 + raw * 0.65;
                    sendStatus({
                        state: 'downloading',
                        message: 'Pobieranie paczki Devcord...',
                        progress: Math.min(0.75, mapped),
                    });
                }
            }
        }
    }
    finally {
        file.end();
    }
    await new Promise((resolve, reject) => {
        file.on('finish', () => resolve());
        file.on('error', reject);
    });
}
async function downloadFileWithRetry(url, outFile, expectedSize, attempts) {
    let lastErr = null;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            await downloadFile(url, outFile, expectedSize);
            return;
        }
        catch (e) {
            lastErr = e;
            sendStatus({
                state: 'downloading',
                message: `Ponawianie pobierania (${i}/${attempts})...`,
            });
            await new Promise((r) => setTimeout(r, 700));
        }
    }
    throw lastErr instanceof Error ? lastErr : new Error('Download failed after retries');
}
async function verifySha512(filePath, expectedBase64) {
    if (!expectedBase64)
        return;
    const hash = crypto.createHash('sha512');
    await new Promise((resolve, reject) => {
        const stream = fs.createReadStream(filePath);
        stream.on('data', (chunk) => hash.update(chunk));
        stream.on('error', reject);
        stream.on('end', () => resolve());
    });
    const digest = hash.digest('base64');
    if (digest !== expectedBase64) {
        throw new Error('Checksum mismatch for downloaded archive');
    }
}
function escapePowerShellPath(value) {
    return value.replace(/'/g, "''");
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function forceDeleteDirWindows(dirPath) {
    if (process.platform !== 'win32')
        return;
    const normalized = path.resolve(dirPath);
    try {
        execSync(`cmd.exe /c rd /s /q "${normalized}"`, { stdio: 'ignore' });
        logMain('forceDeleteDirWindows ok', { dirPath: normalized });
    }
    catch (error) {
        logMain('forceDeleteDirWindows skipped', { dirPath: normalized, reason: formatErr(error) });
    }
}
async function extractArchiveZip(archivePath, destination) {
    const attempts = 3;
    let lastError = null;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        await ensureDir(destination);
        sendStatus({
            state: 'extracting',
            message: attempt > 1 ? `Ponawianie rozpakowywania (${attempt}/${attempts})...` : 'Wypakowywanie plików...',
            progress: 0.78,
        });
        const startedAt = Date.now();
        const heartbeat = setInterval(() => {
            sendStatus({
                state: 'extracting',
                message: attempt > 1 ? `Ponawianie rozpakowywania (${attempt}/${attempts})...` : 'Rozpakowywanie archiwum... to moze potrwac chwile.',
                progress: 0.78,
            });
        }, 2000);
        try {
            const archiveArg = escapePowerShellPath(archivePath);
            const destinationArg = escapePowerShellPath(destination);
            execSync(`powershell.exe -NoP -NonI -ExecutionPolicy Bypass -Command "Expand-Archive -Path '${archiveArg}' -DestinationPath '${destinationArg}' -Force"`, { stdio: 'ignore' });
            sendStatus({ state: 'extracting', message: 'Wypakowywanie plików...', progress: 0.94 });
            return;
        }
        catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            logMain('extract-zip failed', { archivePath, destination, message, elapsedMs: Date.now() - startedAt, attempt });
            if (attempt < attempts) {
                killDevcordProcesses();
                await removeDirContentsWithRetry(destination).catch(() => undefined);
                forceDeleteDirWindows(destination);
                await ensureDir(destination);
                await sleep(2000);
            }
        }
        finally {
            clearInterval(heartbeat);
        }
    }
    const finalMessage = lastError instanceof Error ? lastError.message : String(lastError ?? 'Unknown extract error');
    sendInstallError(`Rozpakowywanie nie powiodlo sie: ${finalMessage}`);
    throw new Error(`extract-zip failed: ${finalMessage}`);
}
async function runPowerShellScript(scriptPath) {
    await new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoP', '-NonI', '-ExecutionPolicy', 'Bypass', '-File', scriptPath], { stdio: 'ignore' });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`PowerShell exited with code ${code}`));
        });
    });
}
async function runUpdateModePipeline(archivePathRaw) {
    const archivePath = archivePathRaw.trim();
    if (!archivePath) {
        throw new Error('Brak parametru --archive-path dla update mode.');
    }
    const archiveResolved = path.resolve(archivePath);
    await fsp.access(archiveResolved, fs.constants.R_OK);
    const installRoot = defaultInstallRootPath();
    const appDir = path.join(installRoot, 'app');
    const lockFile = path.join(installRoot, '.bootstrapper-update.lock');
    const appDirResolved = path.resolve(appDir);
    const relArchiveToApp = path.relative(appDirResolved, archiveResolved);
    const archiveInsideApp = relArchiveToApp === '' || (!relArchiveToApp.startsWith('..') && !path.isAbsolute(relArchiveToApp));
    if (archiveInsideApp) {
        throw new Error('Archive path points inside install app directory. Aborting to avoid in-use archive lock.');
    }
    await ensureDir(installRoot);
    await fsp.writeFile(lockFile, String(Date.now()), 'utf8');
    try {
        sendStatus({ state: 'checking', message: 'Przygotowywanie aktualizacji...', progress: 0.05 });
        sendStatus({ state: 'checking', message: 'Oczekiwanie na zamknięcie Devcord...', progress: 0.08 });
        await sleep(4000);
        sendStatus({ state: 'checking', message: 'Wymuszanie zamknięcia procesów Devcord...', progress: 0.12 });
        killDevcordProcesses();
        forceDeleteDirWindows(appDir);
        await removeDirContentsWithRetry(appDir);
        forceDeleteDirWindows(appDir);
        await ensureDir(appDir);
        sendStatus({ state: 'extracting', message: 'Aktualizowanie plików Devcord...', progress: 0.35 });
        const scriptPath = path.join(app.getPath('temp'), `devcord-sidecar-update-${Date.now()}.ps1`);
        const scriptContent = `
Start-Sleep -Seconds 3
Expand-Archive -Path '${escapePowerShellPath(archiveResolved)}' -DestinationPath '${escapePowerShellPath(appDir)}' -Force
`;
        await fsp.writeFile(scriptPath, scriptContent, 'utf8');
        try {
            await runPowerShellScript(scriptPath);
        }
        finally {
            await fsp.rm(scriptPath, { force: true }).catch(() => undefined);
        }
        sendStatus({ state: 'launching', message: 'Uruchamianie zaktualizowanego Devcord...', progress: 0.92 });
        const mainExe = await findMainExe(appDir);
        const launchErr = await shell.openPath(mainExe);
        if (launchErr)
            throw new Error(`Devcord launch failed: ${launchErr}`);
        sendStatus({ state: 'done', message: 'Aktualizacja zakończona.', progress: 1 });
        sendInstallComplete();
        await fsp.rm(archiveResolved, { force: true }).catch(() => undefined);
        setTimeout(() => app.quit(), 800);
    }
    finally {
        await fsp.rm(lockFile, { force: true }).catch(() => undefined);
    }
}
async function findMainExe(rootDir) {
    const queue = [rootDir];
    while (queue.length) {
        const cur = queue.shift();
        const entries = await fsp.readdir(cur, { withFileTypes: true });
        for (const entry of entries) {
            const p = path.join(cur, entry.name);
            if (entry.isDirectory())
                queue.push(p);
            if (entry.isFile() && /^Devcord\.exe$/i.test(entry.name))
                return p;
        }
    }
    throw new Error('Cannot find Devcord.exe after extraction');
}
async function createShortcuts(exePath) {
    const desktop = path.join(os.homedir(), 'Desktop', 'Devcord.lnk');
    const startMenu = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Devcord.lnk');
    const ps = `
$WshShell = New-Object -ComObject WScript.Shell
$s1 = $WshShell.CreateShortcut('${desktop.replace(/\\/g, '\\\\')}')
$s1.TargetPath = '${exePath.replace(/\\/g, '\\\\')}'
$s1.WorkingDirectory = '${path.dirname(exePath).replace(/\\/g, '\\\\')}'
$s1.Save()
$s2 = $WshShell.CreateShortcut('${startMenu.replace(/\\/g, '\\\\')}')
$s2.TargetPath = '${exePath.replace(/\\/g, '\\\\')}'
$s2.WorkingDirectory = '${path.dirname(exePath).replace(/\\/g, '\\\\')}'
$s2.Save()
`;
    await new Promise((resolve, reject) => {
        const child = spawn('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], {
            stdio: 'ignore',
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`Shortcut creation failed with code ${code}`));
        });
    });
}
function defaultInstallRootPath() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    return path.join(localAppData, 'Devcord');
}
function getShortcutPaths() {
    const desktop = path.join(os.homedir(), 'Desktop', 'Devcord.lnk');
    const startMenu = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Devcord.lnk');
    return { desktop, startMenu };
}
async function detectInstallation(installRootOverride) {
    const installRoot = installRootOverride?.trim() || defaultInstallRootPath();
    const appDir = path.join(installRoot, 'app');
    try {
        const exePath = await findMainExe(appDir);
        return {
            installed: true,
            installRoot,
            appDir,
            exePath,
        };
    }
    catch {
        return {
            installed: false,
            installRoot,
            appDir,
        };
    }
}
async function uninstallInstallation(installRootOverride) {
    killDevcordProcesses();
    const installRoot = installRootOverride?.trim() || defaultInstallRootPath();
    const appDir = path.join(installRoot, 'app');
    await fsp.rm(appDir, { recursive: true, force: true });
    const { desktop, startMenu } = getShortcutPaths();
    await Promise.all([
        fsp.rm(desktop, { force: true }),
        fsp.rm(startMenu, { force: true }),
    ]);
    // Try removing root only if empty; avoid deleting running installer file.
    await fsp.rmdir(installRoot).catch(() => undefined);
}
function killProcess(imageName) {
    if (process.platform !== 'win32')
        return;
    try {
        execSync(`taskkill /F /IM ${imageName} /T`, { stdio: 'ignore' });
        logMain('process killed', { imageName });
    }
    catch (error) {
        // Process may already be closed; keep uninstall/repair flow running.
        logMain('process kill skipped', { imageName, reason: formatErr(error) });
    }
}
function killDevcordProcesses() {
    killProcess('Devcord.exe');
    killProcess('Devcord Helper.exe');
}
async function removeDirContentsWithRetry(dirPath, attempts = 3) {
    let lastError = null;
    for (let i = 1; i <= attempts; i += 1) {
        try {
            await removeDirContents(dirPath);
            return;
        }
        catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            const isRetryable = /EBUSY|EPERM|ENOTEMPTY/i.test(message);
            if (!isRetryable || i === attempts)
                break;
            logMain('removeDirContents retry', { dirPath, attempt: i, message });
            await sleep(2000);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(`Failed cleaning directory: ${dirPath}`);
}
async function runPipeline(installRootOverride, cleanInstallRoot = false) {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const fallbackInstallRoot = path.join(localAppData, 'Devcord');
    const installRoot = installRootOverride?.trim() || fallbackInstallRoot;
    const appDir = path.join(installRoot, 'app');
    const lockFile = path.join(installRoot, '.bootstrapper.lock');
    await ensureDir(installRoot);
    try {
        await fsp.access(lockFile);
        throw new Error('Instalator jest już uruchomiony');
    }
    catch {
        /* lock does not exist */
    }
    await fsp.writeFile(lockFile, String(Date.now()), 'utf8');
    try {
        if (cleanInstallRoot) {
            killDevcordProcesses();
            sendStatus({ state: 'checking', message: 'Czyszczenie poprzedniej instalacji...', progress: 0.02 });
            await removeDirContentsWithRetry(appDir);
        }
        sendStatus({ state: 'checking', message: 'Sprawdzanie najnowszej wersji...' });
        sendStatus({ state: 'checking', message: 'Sprawdzanie najnowszej wersji...', progress: 0.04 });
        const info = await fetchLatestInfo();
        const archive = info.app_archive;
        if (!archive?.url)
            throw new Error('Updates API: missing app_archive.url');
        const archiveName = inferArchiveName(archive);
        const tempArchive = path.join(app.getPath('temp'), archiveName);
        sendStatus({ state: 'checking', message: 'Wersja znaleziona, przygotowanie pobierania...', progress: 0.1 });
        sendStatus({ state: 'downloading', message: `Pobieranie wersji ${info.version ?? 'latest'}...`, progress: 0.1 });
        await downloadFileWithRetry(archive.url, tempArchive, archive.size, 3);
        await verifySha512(tempArchive, archive.sha512);
        sendStatus({ state: 'extracting', message: 'Instalowanie plików aplikacji...', progress: 0.78 });
        killDevcordProcesses();
        await removeDirContentsWithRetry(appDir);
        try {
            await extractArchiveZip(tempArchive, appDir);
        }
        catch (e) {
            await removeDirContentsWithRetry(appDir);
            throw e;
        }
        sendStatus({ state: 'creating_shortcuts', message: 'Tworzenie skrótów systemowych...', progress: 0.95 });
        const mainExe = await findMainExe(appDir);
        await createShortcuts(mainExe);
        sendStatus({ state: 'launching', message: 'Uruchamianie Devcord...', progress: 0.98 });
        const launchErr = await shell.openPath(mainExe);
        if (launchErr)
            throw new Error(`Devcord launch failed: ${launchErr}`);
        sendStatus({ state: 'done', message: 'Instalacja zakończona.', progress: 1 });
        sendInstallComplete();
        setTimeout(() => app.quit(), 1200);
    }
    finally {
        await fsp.rm(lockFile, { force: true }).catch(() => undefined);
    }
}
function setupIpc() {
    ipcMain.handle('bootstrapper:window-minimize', () => {
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
        win?.minimize();
        return { ok: true };
    });
    ipcMain.handle('bootstrapper:window-close', () => {
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getFocusedWindow();
        win?.close();
        return { ok: true };
    });
    ipcMain.handle('bootstrapper:open-log', async () => {
        const logPath = ensureMainLogPath();
        if (!logPath)
            return { ok: false, error: 'Log file is unavailable' };
        const openErr = await shell.openPath(logPath);
        if (openErr)
            return { ok: false, error: openErr };
        return { ok: true, path: logPath };
    });
    ipcMain.handle('bootstrapper:is-update-mode', () => launchArgs.updateMode);
    ipcMain.handle('bootstrapper:get-installation-state', async (_event, payload) => {
        try {
            return await detectInstallation(payload?.installRoot);
        }
        catch (error) {
            logMain('bootstrapper:get-installation-state failed', error);
            return {
                installed: false,
                installRoot: payload?.installRoot?.trim() || defaultInstallRootPath(),
                appDir: path.join(payload?.installRoot?.trim() || defaultInstallRootPath(), 'app'),
            };
        }
    });
    ipcMain.handle('bootstrapper:pick-install-dir', async () => {
        const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined;
        const dialogOptions = {
            title: 'Wybierz folder instalacji Devcord',
            defaultPath: defaultInstallRootPath(),
            properties: ['openDirectory', 'createDirectory', 'promptToCreate'],
            buttonLabel: 'Wybierz folder',
        };
        const result = win
            ? await dialog.showOpenDialog(win, dialogOptions)
            : await dialog.showOpenDialog(dialogOptions);
        if (result.canceled || result.filePaths.length === 0) {
            return { ok: false };
        }
        return { ok: true, path: result.filePaths[0] };
    });
    ipcMain.handle('bootstrapper:start-install', async (_event, payload) => {
        if (launchArgs.updateMode) {
            return { ok: false, error: 'Installer działa w trybie aktualizacji (update mode).' };
        }
        try {
            const installRoot = payload?.installRoot?.trim();
            await runPipeline(installRoot, Boolean(payload?.cleanInstallRoot));
            return { ok: true };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown installer error';
            sendStatus({ state: 'error', message: 'Instalacja nie powiodła się.', detail: message });
            return { ok: false, error: message };
        }
    });
    ipcMain.handle('bootstrapper:uninstall', async (_event, payload) => {
        try {
            await uninstallInstallation(payload?.installRoot);
            return { ok: true };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown uninstall error';
            logMain('bootstrapper:uninstall failed', message);
            return { ok: false, error: message };
        }
    });
}
function startUpdateModeFlow() {
    if (!launchArgs.updateMode)
        return;
    if (!mainWindow || mainWindow.isDestroyed())
        return;
    mainWindow.webContents.send('set-update-mode', true);
    const archivePath = launchArgs.archivePath?.trim() || '';
    void (async () => {
        try {
            if (!archivePath)
                throw new Error('Brak --archive-path dla sidecar update mode.');
            await runUpdateModePipeline(archivePath);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            logMain('sidecar update-mode failed', { message, archivePath });
            sendStatus({ state: 'error', message: 'Aktualizacja nie powiodła się.', detail: message });
            sendInstallError(message);
        }
    })();
}
app.whenReady().then(() => {
    setupGlobalDiagnostics();
    logMain('bootstrapper main ready', { launchArgs });
    mainWindow = createWindow();
    setupIpc();
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.once('did-finish-load', () => {
            startUpdateModeFlow();
        });
    }
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
//# sourceMappingURL=main.js.map