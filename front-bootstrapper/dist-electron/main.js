import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { path7za } from '7zip-bin';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const isDev = !!process.env.ELECTRON_DEV_SERVER_URL;
const devServerUrl = process.env.ELECTRON_DEV_SERVER_URL ?? 'http://127.0.0.1:5180';
const updatesApiUrl = process.env.DEVCORD_UPDATES_API_URL?.trim() || 'https://devcord.ndevelopment.org/api/updates/latest';
const installerName = 'Devcord_Installer';
let mainWindow = null;
function sendStatus(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('bootstrapper:status', payload);
    }
}
function createWindow() {
    const preloadPath = path.join(__dirname, 'preload.js');
    const win = new BrowserWindow({
        title: 'Devcord Installer',
        width: 980,
        height: 620,
        resizable: false,
        maximizable: false,
        minimizable: true,
        show: false,
        backgroundColor: '#060a19',
        webPreferences: {
            preload: preloadPath,
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false,
            spellcheck: false,
        },
    });
    win.once('ready-to-show', () => win.show());
    if (isDev) {
        void win.loadURL(devServerUrl);
    }
    else {
        void win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
    }
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
                    sendStatus({
                        state: 'downloading',
                        message: 'Pobieranie paczki Devcord...',
                        progress: Math.min(0.99, loaded / total),
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
async function extract7z(archivePath, destination) {
    await ensureDir(destination);
    await new Promise((resolve, reject) => {
        const child = spawn(path7za, ['x', archivePath, `-o${destination}`, '-y'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        child.stderr.on('data', () => {
            sendStatus({ state: 'extracting', message: 'Wypakowywanie plików...' });
        });
        child.on('error', reject);
        child.on('close', (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`7z extraction failed with code ${code}`));
        });
    });
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
async function runPipeline() {
    const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
    const installRoot = path.join(localAppData, 'Devcord');
    const appDir = path.join(installRoot, 'app');
    const tempArchive = path.join(app.getPath('temp'), 'Devcord-App-latest.7z');
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
        sendStatus({ state: 'checking', message: 'Sprawdzanie najnowszej wersji...' });
        const info = await fetchLatestInfo();
        const archive = info.app_archive;
        if (!archive?.url)
            throw new Error('Updates API: missing app_archive.url');
        sendStatus({ state: 'downloading', message: `Pobieranie wersji ${info.version ?? 'latest'}...`, progress: 0 });
        await downloadFileWithRetry(archive.url, tempArchive, archive.size, 3);
        await verifySha512(tempArchive, archive.sha512);
        sendStatus({ state: 'extracting', message: 'Instalowanie plików aplikacji...' });
        await removeDirContents(appDir);
        try {
            await extract7z(tempArchive, appDir);
        }
        catch (e) {
            await removeDirContents(appDir);
            throw e;
        }
        sendStatus({ state: 'creating_shortcuts', message: 'Tworzenie skrótów systemowych...' });
        const mainExe = await findMainExe(appDir);
        await createShortcuts(mainExe);
        sendStatus({ state: 'launching', message: 'Uruchamianie Devcord...' });
        await shell.openPath(mainExe);
        sendStatus({ state: 'done', message: 'Instalacja zakończona.' });
        setTimeout(() => app.quit(), 1200);
    }
    finally {
        await fsp.rm(lockFile, { force: true }).catch(() => undefined);
    }
}
function setupIpc() {
    ipcMain.handle('bootstrapper:start-install', async () => {
        try {
            await runPipeline();
            return { ok: true };
        }
        catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown installer error';
            sendStatus({ state: 'error', message: 'Instalacja nie powiodła się.', detail: message });
            return { ok: false, error: message };
        }
    });
}
app.whenReady().then(() => {
    mainWindow = createWindow();
    setupIpc();
});
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin')
        app.quit();
});
//# sourceMappingURL=main.js.map