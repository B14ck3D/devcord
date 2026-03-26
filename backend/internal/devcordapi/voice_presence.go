package devcordapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/webhook"
	"github.com/redis/go-redis/v9"
	"webrtc/signaling/internal/snowflake"
)

func voicePresenceRedisKey(roomName string) string {
	return "devcord:voice_participants:" + roomName
}

// parseVoiceRoomName rozpoznaje nazwy jak w handleVoiceLiveKitToken: devcord_<serverId>_<channelId> | dm_<convId>
func parseVoiceRoomName(roomName string) (kind string, serverID, channelID, convID int64, ok bool) {
	s := strings.TrimSpace(roomName)
	if s == "" {
		return
	}
	if strings.HasPrefix(s, "dm_") {
		x := strings.TrimPrefix(s, "dm_")
		id, err := strconv.ParseInt(x, 10, 64)
		if err != nil || id <= 0 {
			return
		}
		return "dm", 0, 0, id, true
	}
	const pref = "devcord_"
	if !strings.HasPrefix(s, pref) {
		return
	}
	rest := strings.TrimPrefix(s, pref)
	i := strings.LastIndex(rest, "_")
	if i <= 0 || i >= len(rest)-1 {
		return
	}
	sid, err1 := strconv.ParseInt(rest[:i], 10, 64)
	cid, err2 := strconv.ParseInt(rest[i+1:], 10, 64)
	if err1 != nil || err2 != nil || sid <= 0 || cid <= 0 {
		return
	}
	return "guild", sid, cid, 0, true
}

func isVoiceChannelRow(chType int, id int64) bool {
	if chType == 1 {
		return true
	}
	return chType == 0 && snowflake.EntityType(id) == snowflake.TypeVoiceChannel
}

func (a *App) redisVoiceSAdd(ctx context.Context, roomName, userID string) error {
	key := voicePresenceRedisKey(roomName)
	return a.rdb.SAdd(ctx, key, userID).Err()
}

func (a *App) redisVoiceSRem(ctx context.Context, roomName, userID string) error {
	key := voicePresenceRedisKey(roomName)
	if err := a.rdb.SRem(ctx, key, userID).Err(); err != nil {
		return err
	}
	n, err := a.rdb.SCard(ctx, key).Result()
	if err != nil {
		return err
	}
	if n == 0 {
		return a.rdb.Del(ctx, key).Err()
	}
	return nil
}

func (a *App) redisVoiceDelRoom(ctx context.Context, roomName string) error {
	return a.rdb.Del(ctx, voicePresenceRedisKey(roomName)).Err()
}

func (a *App) redisVoiceSMembers(ctx context.Context, roomName string) ([]string, error) {
	key := voicePresenceRedisKey(roomName)
	members, err := a.rdb.SMembers(ctx, key).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	sort.Strings(members)
	return members, nil
}

func (a *App) broadcastVoiceRoomState(ctx context.Context, roomName string) {
	kind, sid, chID, convID, ok := parseVoiceRoomName(roomName)
	if !ok {
		return
	}
	members, err := a.redisVoiceSMembers(ctx, roomName)
	if err != nil {
		return
	}
	pl := map[string]interface{}{
		"room_name": roomName,
		"user_ids":  members,
	}
	if kind == "guild" {
		pl["channel_id"] = strconv.FormatInt(chID, 10)
		pl["server_id"] = strconv.FormatInt(sid, 10)
	} else {
		pl["conversation_id"] = strconv.FormatInt(convID, 10)
	}
	raw, err := json.Marshal(map[string]interface{}{"type": "voice_room_state", "payload": pl})
	if err != nil {
		return
	}
	if kind == "guild" {
		a.chathub.BroadcastGlobal(raw)
	} else {
		a.chathub.BroadcastDm(convID, raw)
	}
}

func (a *App) voiceInitialStatePayload(ctx context.Context, uid int64) ([]byte, error) {
	channels := make(map[string][]string)
	conversations := make(map[string][]string)

	rows, err := a.pool.Query(ctx, `
		SELECT ch.id, ch.server_id, ch.channel_type
		FROM channels ch
		JOIN server_members m ON m.server_id = ch.server_id
		WHERE m.user_id = $1`, uid)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var id, srv int64
		var ct int
		if rows.Scan(&id, &srv, &ct) != nil {
			continue
		}
		if !isVoiceChannelRow(ct, id) {
			continue
		}
		rn := fmt.Sprintf("devcord_%d_%d", srv, id)
		members, err := a.redisVoiceSMembers(ctx, rn)
		if err != nil || len(members) == 0 {
			continue
		}
		channels[strconv.FormatInt(id, 10)] = members
	}

	drows, err := a.pool.Query(ctx, `
		SELECT id FROM dm_conversations WHERE user_a = $1 OR user_b = $1`, uid)
	if err != nil {
		return nil, err
	}
	defer drows.Close()
	for drows.Next() {
		var convID int64
		if drows.Scan(&convID) != nil {
			continue
		}
		rn := fmt.Sprintf("dm_%d", convID)
		members, err := a.redisVoiceSMembers(ctx, rn)
		if err != nil || len(members) == 0 {
			continue
		}
		conversations[strconv.FormatInt(convID, 10)] = members
	}

	raw, err := json.Marshal(map[string]interface{}{
		"type": "voice_initial_state",
		"payload": map[string]interface{}{
			"channels":       channels,
			"conversations": conversations,
		},
	})
	return raw, err
}

// POST /api/voice/livekit-webhook — podpis LiveKit (Authorization JWT + sha256 body), bez sesji użytkownika.
func (a *App) handleLiveKitWebhook(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimSpace(a.cfg.LiveKitAPIKey)
	sec := strings.TrimSpace(a.cfg.LiveKitAPISecret)
	if key == "" || sec == "" {
		jsonErr(w, http.StatusServiceUnavailable, "livekit not configured")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	ev, err := webhook.ReceiveWebhookEvent(r, auth.NewSimpleKeyProvider(key, sec))
	if err != nil {
		jsonErr(w, http.StatusUnauthorized, "webhook verify")
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()

	roomName := ""
	if ev.Room != nil {
		roomName = strings.TrimSpace(ev.Room.Name)
	}
	if roomName == "" {
		w.WriteHeader(http.StatusOK)
		return
	}

	switch ev.Event {
	case webhook.EventRoomFinished:
		_ = a.redisVoiceDelRoom(ctx, roomName)
		a.broadcastVoiceRoomState(ctx, roomName)

	case webhook.EventParticipantJoined:
		part := ev.Participant
		if part == nil {
			break
		}
		ident := strings.TrimSpace(part.Identity)
		if ident == "" {
			break
		}
		_ = a.redisVoiceSAdd(ctx, roomName, ident)
		a.broadcastVoiceRoomState(ctx, roomName)

	case webhook.EventParticipantLeft:
		part := ev.Participant
		if part == nil {
			break
		}
		ident := strings.TrimSpace(part.Identity)
		if ident == "" {
			break
		}
		_ = a.redisVoiceSRem(ctx, roomName, ident)
		a.broadcastVoiceRoomState(ctx, roomName)
	}

	w.WriteHeader(http.StatusOK)
}
