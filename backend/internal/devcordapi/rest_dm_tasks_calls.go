package devcordapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"webrtc/signaling/internal/snowflake"
)

type dmTaskRow struct {
	ID            string `json:"id"`
	ConversationID string `json:"conversationId"`
	Title         string `json:"title"`
	AssigneeID    string `json:"assigneeId"`
	Completed     bool   `json:"completed"`
	SourceMsgID   string `json:"sourceMsgId,omitempty"`
}

func (a *App) writeDmEvent(ctx context.Context, convID int64, t string, payload map[string]interface{}) {
	msg, err := json.Marshal(map[string]interface{}{
		"type":    t,
		"payload": payload,
	})
	if err != nil {
		return
	}
	a.chathub.BroadcastDm(convID, msg)
	_ = a.rdb.Publish(ctx, "devcord:dm:"+strconv.FormatInt(convID, 10), string(msg)).Err()
}

func (a *App) handleListDmTasks(w http.ResponseWriter, r *http.Request) {
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
	cached, _ := a.redisListDmTasks(ctx, convID, 100)
	if len(cached) > 0 {
		out := make([]map[string]interface{}, 0, len(cached))
		for _, x := range cached {
			item := map[string]interface{}{
				"id":             x.ID,
				"conversationId": x.ConversationID,
				"title":          x.Title,
				"assigneeId":     x.AssigneeID,
				"completed":      x.Completed,
			}
			if x.SourceMsgID != "" {
				item["sourceMsgId"] = x.SourceMsgID
			}
			out = append(out, item)
		}
		jsonWrite(w, http.StatusOK, out)
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT id, title, assignee_id, completed, source_msg_id
		FROM tasks
		WHERE channel_id = $1
		ORDER BY created_at DESC`, convID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	out := make([]map[string]interface{}, 0, 16)
	for rows.Next() {
		var id int64
		var title string
		var assignee *int64
		var completed bool
		var source *int64
		if rows.Scan(&id, &title, &assignee, &completed, &source) != nil {
			continue
		}
		item := map[string]interface{}{
			"id":             strconv.FormatInt(id, 10),
			"conversationId": strconv.FormatInt(convID, 10),
			"title":          title,
			"assigneeId":     "",
			"completed":      completed,
		}
		cacheRow := cachedDmTask{
			ID:             strconv.FormatInt(id, 10),
			ConversationID: strconv.FormatInt(convID, 10),
			Title:          title,
			Completed:      completed,
		}
		if assignee != nil {
			v := strconv.FormatInt(*assignee, 10)
			item["assigneeId"] = v
			cacheRow.AssigneeID = v
		}
		if source != nil {
			v := strconv.FormatInt(*source, 10)
			item["sourceMsgId"] = v
			cacheRow.SourceMsgID = v
		}
		out = append(out, item)
		_ = a.redisPushDmTask(ctx, convID, cacheRow)
	}
	jsonWrite(w, http.StatusOK, out)
}

type dmTaskCreateBody struct {
	Title       string `json:"title"`
	AssigneeID  string `json:"assigneeId"`
	SourceMsgID string `json:"sourceMsgId"`
}

func (a *App) handleCreateDmTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	convID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body dmTaskCreateBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	title := strings.TrimSpace(body.Title)
	if title == "" {
		jsonErr(w, http.StatusBadRequest, "title")
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
	id, err := a.gen.Next(snowflake.TypeTask)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	var assignee *int64
	if body.AssigneeID != "" {
		if x, e := parseID(body.AssigneeID); e == nil {
			assignee = &x
		}
	}
	var source *int64
	if body.SourceMsgID != "" {
		if x, e := parseID(body.SourceMsgID); e == nil {
			source = &x
		}
	}
	if _, err := a.pool.Exec(ctx,
		`INSERT INTO tasks (id, server_id, channel_id, title, assignee_id, source_msg_id) VALUES ($1,NULL,$2,$3,$4,$5)`,
		id, convID, title, assignee, source,
	); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	_ = a.redisInvalidateDmTasks(ctx, convID)
	payload := map[string]interface{}{
		"id":             strconv.FormatInt(id, 10),
		"conversationId": strconv.FormatInt(convID, 10),
		"title":          title,
		"assigneeId":     "",
		"completed":      false,
	}
	if assignee != nil {
		payload["assigneeId"] = strconv.FormatInt(*assignee, 10)
	}
	if source != nil {
		payload["sourceMsgId"] = strconv.FormatInt(*source, 10)
	}
	a.writeDmEvent(ctx, convID, "dm_task_created", payload)
	jsonWrite(w, http.StatusCreated, payload)
}

func (a *App) handleUpdateDmTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	tid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body struct {
		Completed *bool  `json:"completed"`
		Title     string `json:"title"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	ctx := r.Context()
	var convID int64
	if err := a.pool.QueryRow(ctx, `SELECT channel_id FROM tasks WHERE id = $1`, tid).Scan(&convID); err != nil {
		jsonErr(w, http.StatusNotFound, "task")
		return
	}
	ok, err := a.dmMember(ctx, uid, convID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	if !ok {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if body.Completed != nil {
		if _, err := a.pool.Exec(ctx, `UPDATE tasks SET completed = $1 WHERE id = $2`, *body.Completed, tid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update")
			return
		}
	}
	title := strings.TrimSpace(body.Title)
	if title != "" {
		if _, err := a.pool.Exec(ctx, `UPDATE tasks SET title = $1 WHERE id = $2`, title, tid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update")
			return
		}
	}
	_ = a.redisInvalidateDmTasks(ctx, convID)
	a.writeDmEvent(ctx, convID, "dm_task_updated", map[string]interface{}{
		"id":             strconv.FormatInt(tid, 10),
		"conversationId": strconv.FormatInt(convID, 10),
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleDeleteDmTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	tid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	var convID int64
	if err := a.pool.QueryRow(ctx, `SELECT channel_id FROM tasks WHERE id = $1`, tid).Scan(&convID); err != nil {
		jsonErr(w, http.StatusNotFound, "task")
		return
	}
	ok, err := a.dmMember(ctx, uid, convID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	if !ok {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, tid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	_ = a.redisInvalidateDmTasks(ctx, convID)
	a.writeDmEvent(ctx, convID, "dm_task_deleted", map[string]interface{}{
		"id":             strconv.FormatInt(tid, 10),
		"conversationId": strconv.FormatInt(convID, 10),
	})
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleCreateDmCall(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	convID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body struct {
		Kind string `json:"kind"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
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
	var ua, ub int64
	if err := a.pool.QueryRow(ctx, `SELECT user_a, user_b FROM dm_conversations WHERE id = $1`, convID).Scan(&ua, &ub); err != nil {
		jsonErr(w, http.StatusNotFound, "conversation")
		return
	}
	callee := ua
	if ua == uid {
		callee = ub
	}
	callID, err := a.gen.Next(snowflake.TypeDmConversation)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	kind := strings.TrimSpace(body.Kind)
	if kind == "" {
		kind = "audio"
	}
	a.writeDmEvent(ctx, convID, "dm_call_state", map[string]interface{}{
		"callId":          strconv.FormatInt(callID, 10),
		"conversationId":  strconv.FormatInt(convID, 10),
		"fromUserId":      strconv.FormatInt(uid, 10),
		"toUserId":        strconv.FormatInt(callee, 10),
		"status":          "ringing",
		"kind":            kind,
	})
	jsonWrite(w, http.StatusCreated, map[string]interface{}{
		"id":             strconv.FormatInt(callID, 10),
		"conversationId": strconv.FormatInt(convID, 10),
		"status":         "ringing",
		"kind":           kind,
	})
}

func (a *App) handleDmCallAction(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	callID, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	action := strings.TrimSpace(chi.URLParam(r, "action"))
	if action == "" {
		jsonErr(w, http.StatusBadRequest, "action")
		return
	}
	var body struct {
		ConversationID string `json:"conversationId"`
		FromUserID     string `json:"fromUserId"`
		ToUserID       string `json:"toUserId"`
		DurationSec    int    `json:"durationSec"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	ctx := r.Context()
	convID, err := parseID(body.ConversationID)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "conversationId")
		return
	}
	callerID, _ := parseID(body.FromUserID)
	calleeID, _ := parseID(body.ToUserID)
	ok, err := a.dmMember(ctx, uid, convID)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	if !ok {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	switch action {
	case "accept":
		if uid != calleeID {
			jsonErr(w, http.StatusForbidden, "forbidden")
			return
		}
	case "reject":
		if uid != calleeID {
			jsonErr(w, http.StatusForbidden, "forbidden")
			return
		}
	case "end":
		if uid != calleeID && uid != callerID {
			jsonErr(w, http.StatusForbidden, "forbidden")
			return
		}
	default:
		jsonErr(w, http.StatusBadRequest, "action")
		return
	}
	status := map[string]string{"accept": "connected", "reject": "rejected", "end": "ended"}[action]
	a.writeDmEvent(ctx, convID, "dm_call_state", map[string]interface{}{
		"callId":         strconv.FormatInt(callID, 10),
		"conversationId": strconv.FormatInt(convID, 10),
		"fromUserId":     strconv.FormatInt(callerID, 10),
		"toUserId":       strconv.FormatInt(calleeID, 10),
		"status":         status,
	})
	if action == "end" {
		minutes := float64(body.DurationSec) / 60.0
		content := "[SYSTEM] Rozmowa głosowa zakończona. Czas trwania: " + strconv.FormatFloat(minutes, 'f', 1, 64) + " min."
		mid, idErr := a.gen.Next(snowflake.TypeMessage)
		if idErr == nil {
			var created time.Time
			if qErr := a.pool.QueryRow(ctx, `
				INSERT INTO dm_messages (id, conversation_id, author_id, content) VALUES ($1,$2,$3,$4)
				RETURNING created_at`, mid, convID, uid, content).Scan(&created); qErr == nil {
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
			}
		}
	}
	w.WriteHeader(http.StatusNoContent)
}
