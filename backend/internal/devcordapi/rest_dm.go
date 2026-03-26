package devcordapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"webrtc/signaling/internal/snowflake"
)

func (a *App) dmMember(ctx context.Context, uid, convID int64) (ok bool, err error) {
	var one int
	qerr := a.pool.QueryRow(ctx,
		`SELECT 1 FROM dm_conversations WHERE id = $1 AND (user_a = $2 OR user_b = $2)`,
		convID, uid,
	).Scan(&one)
	if qerr == pgx.ErrNoRows {
		return false, nil
	}
	if qerr != nil {
		return false, qerr
	}
	return true, nil
}

type openDmBody struct {
	PeerUserID string `json:"peer_user_id"`
}

func (a *App) handleOpenOrCreateDmConversation(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body openDmBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	peer, err := parseID(body.PeerUserID)
	if err != nil || peer == uid {
		jsonErr(w, http.StatusBadRequest, "peer_user_id")
		return
	}
	ctx := r.Context()
	var peerOk int
	if err := a.pool.QueryRow(ctx, `SELECT 1 FROM users WHERE id = $1`, peer).Scan(&peerOk); err != nil {
		if err == pgx.ErrNoRows {
			jsonErr(w, http.StatusNotFound, "user")
			return
		}
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	ua, ub := uid, peer
	if ua > ub {
		ua, ub = ub, ua
	}
	var cid int64
	err = a.pool.QueryRow(ctx, `SELECT id FROM dm_conversations WHERE user_a = $1 AND user_b = $2`, ua, ub).Scan(&cid)
	if err != nil && err != pgx.ErrNoRows {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	if err == pgx.ErrNoRows {
		cid, err = a.gen.Next(snowflake.TypeDmConversation)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "id")
			return
		}
		if _, err = a.pool.Exec(ctx, `INSERT INTO dm_conversations (id, user_a, user_b) VALUES ($1,$2,$3)`, cid, ua, ub); err != nil {
			jsonErr(w, http.StatusInternalServerError, "insert")
			return
		}
	}
	a.writeDmConversationPeer(w, ctx, uid, cid)
}

func (a *App) writeDmConversationPeer(w http.ResponseWriter, ctx context.Context, me, convID int64) {
	var peerID int64
	err := a.pool.QueryRow(ctx,
		`SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END FROM dm_conversations WHERE id = $2 AND (user_a = $1 OR user_b = $1)`,
		me, convID,
	).Scan(&peerID)
	if err == pgx.ErrNoRows {
		jsonErr(w, http.StatusNotFound, "conversation")
		return
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	var displayName string
	var avatarURL *string
	_ = a.pool.QueryRow(ctx, `SELECT display_name, avatar_url FROM users WHERE id = $1`, peerID).Scan(&displayName, &avatarURL)
	peerMap := map[string]interface{}{
		"id":   strconv.FormatInt(peerID, 10),
		"name": displayName,
	}
	if avatarURL != nil && *avatarURL != "" {
		peerMap["avatar_url"] = *avatarURL
	}
	jsonWrite(w, http.StatusOK, map[string]interface{}{
		"id":   strconv.FormatInt(convID, 10),
		"peer": peerMap,
	})
}

func (a *App) handleListDmConversations(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT c.id,
			CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END AS peer_id,
			u.display_name,
			u.avatar_url,
			lm.content,
			lm.id,
			lm.created_at
		FROM dm_conversations c
		JOIN users u ON u.id = CASE WHEN c.user_a = $1 THEN c.user_b ELSE c.user_a END
		LEFT JOIN LATERAL (
			SELECT m.id, m.content, m.created_at
			FROM dm_messages m
			WHERE m.conversation_id = c.id
			ORDER BY m.id DESC
			LIMIT 1
		) lm ON true
		WHERE c.user_a = $1 OR c.user_b = $1
		ORDER BY COALESCE(lm.created_at, c.created_at) DESC`, uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var cid, peerID int64
		var peerName string
		var avatar *string
		var lastContent *string
		var lastID *int64
		var lastAt *time.Time
		if rows.Scan(&cid, &peerID, &peerName, &avatar, &lastContent, &lastID, &lastAt) != nil {
			continue
		}
		pMap := map[string]interface{}{
			"id":   strconv.FormatInt(peerID, 10),
			"name": peerName,
		}
		if avatar != nil && *avatar != "" {
			pMap["avatar_url"] = *avatar
		}
		item := map[string]interface{}{
			"id":   strconv.FormatInt(cid, 10),
			"peer": pMap,
		}
		if lastContent != nil && lastID != nil && lastAt != nil {
			item["last_message"] = map[string]interface{}{
				"id":      strconv.FormatInt(*lastID, 10),
				"content": *lastContent,
				"time":    chatRowTime(*lastAt),
			}
		}
		list = append(list, item)
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

func (a *App) handleListDmMessages(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	convID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
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
	cached, _ := a.redisListDmMessages(ctx, convID, 50)
	if len(cached) > 0 {
		out := make([]map[string]interface{}, 0, len(cached))
		for i := len(cached) - 1; i >= 0; i-- {
			m := cached[i]
			t, _ := time.Parse(time.RFC3339Nano, m.CreatedAt)
			if t.IsZero() {
				t, _ = time.Parse(time.RFC3339, m.CreatedAt)
			}
			out = append(out, map[string]interface{}{
				"id": m.ID, "userId": m.UserID, "time": chatRowTime(t), "content": m.Content, "isEdited": m.IsEdited,
			})
		}
		jsonWrite(w, http.StatusOK, out)
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT m.id, m.author_id, m.content, m.created_at, m.edited_at
		FROM dm_messages m
		WHERE m.conversation_id = $1
		ORDER BY m.id DESC
		LIMIT 50`, convID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	type row struct {
		id, author int64
		content    string
		created    time.Time
		edited     *time.Time
	}
	var buf []row
	for rows.Next() {
		var x row
		if rows.Scan(&x.id, &x.author, &x.content, &x.created, &x.edited) != nil {
			continue
		}
		buf = append(buf, x)
	}
	rows.Close()
	_ = a.redisInvalidateDmConversation(ctx, convID)
	for i := 0; i < len(buf); i++ {
		x := buf[i]
		cm := cachedDmMessage{
			ID: strconv.FormatInt(x.id, 10), ConversationID: strconv.FormatInt(convID, 10),
			UserID: strconv.FormatInt(x.author, 10), Content: x.content,
			CreatedAt: x.created.UTC().Format(time.RFC3339Nano), IsEdited: x.edited != nil,
		}
		_ = a.redisPushDmMessage(ctx, convID, cm)
	}
	out := make([]map[string]interface{}, 0, len(buf))
	for i := len(buf) - 1; i >= 0; i-- {
		x := buf[i]
		out = append(out, map[string]interface{}{
			"id": strconv.FormatInt(x.id, 10), "userId": strconv.FormatInt(x.author, 10),
			"time": chatRowTime(x.created), "content": x.content, "isEdited": x.edited != nil,
		})
	}
	jsonWrite(w, http.StatusOK, out)
}

func (a *App) handleCreateDmMessage(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	convID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body postMsgBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	content := strings.TrimSpace(body.Content)
	if content == "" {
		jsonErr(w, http.StatusBadRequest, "content")
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
	mid, err := a.gen.Next(snowflake.TypeMessage)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	var created time.Time
	if err := a.pool.QueryRow(ctx, `
		INSERT INTO dm_messages (id, conversation_id, author_id, content) VALUES ($1,$2,$3,$4)
		RETURNING created_at`, mid, convID, uid, content).Scan(&created); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	cm := cachedDmMessage{
		ID: strconv.FormatInt(mid, 10), ConversationID: strconv.FormatInt(convID, 10),
		UserID: strconv.FormatInt(uid, 10), Content: content,
		CreatedAt: created.UTC().Format(time.RFC3339Nano), IsEdited: false,
	}
	_ = a.redisPushDmMessage(ctx, convID, cm)
	payload, _ := json.Marshal(map[string]interface{}{
		"type": "message",
		"payload": map[string]interface{}{
			"id": cm.ID, "conversation_id": cm.ConversationID, "user_id": cm.UserID, "content": content,
			"time": chatRowTime(created), "created_at": cm.CreatedAt, "is_edited": false,
		},
	})
	a.chathub.BroadcastDm(convID, payload)
	_ = a.rdb.Publish(ctx, "devcord:dm:"+strconv.FormatInt(convID, 10), string(payload)).Err()
	jsonWrite(w, http.StatusCreated, map[string]interface{}{
		"id": cm.ID, "userId": cm.UserID, "time": chatRowTime(created), "content": content,
	})
}
