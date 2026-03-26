# Devcord — architektura systemu (end-to-end)

Dokument opisuje **stan faktyczny repozytorium**: procesy, baza, Redis, API REST, WebSocket czatu, głos (**LiveKit SFU**), DM, znajomi, zadania, front i zmienne środowiskowe. Bez marketingu — tylko to, co wynika z kodu i migracji.

---

## 1. Procesy i binaria

| Proces | Wejście | Port (domyślnie) | Rola |
|--------|---------|------------------|------|
| **devcord-api** | `backend/cmd/api` | `DEVCORD_API_LISTEN` / `FLUX_API_LISTEN`, domyślnie `:12823` | HTTP: auth, serwery, kanały, wiadomości, DM, taski, znajomi, JWT LiveKit, WebSocket `/api/ws/chat` |
| **VoiceKit (LiveKit)** | źródła `backend/devcord-voicekit`, binarka + `deploy/livekit.yaml` | `7880` (HTTP/WS; często za nginx TLS na `:7880`) | SFU — media RTP; osobny proces systemd, nie w Go API |
| **Front (Vite)** | `front/` | build → statyczne pliki | SPA: czat, DM, voice przez `useLiveKitVoice`, RNNoise w `audio/rnnoisePipeline.ts` |

**LiveKit** jest budowany ze źródeł w repo (`devcord-voicekit`); API tylko wystawia tokeny (`LIVEKIT_*`).

---

## 2. Zależności runtime

- **PostgreSQL** — źródło prawdy: użytkownicy, serwery, kanały, wiadomości serwerowe, DM, znajomi, taski (po migracji 007 także „kanał” = konwersacja DM).
- **Redis** — cache list wiadomości (`devcord:msglist:*`, `devcord:dmmsglist:*`), cache tasków DM (`devcord:dmtasks:*`), **Pub/Sub** `devcord:ch:<channel_id>` i `devcord:dm:<conversation_id>` (publish po zdarzeniach; konsument subskrybujący w tym repozytorium — jeśli brak, to tylko przygotowanie pod skalowanie / zewnętrzne narzędzia).
- **JWT** — `JWT_SECRET`; access token w nagłówku `Authorization: Bearer` (REST i query do WS).
- **ChatHub (in-process)** — mapy połączeń WebSocket: kanały `ch[channelID]` i DM `dm[convID]`; broadcast jest **lokalny dla instancji API**.

---

## 3. Schemat bazy (migracje 001–007)

Kolejność: `001_init` → `002_server_invites` → `003_user_profiles` → `004_dm` → `005_friends` → `006_dm_tasks_and_calls` → `007_unify_tasks_and_drop_dm_calls`.

### 3.1 Rdzeń (001)

- **users** — id (snowflake), email, hash hasła, display_name, nick, weryfikacja email.
- **servers**, **categories**, **channels** (`channel_type`, `server_id`, …).
- **server_members**, **roles**, **member_roles** — członkostwo i uprawnienia bitmask w `roles.permissions`.
- **messages** — `channel_id` → kanał tekstowy (FK do `channels`).
- **tasks** (001) — `server_id NOT NULL`, `channel_id` opcjonalnie FK do `channels`.

### 3.2 Zaproszenia (002)

- **server_invites** — kod, limit użyć, wygaśnięcie.

### 3.3 Profile (003)

- **users**: `avatar_url`, `nick_color`, `nick_glow`.

### 3.4 DM (004)

- **dm_conversations** — jedna konwersacja na parę `(user_a, user_b)` z `user_a < user_b`, UNIQUE.
- **dm_messages** — `conversation_id`, `author_id`, treść, czasy.

### 3.5 Znajomi (005)

- **friend_requests** — para `(from_user_id, to_user_id)` unikalna, bez self.
- **friendships** — para `(user_low, user_high)` uporządkowana, unikalna.

### 3.6 DM taski i sesje połączeń (006) — stan przed 007

- **dm_tasks** — zadania pod konwersacją (później zlane do `tasks`).
- **dm_call_sessions** — historia sesji w DB (007 to **usuwa**).

### 3.7 Unifikacja tasków i koniec trwałych sesji połączeń DM (007)

- `tasks.server_id` — **nullable** (DM bez serwera).
- Usunięcie FK `tasks.channel_id` → `channels`, żeby `channel_id` mógł przechowywać **ID konwersacji DM** (ta sama kolumna co dla kanału serwera — rozróżnienie kontekstem: zapytania filtrują po `server_id` IS NULL / NOT NULL lub po członkostwie).
- Dane z `dm_tasks` kopiowane do `tasks` (`channel_id = conversation_id`).
- `DROP dm_tasks`, `DROP dm_call_sessions`.

**Wniosek:** taski serwerowe i DM są w **jednej tabeli `tasks`**. Dla DM: `server_id IS NULL`, `channel_id` = `dm_conversations.id`.

---

## 4. API HTTP (`devcordapi.Router` — `app.go`)

### 4.1 Publiczne

- `GET /health`, `GET /api/ping`
- `POST /api/auth/register`, `verify`, `login`, `refresh`

### 4.2 Chronione (`authMW`)

- Profil: `GET/PUT /api/auth/me`
- Serwery: lista, tworzenie, join, leave, zaproszenia
- Kategorie i kanały: CRUD
- Wiadomości: `GET/POST /api/channels/{id}/messages`, `DELETE /api/messages/{id}`
- **Taski (uniwersalne REST):** `GET/POST /api/tasks`, `PUT/DELETE /api/tasks/{id}` — logika w `rest.go` uwzględnia serwer i opcjonalnie kanał/DM
- **Członkowie:** `GET /api/members`
- **LiveKit:** `GET /api/voice/livekit-token` — patrz sekcja Voice
- **DM:** `POST /api/dm/conversations` (open/create), `GET` lista, `GET/POST .../messages`, taski pod `/dm/conversations/{id}/tasks`, `PUT/DELETE /api/dm/tasks/{id}`, **połączenia:** `POST .../calls`, `POST /api/dm/calls/{id}/{action}` (`accept` | `reject` | `end`)
- **Znajomi:** request, listy incoming/outgoing, accept/reject, lista znajomych

### 4.3 WebSocket czatu

- `GET /api/ws/chat?token=<JWT>` — upgrade; brak tokenu = 401.

---

## 5. WebSocket czatu — kontrakt

**Klient → serwer** (`ws_chat.go`): m.in. `subscribe` / `subscribe_dm`, `typing` / `typing_dm` (szczegóły typów w kodzie `wsClientMsg`).

**Serwer → klient:** JSON z polem `type`, np.:

- `message` — payload z `channel_id` **lub** `conversation_id` (DM)
- `typing` — kanał lub DM
- `user_updated` — globalnie (np. avatar, nick)
- Zdarzenia DM z `rest_dm_tasks_calls.go`: `dm_task_created` / `dm_task_updated` / `dm_task_deleted`, `dm_call_state` (ringing, connected, rejected, ended)

**ChatHub** trzyma subskrypcje per kanał i per `conversation_id` DM. Redis **Publish** duplikuje treść zdarzeń na kanały `devcord:ch:*` i `devcord:dm:*` — rozpropagowanie na **inną instancję API** wymagałoby osobnego subskrybenta Redis podłączonego do tego samego Hub (w kodzie opisanym jednym procesie broadcast idzie wyłącznie przez Hub).

---

## 6. Cache Redis (wiadomości i taski DM)

- Listy wiadomości: `devcord:msglist:<channel_id>`, `devcord:dmmsglist:<conv_id>` — LPUSH + LTRIM (max ~200 wpisów w kodzie msgcache).
- Taski DM: `devcord:dmtasks:<conv_id>` — invalidacja przy mutacjach.
- Odczyt list czatu często najpierw z Redis; przy pustym cache — Postgres + ponowne zapełnienie cache.

---

## 7. DM — zachowanie

### 7.1 Konwersacja

- Utworzenie: `POST /api/dm/conversations` z `peer_user_id` — normalizacja `user_a`/`user_b`, INSERT lub SELECT istniejącego wiersza.
- Dostęp: `dmMember(uid, convID)` = użytkownik jest `user_a` lub `user_b`.

### 7.2 Wiadomości

- Trwały zapis: `dm_messages`; push do Redis cache; broadcast WebSocket do subskrybentów konwersacji; opcjonalnie Redis Publish.

### 7.3 Taski w DM

- Tabela: **`tasks`** z `server_id NULL`, `channel_id = conversation_id`.
- Endpointy `/api/dm/conversations/{id}/tasks` mapują na tę samą tabelę co ogólne `/api/tasks` (z kontrolą członkostwa DM).
- Po zmianach: `writeDmEvent` → Hub `BroadcastDm` + Redis `Publish` na `devcord:dm:<id>`.

### 7.4 Połączenia głosowe / „ringing” (bez DB sesji po 007)

- **Utworzenie rozmowy:** `POST /api/dm/conversations/{id}/calls` — generuje `callId` (snowflake), emituje `dm_call_state` ze statusem `ringing`, `fromUserId` / `toUserId`, `kind` (audio/video).
- **Akcje:** `POST /api/dm/calls/{callId}/{accept|reject|end}` z body m.in. `conversationId`, `fromUserId`, `toUserId`; dla `accept`/`reject` tylko **callee**; dla `end` caller lub callee.
- **Zakończenie (`end`):** event `dm_call_state` ze statusem `ended`; dodatkowo **INSERT** do `dm_messages` treści systemowej z czasem trwania (z body `durationSec`), cache Redis, broadcast WS jak zwykła wiadomość.
- **Brak** trwałej tabeli sesji po migracji 007 — stan połączenia jest **event-driven** (WS + ewentualnie UI), media idą przez **LiveKit** (osobny flow tokenów).

---

## 8. Voice — LiveKit (SFU)

- Wymaga env w API: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`. Puste = `GET /api/voice/livekit-token` zwraca **503** „livekit not configured”.
- Front: **`useLiveKitVoice`** (zawsze przy API) + **`useVoiceRoomMock`** (tylko tryb demo bez `VITE_API_URL`). Brak meshu, brak `VITE_VOICE_TRANSPORT` / `VITE_VOICE_HTTP_BASE`.
- **Token:** `GET /api/voice/livekit-token?channel_id=<id>` — kanał musi być **voice**; uprawnienie co najmniej czytanie kanału (`PermReadMessages`); pokój: `devcord_<server_id>_<channel_id>`.
- **DM:** `?dm_conversation_id=<id>` — `dmMember`; pokój: `dm_<conversation_id>`; identity użytkownika = string ID użytkownika.
- JWT LiveKit: ważność **15 minut** (kod w `rest_voice.go`).

### 8.1 TURN / ICE

- Konfiguracja po stronie **LiveKit** (`rtc` w yaml / operator). Szczegóły: `deploy/VOICE_ARCHITECTURE.md`.

### 8.2 RNNoise (front)

- Pakiet `@shiguredo/noise-suppression`, pipeline w `front/audio/rnnoisePipeline.ts` — `prepareMicTrackWithRnnoise` przed `publishTrack` w `useLiveKitVoice`. `getUserMedia` ma wyłączone wbudowane filtry przeglądarki, żeby RNNoise dostał surowy sygnał.
- Przełącznik w ustawieniach audio w `App.tsx` (`rnnoiseEnabled` / `setRnnoiseEnabled`). Zmiana flagi lub urządzenia mikrofonu przy aktywnym pokoju odtwarza połączenie (effect w hooku).

---

## 9. Uprawnienia i snowflake

- ID generowane **snowflake** (`internal/snowflake`) — różne typy encji (m.in. wiadomości, taski, konwersacje DM).
- Kanały: sprawdzanie typu voice vs text + bitmask ról przy akcjach na kanałach (np. wysyłka wiadomości — `requireChannelPerm` + `PermSendMessages`).

---

## 10. Front — skrót

- **`App.tsx`** — nawigacja serwer/kanał/DM, URL DM ` /channels/@me/<conversation_id>`, `history.replaceState`, głos: `useLiveKitVoice` + `useVoiceRoomMock`, integracja czatu (`useChatSocket`).
- **`useChatSocket`** — URL `ws(s)://<api host>/api/ws/chat?token=...`, typy payloadów DM (taski, call state).
- **Build:** `VITE_API_URL` — baza API; voice: token z API + `LIVEKIT_URL` po stronie serwera (nie w `VITE_*`).

---

## 11. Migracje — uwagi operacyjne

- Skrypty w `deploy/migrations/*.sql` stosować na właściwej bazie; **007** modyfikuje `tasks` i wymaga uprawnień właściciela tabeli (często uruchomienie jako superużytkownik DB).
- Po **006** musi zajść **007**, żeby schemat był spójny z kodem (jedna tabela `tasks`, brak `dm_call_sessions`).

---

## 12. Relacja komponentów (jednym zdaniem)

**Klient (Vite)** ↔ **HTTPS + WS** ↔ **devcord-api** (Postgres + Redis + ChatHub) **;** głos **LiveKit** (token JWT z API, osobny proces SFU); **DM** = te same API + WS + opcjonalnie pokój LiveKit `dm_<id>`; **taski** = jedna tabela `tasks` z `channel_id` jako kanał serwera lub ID konwersacji DM.

---

## 13. Powiązane pliki w repo

| Temat | Pliki |
|-------|--------|
| Trasy API | `backend/internal/devcordapi/app.go` |
| Konfiguracja | `backend/internal/devcordapi/config.go` |
| LiveKit token | `backend/internal/devcordapi/rest_voice.go` |
| DM REST | `backend/internal/devcordapi/rest_dm.go` |
| DM taski + call events | `backend/internal/devcordapi/rest_dm_tasks_calls.go` |
| WS czat | `backend/internal/devcordapi/ws_chat.go`, `chat_hub.go` |
| Cache | `backend/internal/devcordapi/msgcache.go` |
| LiveKit (VoiceKit) | `backend/devcord-voicekit/`, `deploy/livekit.yaml`, `deploy/livekit.service` |
| Front voice | `front/App.tsx`, `useLiveKitVoice.ts`, `useVoiceRoomMock` (w `App.tsx`), `audio/rnnoisePipeline.ts` |
| Voice docs | `deploy/VOICE_ARCHITECTURE.md` |

---

*Wygenerowany opis odzwierciedla strukturę kodu w momencie utworzenia pliku; przy zmianach w routingu lub migracjach zaktualizuj ten dokument.*
