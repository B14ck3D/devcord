# Devcord Bootstrapper

Lekki instalator Electron+React pobierający paczkę głównej aplikacji i instalujący ją per-user.

## Workflow

1. `GET /api/updates/latest`
2. Pobranie `app_archive.url` (`.7z`)
3. Wypakowanie do `%LOCALAPPDATA%/Devcord/app`
4. Utworzenie skrótów (Desktop, Start Menu)
5. Uruchomienie `Devcord.exe`

## Build

```bash
npm install
npm run dist:win
```

Artefakt:

- `release/Devcord_Installer.exe`
