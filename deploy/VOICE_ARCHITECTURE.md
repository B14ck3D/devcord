# Architektura głosu (Devcord) — LiveKit SFU

Mesh WebRTC (`disc-signaling`) został usunięty z repozytorium. **Jedyny** transport mediów głosowych/wideo to **self-hosted LiveKit** (SFU).

## Procesy

| Składnik | Rola |
|----------|------|
| **devcord-api** (Go) | REST `GET /api/voice/livekit-token` — JWT pokoju po weryfikacji uprawnień (kanał serwera lub członkostwo DM). |
| **VoiceKit / LiveKit** (binarka z `backend/devcord-voicekit`, config `deploy/livekit.yaml`) | SFU: WebSocket + RTP; klient łączy się z URL zwróconym w tokenie (`LIVEKIT_URL`). |
| **Front** | `useLiveKitVoice` → token → `livekit-client`; mikrofon przez `audio/rnnoisePipeline.ts` (opcjonalnie RNNoise). |

## Zmienne środowiskowe (API)

- `LIVEKIT_URL` — np. `wss://domena:7880` (zgodnie z nginx / TLS).
- `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` — muszą odpowiadać `keys:` w `livekit.yaml`.

Brak konfiguracji LiveKit → endpoint tokena zwraca **503**.

## Pokoje

- **Serwer (voice channel):** `devcord_<server_id>_<channel_id>` — sprawdzenie typu kanału + uprawnień do kanału.
- **DM:** `dm_<conversation_id>` — `dmMember` w Postgres.

Identity w JWT = string ID użytkownika z sesji.

## RNNoise (klient)

- Plik: `front/audio/rnnoisePipeline.ts` — `getUserMedia` z **wyłączonym** `echoCancellation` / `noiseSuppression` / `autoGainControl`, potem łańcuch `@shiguredo/noise-suppression` (fallback: surowy mikrofon).
- Hook: `useLiveKitVoice` przekazuje `rnnoiseEnabled`; przy `publishTrack` używany jest track z pipeline.
- **UI:** przełącznik w ustawieniach audio w `App.tsx` (`rnnoiseEnabled` / `setRnnoiseEnabled`) — okolice sekcji ustawień dźwięku.

Zmiana `rnnoiseEnabled` lub urządzenia mikrofonu przy aktywnym pokoju przełącza efekt połączenia (effect w hooku odtwarza pipeline od zera).

## TURN / ICE

Klienci za NAT korzystają z konfiguracji **LiveKit** (`rtc` w yaml / deployment). Osobny `VITE_ICE_*` na froncie **nie jest** używany — usunięto legacy mesh.

## Nginx

- Front + API: patrz `deploy/nginx-devcord.ndevelopment.org.conf`.
- **WSS LiveKit:** osobny `server` na porcie **7880** (TLS) → `proxy_pass http://127.0.0.1:7880` do procesu LiveKit nasłuchującego lokalnie.

## Powiązane pliki

- `backend/internal/devcordapi/rest_voice.go` — tokeny.
- `front/useLiveKitVoice.ts`, `front/audio/rnnoisePipeline.ts`, `front/App.tsx` (mock offline: `useVoiceRoomMock`).
