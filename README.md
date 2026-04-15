🚀 Devcord

Devcord to nowoczesna, wydajna i w pełni niezależna platforma komunikacyjna (czat, głos i wideo) przypominająca Discorda, zbudowana z naciskiem na stabilność, prywatność i jakość audio.

Aplikacja dostępna jest jako klient przeglądarkowy (SPA) oraz dedykowana, natywna aplikacja desktopowa (Electron) z własnym systemem aktualizacji opartym na architekturze Sidecar.

✨ Główne funkcje

💬 Czat w Czasie Rzeczywistym: Błyskawiczna komunikacja oparta na WebSocketach (Go Hub) z systemem Auto-Reconnect (Exponential Backoff) oraz serwerowym Anti-Spamem (Rate Limiting).

🎙️ Krystaliczny Głos (WebRTC): Obsługa pokoi głosowych wspierana przez silnik LiveKit.

🤖 Odszumianie AI (RNNoise): Zaawansowany potok audio zintegrowany z WebAudio API. Wykorzystuje model RNNoise do wycinania szumów z tła, wspierany przez natywne usuwanie echa (DSP) z Chromium.

📺 Natywny Screenshare: Wersja desktopowa używa API desktopCapturer Electrona do udostępniania pojedynczych okien lub pełnych ekranów wraz z opcjonalnym przesyłaniem dźwięku systemowego.

🛡️ Kuloodporny Auto-Updater: Własny instalator / Bootstrapper (Sidecar Architecture). Aktualizacje pobierane są w tle i instalowane przez odizolowany proces, całkowicie eliminując błędy typu EBUSY znane z domyślnego mechanizmu NSIS.

🏗️ Architektura (Monorepo)

Projekt oparty jest o strukturę monorepo, podzieloną na trzy główne fundamenty:

📦 devcord
 ┣ 📂 backend/                   # Główne API w Go (Auth, Kanały, Wiadomości, WebSockets)
 ┃ ┗ 📂 devcord-voicekit/        # Serwer głosowy (Wrapper dla LiveKit)
 ┣ 📂 front/                     # Frontend (React + Vite) & Główny proces Electrona
 ┃ ┣ 📂 src/app/                 # UI, Stan aplikacji, Hooki
 ┃ ┃ ┗ 📂 voice/                 # Zoptymalizowany moduł Voice (Connection, Tracks, Participants)
 ┃ ┗ 📂 electron/                # Kod specyficzny dla desktopu (Preload, IPC, Menu)
 ┗ 📂 front-bootstrapper/        # Autorski Instalator / Sidecar Updater (Osobny proces Electron)


🛠️ Stack Technologiczny

Frontend & Desktop

React 18 (z Vite)

TypeScript

Tailwind CSS

Electron (Desktop wrapper, IPC, Desktop Capturer)

LiveKit Client SDK (WebRTC)

RNNoise WASM (Machine Learning Audio Suppression)

Backend

Go (Golang)

LiveKit Server

WebSockets (Natywna obsługa przez Go z zabezpieczeniami)

Baza Danych (PostgreSQL / SQLite - konfigurowalne przez DATABASE_URL)

🚀 Uruchamianie lokalne (Development)

Upewnij się, że masz zainstalowanego Node.js (v18+) oraz Go (v1.20+).

1. Uruchomienie Backendu (API)

cd backend
# Wymaga ustawionej zmiennej środowiskowej DATABASE_URL
go run ./cmd/api


2. Uruchomienie Frontendu (Wersja Web)

Frontend korzysta z proxy w Vite (przekierowuje /api na backend lokalny 127.0.0.1:12823).

cd front
npm install
npm run dev


3. Uruchomienie aplikacji Desktopowej (Electron)

W osobnym terminalu, upewnij się, że backend i frontend działają:

cd front
npm run electron:start


📦 System Aktualizacji (Sidecar Updater)

Devcord posiada unikalny mechanizm aktualizacji, zaprojektowany z myślą o platformie Windows, by omijać problemy z blokadami plików.

Główna aplikacja (Devcord.exe) pobiera paczkę .zip w tle.

Po kliknięciu "Aktualizuj", główna aplikacja tworzy wyizolowaną kopię Instalatora (DevcordInstaller.exe z modułu front-bootstrapper) i uruchamia ją z flagą --update-mode.

Główna aplikacja wykonuje app.quit(), zwalniając wszystkie pliki i pamięć.

Bootstrapper czeka kilka sekund, upewnia się, że procesy zostały zamknięte (wymusza taskkill), agresywnie podmienia pliki (Expand-Archive), a następnie samoczynnie uruchamia zaktualizowaną wersję.

🤝 Kontrybucja

Pull requesty są mile widziane. W przypadku większych zmian, proszę najpierw otworzyć Issue, aby przedyskutować planowaną funkcjonalność.

Szczególną uwagę przy wkładzie w moduł Voice (front/src/app/voice/) należy zwrócić na unikanie pętli re-renderowania Reacta oraz prewencję wycieków pamięci związanych z elementami <audio> w DOM.

Devcord - Stworzone z pasją do stabilnego kodu.

Autorem i wlaścicielem calego kodu jest Bl4ck3d / Igor Turos-Matysiak
