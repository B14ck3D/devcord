package devcordapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/livekit/protocol/auth"
	"webrtc/signaling/internal/snowflake"
)

func boolPtr(v bool) *bool { return &v }

// GET /api/voice/livekit-token?channel_id=... lub ?dm_conversation_id=...
func (a *App) handleVoiceLiveKitToken(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		jsonErr(w, http.StatusMethodNotAllowed, "method")
		return
	}
	key := strings.TrimSpace(a.cfg.LiveKitAPIKey)
	sec := strings.TrimSpace(a.cfg.LiveKitAPISecret)
	url := strings.TrimSpace(a.cfg.LiveKitURL)
	if key == "" || sec == "" || url == "" {
		jsonErr(w, http.StatusServiceUnavailable, "livekit not configured")
		return
	}
	uid := userIDFromReq(r)
	dmConvIDStr := strings.TrimSpace(r.URL.Query().Get("dm_conversation_id"))
	if dmConvIDStr != "" {
		convID, err := strconv.ParseInt(dmConvIDStr, 10, 64)
		if err != nil || convID <= 0 {
			jsonErr(w, http.StatusBadRequest, "dm_conversation_id")
			return
		}
		ctx := r.Context()
		ok, err := a.dmMember(ctx, uid, convID)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "query")
			return
		}
		if !ok {
			jsonErr(w, http.StatusForbidden, "forbidden")
			return
		}
		roomName := fmt.Sprintf("dm_%d", convID)
		identity := strconv.FormatInt(uid, 10)
		tok, err := auth.NewAccessToken(key, sec).
			AddGrant(&auth.VideoGrant{
				RoomJoin:     true,
				Room:         roomName,
				CanPublish:   boolPtr(true),
				CanSubscribe: boolPtr(true),
			}).
			SetIdentity(identity).
			SetValidFor(15 * time.Minute).
			ToJWT()
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "token")
			return
		}
		jsonWrite(w, http.StatusOK, map[string]interface{}{
			"token":     tok,
			"url":       url,
			"room_name": roomName,
			"mode":      "dm",
		})
		return
	}
	chIDStr := strings.TrimSpace(r.URL.Query().Get("channel_id"))
	if chIDStr == "" {
		jsonErr(w, http.StatusBadRequest, "channel_id required")
		return
	}
	chID, err := strconv.ParseInt(chIDStr, 10, 64)
	if err != nil || chID <= 0 {
		jsonErr(w, http.StatusBadRequest, "channel_id")
		return
	}
	ctx := r.Context()
	var chType int
	var sid int64
	err = a.pool.QueryRow(ctx, `SELECT channel_type, server_id FROM channels WHERE id = $1`, chID).Scan(&chType, &sid)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "channel")
		return
	}
	if !isVoiceChannelType(chType, chID) {
		jsonErr(w, http.StatusBadRequest, "not a voice channel")
		return
	}
	_, ok, err := a.requireChannelPerm(ctx, uid, chID, PermReadMessages)
	if err != nil || !ok {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	roomName := fmt.Sprintf("devcord_%d_%d", sid, chID)
	identity := strconv.FormatInt(uid, 10)
	tok, err := auth.NewAccessToken(key, sec).
		AddGrant(&auth.VideoGrant{
			RoomJoin:     true,
			Room:         roomName,
			CanPublish:   boolPtr(true),
			CanSubscribe: boolPtr(true),
		}).
		SetIdentity(identity).
		SetValidFor(15 * time.Minute).
		ToJWT()
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "token")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]interface{}{
		"token":     tok,
		"url":       url,
		"room_name": roomName,
	})
}

func isVoiceChannelType(chType int, id int64) bool {
	if chType == 1 {
		return true
	}
	if chType == 0 && snowflake.EntityType(id) == snowflake.TypeVoiceChannel {
		return true
	}
	return false
}
