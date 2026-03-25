package fluxapi

import (
	"context"
	"crypto/rand"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"webrtc/signaling/internal/snowflake"
)

func parseID(s string) (int64, error) {
	return strconv.ParseInt(strings.TrimSpace(s), 10, 64)
}

func randomInvite(n int) string {
	const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = letters[int(b[i])%len(letters)]
	}
	return string(b)
}

// Uzupełnia pusty invite_code (np. stare rekordy); linki /join/… powinny używać krótkiego kodu zamiast samego id.
func (a *App) ensureServerInviteCode(ctx context.Context, serverID int64) string {
	for attempt := 0; attempt < 12; attempt++ {
		var cur string
		if err := a.pool.QueryRow(ctx, `SELECT COALESCE(invite_code, '') FROM servers WHERE id = $1`, serverID).Scan(&cur); err != nil {
			return ""
		}
		cur = strings.TrimSpace(cur)
		if cur != "" {
			return cur
		}
		cand := randomInvite(8)
		_, _ = a.pool.Exec(ctx, `UPDATE servers SET invite_code = $1 WHERE id = $2 AND (invite_code IS NULL OR invite_code = '')`, cand, serverID)
	}
	var out string
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(invite_code, '') FROM servers WHERE id = $1`, serverID).Scan(&out)
	return strings.TrimSpace(out)
}

func (a *App) handleListServers(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT s.id, s.name, COALESCE(s.icon_key,''), COALESCE(s.color,''), COALESCE(s.glow,''), COALESCE(s.invite_code,'')
		FROM servers s
		JOIN server_members m ON m.server_id = s.id
		WHERE m.user_id = $1
		ORDER BY s.created_at`, uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id int64
		var name, iconKey, color, glow, invite string
		if rows.Scan(&id, &name, &iconKey, &color, &glow, &invite) != nil {
			continue
		}
		invite = strings.TrimSpace(invite)
		if invite == "" {
			invite = a.ensureServerInviteCode(r.Context(), id)
		}
		list = append(list, map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "name": name, "iconKey": iconKey, "icon": iconKey,
			"color": color, "glow": glow, "active": true, "inviteCode": invite,
		})
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

type createServerBody struct {
	Name   string `json:"name"`
	Icon   string `json:"icon"`
	Color  string `json:"color"`
	Glow   string `json:"glow"`
	Active bool   `json:"active"`
}

func (a *App) handleCreateServer(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body createServerBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		jsonErr(w, http.StatusBadRequest, "name")
		return
	}
	iconKey := strings.TrimSpace(body.Icon)
	if iconKey == "" {
		iconKey = "Zap"
	}
	color := body.Color
	if color == "" {
		color = "#00eeff"
	}
	glow := body.Glow
	if glow == "" {
		glow = "0 0 15px rgba(0,238,255,0.4)"
	}
	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return
	}
	defer tx.Rollback(ctx)

	sid, err := a.gen.Next(snowflake.TypeServer)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	invite := randomInvite(8)
	if _, err := tx.Exec(ctx, `INSERT INTO servers (id, owner_id, name, icon_key, color, glow, invite_code) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		sid, uid, name, iconKey, color, glow, invite); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert server")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1,$2)`, sid, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "member")
		return
	}
	adminRID, err := a.gen.Next(snowflake.TypeRole)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	memberRID, err := a.gen.Next(snowflake.TypeRole)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO roles (id, server_id, name, permissions, position) VALUES ($1,$2,$3,$4,$5)`,
		adminRID, sid, "Admin", permFull, 0); err != nil {
		jsonErr(w, http.StatusInternalServerError, "role")
		return
	}
	memberPerms := PermReadMessages | PermSendMessages
	if _, err := tx.Exec(ctx, `INSERT INTO roles (id, server_id, name, permissions, position) VALUES ($1,$2,$3,$4,$5)`,
		memberRID, sid, "Member", memberPerms, 1); err != nil {
		jsonErr(w, http.StatusInternalServerError, "role")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO member_roles (user_id, server_id, role_id) VALUES ($1,$2,$3)`, uid, sid, adminRID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "member role")
		return
	}
	catID, err := a.gen.Next(snowflake.TypeCategory)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	chID, err := a.gen.Next(snowflake.TypeTextChannel)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO categories (id, server_id, name, position) VALUES ($1,$2,$3,$4)`, catID, sid, "Ogólne", 0); err != nil {
		jsonErr(w, http.StatusInternalServerError, "category")
		return
	}
	if _, err := tx.Exec(ctx, `INSERT INTO channels (id, server_id, category_id, name, channel_type, position, color) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		chID, sid, catID, "powitania", 0, 0, color); err != nil {
		jsonErr(w, http.StatusInternalServerError, "channel")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return
	}
	jsonWrite(w, http.StatusCreated, map[string]interface{}{
		"id": strconv.FormatInt(sid, 10), "name": name, "iconKey": iconKey, "color": color, "glow": glow, "active": true,
		"inviteCode": invite,
	})
}

type joinBody struct {
	Code string `json:"code"`
}

func (a *App) handleJoinServer(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body joinBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	token := extractJoinToken(body.Code)
	if token == "" {
		jsonErr(w, http.StatusBadRequest, "code")
		return
	}
	if a.joinThroughServerInvite(w, r, uid, token) {
		return
	}
	ctx := r.Context()
	var sid int64
	var name, iconKey, color, glow string
	found := false
	if id, e := strconv.ParseInt(token, 10, 64); e == nil && id > 0 {
		if snowflake.EntityType(id) != snowflake.TypeServer {
			jsonErr(w, http.StatusBadRequest, "not a server invite")
			return
		}
		if err := a.pool.QueryRow(ctx, `SELECT id, name, COALESCE(icon_key,''), COALESCE(color,''), COALESCE(glow,'') FROM servers WHERE id = $1`, id).
			Scan(&sid, &name, &iconKey, &color, &glow); err == nil {
			found = true
		}
	}
	if !found {
		code := strings.ToUpper(strings.TrimSpace(token))
		if err := a.pool.QueryRow(ctx, `SELECT id, name, COALESCE(icon_key,''), COALESCE(color,''), COALESCE(glow,'') FROM servers WHERE invite_code = $1`, code).
			Scan(&sid, &name, &iconKey, &color, &glow); err != nil {
			jsonErr(w, http.StatusNotFound, "invalid invite")
			return
		}
	}
	var memberRole int64
	err := a.pool.QueryRow(ctx, `SELECT id FROM roles WHERE server_id = $1 AND name = 'Member' ORDER BY position DESC LIMIT 1`, sid).Scan(&memberRole)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "role")
		return
	}
	if _, err := a.pool.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, sid, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "join")
		return
	}
	_, _ = a.pool.Exec(ctx, `INSERT INTO member_roles (user_id, server_id, role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, uid, sid, memberRole)
	invite := a.ensureServerInviteCode(ctx, sid)
	jsonWrite(w, http.StatusOK, map[string]interface{}{
		"id": strconv.FormatInt(sid, 10), "name": name, "iconKey": iconKey, "color": color, "glow": glow,
		"inviteCode": invite,
	})
}

func (a *App) handleLeaveServer(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	sid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	var owner int64
	if a.pool.QueryRow(ctx, `SELECT owner_id FROM servers WHERE id = $1`, sid).Scan(&owner) == nil && owner == uid {
		jsonErr(w, http.StatusBadRequest, "owner cannot leave")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM server_members WHERE server_id = $1 AND user_id = $2`, sid, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "leave")
		return
	}
	_, _ = a.pool.Exec(ctx, `DELETE FROM member_roles WHERE server_id = $1 AND user_id = $2`, sid, uid)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleListCategories(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT c.id, c.server_id, c.name, c.position
		FROM categories c
		JOIN server_members m ON m.server_id = c.server_id
		WHERE m.user_id = $1
		ORDER BY c.server_id, c.position`, uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id, srv int64
		var name string
		var pos int
		if rows.Scan(&id, &srv, &name, &pos) != nil {
			continue
		}
		list = append(list, map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "serverId": strconv.FormatInt(srv, 10),
			"name": name, "isExpanded": true, "position": pos,
		})
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

type catCreateBody struct {
	Name     string `json:"name"`
	ServerID string `json:"serverId"`
}

func (a *App) handleCreateCategory(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body catCreateBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	sid, err := parseID(body.ServerID)
	if err != nil || strings.TrimSpace(body.Name) == "" {
		jsonErr(w, http.StatusBadRequest, "invalid")
		return
	}
	ctx := r.Context()
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "not a member")
		return
	}
	p, _ := a.memberPermBits(ctx, uid, sid)
	if !hasPerm(p, PermManageChannels) && !hasPerm(p, PermAdministrator) {
		jsonErr(w, http.StatusForbidden, "permission")
		return
	}
	var maxPos int
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM categories WHERE server_id = $1`, sid).Scan(&maxPos)
	cid, err := a.gen.Next(snowflake.TypeCategory)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	if _, err := a.pool.Exec(ctx, `INSERT INTO categories (id, server_id, name, position) VALUES ($1,$2,$3,$4)`,
		cid, sid, strings.TrimSpace(body.Name), maxPos); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	jsonWrite(w, http.StatusCreated, map[string]string{"id": strconv.FormatInt(cid, 10)})
}

func (a *App) handleUpdateCategory(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	cid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body struct {
		Name string `json:"name"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		jsonErr(w, http.StatusBadRequest, "name")
		return
	}
	ctx := r.Context()
	var sid int64
	if err := a.pool.QueryRow(ctx, `SELECT server_id FROM categories WHERE id = $1`, cid).Scan(&sid); err != nil {
		jsonErr(w, http.StatusNotFound, "category")
		return
	}
	p, _ := a.memberPermBits(ctx, uid, sid)
	if !hasPerm(p, PermManageChannels) && !hasPerm(p, PermAdministrator) {
		jsonErr(w, http.StatusForbidden, "permission")
		return
	}
	if _, err := a.pool.Exec(ctx, `UPDATE categories SET name = $1 WHERE id = $2`, name, cid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "update")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleDeleteCategory(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	cid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	var sid int64
	if err := a.pool.QueryRow(ctx, `SELECT server_id FROM categories WHERE id = $1`, cid).Scan(&sid); err != nil {
		jsonErr(w, http.StatusNotFound, "category")
		return
	}
	p, _ := a.memberPermBits(ctx, uid, sid)
	if !hasPerm(p, PermManageChannels) && !hasPerm(p, PermAdministrator) {
		jsonErr(w, http.StatusForbidden, "permission")
		return
	}
	if _, err := a.pool.Exec(ctx, `UPDATE channels SET category_id = NULL WHERE category_id = $1`, cid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "channels")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM categories WHERE id = $1`, cid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func channelTypeStr(chType int, id int64) string {
	if chType == 1 {
		return "voice"
	}
	if chType == 0 {
		return "text"
	}
	if snowflake.EntityType(id) == snowflake.TypeVoiceChannel {
		return "voice"
	}
	return "text"
}

func (a *App) handleListChannels(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	rows, err := a.pool.Query(r.Context(), `
		SELECT ch.id, ch.server_id, ch.category_id, ch.name, ch.channel_type, COALESCE(ch.color,'')
		FROM channels ch
		JOIN server_members m ON m.server_id = ch.server_id
		WHERE m.user_id = $1
		ORDER BY ch.server_id, ch.position`, uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id, srv int64
		var cat *int64
		var name string
		var ct int
		var color string
		if rows.Scan(&id, &srv, &cat, &name, &ct, &color) != nil {
			continue
		}
		item := map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "serverId": strconv.FormatInt(srv, 10),
			"name": name, "type": channelTypeStr(ct, id), "color": color,
		}
		if cat != nil {
			item["categoryId"] = strconv.FormatInt(*cat, 10)
		}
		list = append(list, item)
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

type channelCreateBody struct {
	Name       string  `json:"name"`
	Type       string  `json:"type"`
	CategoryID *string `json:"categoryId"`
	ServerID   string  `json:"serverId"`
}

func (a *App) handleCreateChannel(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body channelCreateBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	sid, err := parseID(body.ServerID)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "server")
		return
	}
	name := strings.TrimSpace(body.Name)
	if name == "" {
		jsonErr(w, http.StatusBadRequest, "name")
		return
	}
	voice := strings.ToLower(strings.TrimSpace(body.Type)) == "voice"
	ctx := r.Context()
	p, _ := a.memberPermBits(ctx, uid, sid)
	if !hasPerm(p, PermManageChannels) && !hasPerm(p, PermAdministrator) {
		jsonErr(w, http.StatusForbidden, "permission")
		return
	}
	var maxPos int
	_ = a.pool.QueryRow(ctx, `SELECT COALESCE(MAX(position),-1)+1 FROM channels WHERE server_id = $1`, sid).Scan(&maxPos)
	var cat *int64
	if body.CategoryID != nil && *body.CategoryID != "" {
		c, err := parseID(*body.CategoryID)
		if err == nil {
			cat = &c
		}
	}
	var chID int64
	if voice {
		chID, err = a.gen.Next(snowflake.TypeVoiceChannel)
	} else {
		chID, err = a.gen.Next(snowflake.TypeTextChannel)
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	ct := 0
	if voice {
		ct = 1
	}
	col := "#00eeff"
	if voice {
		col = "#b266ff"
	}
	if _, err := a.pool.Exec(ctx, `INSERT INTO channels (id, server_id, category_id, name, channel_type, position, color) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
		chID, sid, cat, name, ct, maxPos, col); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	jsonWrite(w, http.StatusCreated, map[string]string{"id": strconv.FormatInt(chID, 10)})
}

func (a *App) handleDeleteChannel(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	chid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	sid, err := a.channelServerID(ctx, a.pool, chid)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "channel")
		return
	}
	p, _ := a.memberPermBits(ctx, uid, sid)
	if !hasPerm(p, PermManageChannels) && !hasPerm(p, PermAdministrator) {
		jsonErr(w, http.StatusForbidden, "permission")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM channels WHERE id = $1`, chid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	_ = a.redisInvalidateChannel(ctx, chid)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleListMessages(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	chid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	_, ok, err := a.requireChannelPerm(ctx, uid, chid, PermReadMessages)
	if err != nil || !ok {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	cached, _ := a.redisListMessages(ctx, chid, 50)
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
		FROM messages m
		WHERE m.channel_id = $1
		ORDER BY m.id DESC
		LIMIT 50`, chid)
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
	_ = a.redisInvalidateChannel(ctx, chid)
	for i := 0; i < len(buf); i++ {
		x := buf[i]
		cm := cachedMessage{
			ID: strconv.FormatInt(x.id, 10), ChannelID: strconv.FormatInt(chid, 10),
			UserID: strconv.FormatInt(x.author, 10), Content: x.content,
			CreatedAt: x.created.UTC().Format(time.RFC3339Nano), IsEdited: x.edited != nil,
		}
		_ = a.redisPushMessage(ctx, chid, cm)
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

type postMsgBody struct {
	Content string `json:"content"`
}

func (a *App) handleCreateMessage(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	chid, err := parseID(chi.URLParam(r, "id"))
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
	_, ok, err := a.requireChannelPerm(ctx, uid, chid, PermSendMessages)
	if err != nil || !ok {
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
		INSERT INTO messages (id, channel_id, author_id, content) VALUES ($1,$2,$3,$4)
		RETURNING created_at`, mid, chid, uid, content).Scan(&created); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	cm := cachedMessage{
		ID: strconv.FormatInt(mid, 10), ChannelID: strconv.FormatInt(chid, 10),
		UserID: strconv.FormatInt(uid, 10), Content: content,
		CreatedAt: created.UTC().Format(time.RFC3339Nano), IsEdited: false,
	}
	_ = a.redisPushMessage(ctx, chid, cm)
	payload, _ := json.Marshal(map[string]interface{}{
		"type": "message",
		"payload": map[string]interface{}{
			"id": cm.ID, "channel_id": cm.ChannelID, "user_id": cm.UserID, "content": content,
			"time": chatRowTime(created), "created_at": cm.CreatedAt, "is_edited": false,
		},
	})
	a.chathub.Broadcast(chid, payload)
	_ = a.rdb.Publish(ctx, "devcord:ch:"+strconv.FormatInt(chid, 10), string(payload)).Err()
	jsonWrite(w, http.StatusCreated, map[string]interface{}{
		"id": cm.ID, "userId": cm.UserID, "time": chatRowTime(created), "content": content,
	})
}

func (a *App) handleDeleteMessage(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	mid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	var chid, author int64
	err = a.pool.QueryRow(ctx, `SELECT channel_id, author_id FROM messages WHERE id = $1`, mid).Scan(&chid, &author)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "message")
		return
	}
	sid, err := a.channelServerID(ctx, a.pool, chid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "channel")
		return
	}
	p, _ := a.memberPermBits(ctx, uid, sid)
	can := author == uid || hasPerm(p, PermAdministrator) || hasPerm(p, PermManageServer)
	if !can {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM messages WHERE id = $1`, mid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	_ = a.redisInvalidateChannel(ctx, chid)
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleListTasks(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	sidStr := r.URL.Query().Get("serverId")
	sid, err := parseID(sidStr)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "serverId")
		return
	}
	ctx := r.Context()
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT id, title, assignee_id, completed, source_msg_id
		FROM tasks WHERE server_id = $1 ORDER BY created_at DESC`, sid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id int64
		var title string
		var assignee *int64
		var done bool
		var src *int64
		if rows.Scan(&id, &title, &assignee, &done, &src) != nil {
			continue
		}
		aid := ""
		if assignee != nil {
			aid = strconv.FormatInt(*assignee, 10)
		}
		item := map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "title": title,
			"assigneeId": aid, "completed": done,
		}
		if src != nil {
			item["sourceMsgId"] = strconv.FormatInt(*src, 10)
		}
		list = append(list, item)
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

type taskCreateBody struct {
	Title        string `json:"title"`
	AssigneeID   string `json:"assigneeId"`
	ServerID     string `json:"serverId"`
	SourceMsgID  string `json:"sourceMsgId"`
	ChannelID    string `json:"channelId"`
}

func (a *App) handleCreateTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body taskCreateBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	sid, err := parseID(body.ServerID)
	if err != nil || strings.TrimSpace(body.Title) == "" {
		jsonErr(w, http.StatusBadRequest, "invalid")
		return
	}
	ctx := r.Context()
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	tid, err := a.gen.Next(snowflake.TypeTask)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	var assignee *int64
	if body.AssigneeID != "" {
		a, err := parseID(body.AssigneeID)
		if err == nil {
			assignee = &a
		}
	}
	var src *int64
	if body.SourceMsgID != "" {
		s, err := parseID(body.SourceMsgID)
		if err == nil {
			src = &s
		}
	}
	var ch *int64
	if body.ChannelID != "" {
		c, err := parseID(body.ChannelID)
		if err == nil {
			ch = &c
		}
	}
	if _, err := a.pool.Exec(ctx, `INSERT INTO tasks (id, server_id, channel_id, title, assignee_id, source_msg_id) VALUES ($1,$2,$3,$4,$5,$6)`,
		tid, sid, ch, strings.TrimSpace(body.Title), assignee, src); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	jsonWrite(w, http.StatusCreated, map[string]string{"id": strconv.FormatInt(tid, 10)})
}

func (a *App) handleUpdateTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	tid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	var body struct {
		Completed *bool `json:"completed"`
	}
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	ctx := r.Context()
	var sid int64
	if err := a.pool.QueryRow(ctx, `SELECT server_id FROM tasks WHERE id = $1`, tid).Scan(&sid); err != nil {
		jsonErr(w, http.StatusNotFound, "task")
		return
	}
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if body.Completed != nil {
		if _, err := a.pool.Exec(ctx, `UPDATE tasks SET completed = $1 WHERE id = $2`, *body.Completed, tid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update")
			return
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	tid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	var sid int64
	if err := a.pool.QueryRow(ctx, `SELECT server_id FROM tasks WHERE id = $1`, tid).Scan(&sid); err != nil {
		jsonErr(w, http.StatusNotFound, "task")
		return
	}
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	if _, err := a.pool.Exec(ctx, `DELETE FROM tasks WHERE id = $1`, tid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleListMembers(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	sid, err := parseID(r.URL.Query().Get("serverId"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "serverId")
		return
	}
	ctx := r.Context()
	mem, _ := a.isServerMember(ctx, uid, sid)
	if !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	roleRows, err := a.pool.Query(ctx, `
		SELECT id, name, COALESCE(color,''), COALESCE(bg,''), COALESCE(border,''), COALESCE(glow,''), COALESCE(icon_key,''), position
		FROM roles WHERE server_id = $1 ORDER BY position`, sid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "roles")
		return
	}
	defer roleRows.Close()
	var roles []map[string]interface{}
	for roleRows.Next() {
		var id int64
		var name, color, bg, border, glow, iconKey string
		var pos int
		if roleRows.Scan(&id, &name, &color, &bg, &border, &glow, &iconKey, &pos) != nil {
			continue
		}
		roles = append(roles, map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "name": name, "color": color, "bg": bg, "border": border,
			"glow": glow, "iconKey": iconKey, "position": pos,
		})
	}
	memberRows, err := a.pool.Query(ctx, `
		SELECT u.id, u.display_name,
			COALESCE(
				(SELECT r.id FROM member_roles mr JOIN roles r ON r.id = mr.role_id
				 WHERE mr.user_id = u.id AND mr.server_id = sm.server_id ORDER BY r.position DESC LIMIT 1),
				(SELECT id FROM roles WHERE server_id = sm.server_id AND name = 'Member' ORDER BY position ASC LIMIT 1)
			) AS role_id
		FROM server_members sm JOIN users u ON u.id = sm.user_id WHERE sm.server_id = $1
		ORDER BY u.display_name`, sid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "members")
		return
	}
	defer memberRows.Close()
	var members []map[string]interface{}
	for memberRows.Next() {
		var uID int64
		var dn string
		var rid *int64
		if memberRows.Scan(&uID, &dn, &rid) != nil {
			continue
		}
		ridStr := ""
		if rid != nil {
			ridStr = strconv.FormatInt(*rid, 10)
		}
		members = append(members, map[string]interface{}{
			"id": strconv.FormatInt(uID, 10), "name": dn, "roleId": ridStr, "status": "online",
		})
	}
	jsonWrite(w, http.StatusOK, map[string]interface{}{"roles": roles, "members": members})
}
