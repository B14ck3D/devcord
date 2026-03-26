# Architektura głosu (Devcord)

## Wybór silnika (SFU)

**Domyślnie:** mesh WebRTC + sygnalizacja Go (`disc-signaling`) — do małych kanałów.

**Skalowanie / SFU:** wybrany jest **LiveKit** (zgodnie z kierunkiem `for-web-main`):

- Front: `VITE_VOICE_TRANSPORT=livekit` + zalogowany użytkownik (Bearer).
- API: `GET /api/voice/livekit-token?channel_id=...` (wymaga `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`).
- Pokój LiveKit: `devcord_<server_id>_<channel_id>`.

Alternatywy produkcyjne: **mediasoup** (Node), **ion-sfu** (Pion) — wymagają osobnej integracji zamiast `useLiveKitVoice.ts`.

## TURN (coturn)

Mesh i klienci za restrykcyjnym NAT potrzebują **TURN**. Użyj [coturn.conf.example](coturn.conf.example).

Na froncie (mesh):

- `VITE_ICE_SERVERS_JSON` — tablica `RTCIceServer` (zalecane w produkcji), lub
- `VITE_TURN_URLS` + `VITE_TURN_USERNAME` + `VITE_TURN_CREDENTIAL` (krótkożyjące creds z HMAC coturn).

LiveKit często ma własny TURN wbudowany w deployment — skonfiguruj według dokumentacji LiveKit.

## Sygnalizacja mesh — autoryzacja

Gdy ustawisz `**SIGNALING_JWT_SECRET`** lub `**JWT_SECRET**` (ten sam sekret co devcord-api), WebSocket `/ws` wymaga query:

`wss://host/ws?access_token=<JWT_dostępu_devcord>`

Front dokleja token automatycznie, jeśli użytkownik jest zalogowany.

## Wiele instancji `disc-signaling`

Hub trzyma pokoje **w pamięci**. Horyzontalne skalowanie wymaga:

- **sticky session** (ten sam worker dla całej sesji WS), lub
- współdzielonego stanu pokoi (**Redis** / pubsub) i forward wiadomości między instancjami.

## Metryki (mesh)

Hook `useVoiceRoom` zwraca `voiceDiagnostics`: liczba `RTCPeerConnection`, ostatni czas negocjacji, próbki `getStats` (RTT, `packetsLost` audio). Przy `livekit` diagnostyka ma `backend: 'livekit'` i stan połączenia pokoju.

## Rozdział warstw

- **devcord-api** — konta, kanały, JWT pokoju LiveKit.
- **LiveKit** (osobny proces / cluster) — media RTP, bez logiki Discord-like.
- **disc-signaling** — tylko mesh legacy + opcjonalnie cienkie zdarzenia aplikacji.

