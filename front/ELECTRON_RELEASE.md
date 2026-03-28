# Devcord Desktop Release (Windows)

## 1) Wymagania

- Node.js 20+
- npm 10+
- Windows x64 (lub CI z targetem Windows)

## 2) Zmienne środowiskowe (desktop updater)

Renderer/Main (Electron app):

- `DEVCORD_UPDATE_BASE_URL` - bazowy URL feedu generic dla `electron-updater` (domyślnie: `https://devcord.ndevelopment.org/api/updates`).
- `DEVCORD_SHORTCUT_MUTE` - opcjonalny skrót mute (domyślnie `Ctrl+Shift+M`).
- `DEVCORD_SHORTCUT_DEAFEN` - opcjonalny skrót deafen (domyślnie `Ctrl+Shift+D`).

Go API (`GET /api/updates/latest`):

- `DEVCORD_UPDATES_BASE_URL` - bazowy URL do artefaktów release.
- `DEVCORD_DESKTOP_LATEST_VERSION` - wersja latest.
- `DEVCORD_DESKTOP_ARTIFACT` - nazwa instalatora (`Devcord-Setup-x.y.z.exe`).
- `DEVCORD_DESKTOP_SHA512` - SHA512 artefaktu.
- `DEVCORD_DESKTOP_SIZE` - rozmiar pliku w bajtach.
- `DEVCORD_DESKTOP_BLOCKMAP_SIZE` - rozmiar blockmapy (opcjonalnie).
- `DEVCORD_DESKTOP_RELEASE_DATE` - RFC3339.
- `DEVCORD_DESKTOP_RELEASE_NOTES` - opis wydania.

## 3) Lokalny development Electron

```bash
npm install
npm run electron:dev
```

To uruchamia Vite + Electron oraz preload bridge IPC.

## 4) Build głównej aplikacji (archiwum .zip)

```bash
npm install
npm run electron:dist:win
```

Artefakt głównej appki pojawi się w `front/release/` jako:

- `Devcord-App-<version>.zip`

Branding i ikony:

- źródło logo: `front/public/devcordlogo.png`
- favicon: `front/public/favicon.ico`
- ikona Windows: `front/build/icons/icon.ico`
- electron-builder używa `build/icons/icon.ico` dla `win`.

## 5) Build bootstrappera (portable .exe, bez NSIS)

```bash
cd ../front-bootstrapper
npm install
npm run dist:win
```

Artefakt bootstrappera:

- `front-bootstrapper/release/Devcord_Installer.exe`
- Jest to portable EXE (React splash widoczny od razu, bez systemowego okna NSIS).

## 6) Publikacja aktualizacji

1. Wystaw pliki pod `https://devcord.ndevelopment.org/updates/win/`:
   - `Devcord_Installer.exe`
   - `Devcord-App-<version>.zip` (lub alias `Devcord-App-latest.zip`)
2. Ustaw/odśwież envy Go API dla `/api/updates/latest`:
   - `DEVCORD_DESKTOP_APP_ARCHIVE`
   - `DEVCORD_DESKTOP_APP_ARCHIVE_SHA512`
   - `DEVCORD_DESKTOP_APP_ARCHIVE_SIZE`
   - `DEVCORD_BOOTSTRAPPER_ARTIFACT`
   - `DEVCORD_BOOTSTRAPPER_URL`
4. Zrestartuj API i zweryfikuj:
   - `GET /api/updates/latest` zwraca aktualną wersję i plik.
   - `GET /api/updates/latest.yml` zwraca feed `generic` dla `electron-updater`.
   - Aplikacja desktop przy starcie sprawdza update, pobiera go i po pobraniu restartuje się automatycznie.

## 7) Routing web

- Landing marketingowy działa na `/`.
- Właściwa aplikacja Devcord działa pod `/app`.
- Przycisk „Otwórz w przeglądarce” kieruje na `https://devcord.ndevelopment.org/app`.
