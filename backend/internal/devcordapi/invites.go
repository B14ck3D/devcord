package devcordapi

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"webrtc/signaling/internal/snowflake"
)

func isProbableInviteSlug(t string) bool {
	t = strings.TrimSpace(t)
	if len(t) < 6 || len(t) > 32 {
		return false
	}
	if _, err := strconv.ParseInt(t, 10, 64); err == nil && len(t) >= 15 {
		return false
	}
	return true
}

func randomInviteSlug(n int) string {
	return randomInvite(n)
}

func (a *App) handleListServerInvites(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	sid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	mem, err := a.isServerMember(ctx, uid, sid)
	if err != nil || !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	rows, err := a.pool.Query(ctx, `
		SELECT id, code, max_uses, uses_count, expires_at, created_at
		FROM server_invites WHERE server_id = $1 ORDER BY created_at DESC LIMIT 50`, sid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id int64
		var code string
		var maxU sql.NullInt64
		var uses int
		var exp sql.NullTime
		var created time.Time
		if rows.Scan(&id, &code, &maxU, &uses, &exp, &created) != nil {
			continue
		}
		item := map[string]interface{}{
			"id": strconv.FormatInt(id, 10), "code": code, "usesCount": uses,
			"createdAt": created.UTC().Format(time.RFC3339),
		}
		if maxU.Valid {
			item["maxUses"] = maxU.Int64
		} else {
			item["maxUses"] = nil
		}
		if exp.Valid {
			item["expiresAt"] = exp.Time.UTC().Format(time.RFC3339)
		} else {
			item["expiresAt"] = nil
		}
		list = append(list, item)
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

type createInviteBody struct {
	MaxUses         *int64 `json:"maxUses"`
	ExpiresInDays   *int   `json:"expiresInDays"`
}

func (a *App) handleCreateServerInvite(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	sid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	mem, err := a.isServerMember(ctx, uid, sid)
	if err != nil || !mem {
		jsonErr(w, http.StatusForbidden, "forbidden")
		return
	}
	var body createInviteBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	if body.MaxUses != nil && *body.MaxUses <= 0 {
		jsonErr(w, http.StatusBadRequest, "maxUses")
		return
	}
	var exp *time.Time
	if body.ExpiresInDays != nil && *body.ExpiresInDays > 0 {
		t := time.Now().UTC().Add(time.Duration(*body.ExpiresInDays) * 24 * time.Hour)
		exp = &t
	}
	invID, err := a.gen.Next(snowflake.TypeInvite)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	var code string
	var lastInsErr error
	for attempt := 0; attempt < 12; attempt++ {
		c := strings.ToUpper(randomInviteSlug(8))
		_, insErr := a.pool.Exec(ctx, `
			INSERT INTO server_invites (id, server_id, code, created_by, max_uses, expires_at)
			VALUES ($1,$2,$3,$4,$5,$6)`, invID, sid, c, uid, body.MaxUses, exp)
		if insErr == nil {
			code = c
			break
		}
		lastInsErr = insErr
		invID, err = a.gen.Next(snowflake.TypeInvite)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "id")
			return
		}
	}
	if code == "" {
		log.Printf("server_invites insert failed: %v", lastInsErr)
		jsonErr(w, http.StatusInternalServerError, "invite_create_failed")
		return
	}
	out := map[string]interface{}{
		"code": code, "usesCount": 0,
	}
	if body.MaxUses != nil {
		out["maxUses"] = *body.MaxUses
	} else {
		out["maxUses"] = nil
	}
	if exp != nil {
		out["expiresAt"] = exp.UTC().Format(time.RFC3339)
	} else {
		out["expiresAt"] = nil
	}
	jsonWrite(w, http.StatusCreated, out)
}

// joinThroughServerInvite próbuje dołączyć przez server_invites (transakcja). Zwraca true jeśli odpowiedź już wysłana.
func (a *App) joinThroughServerInvite(w http.ResponseWriter, r *http.Request, uid int64, token string) bool {
	if !isProbableInviteSlug(token) {
		return false
	}
	ctx := r.Context()
	tok := strings.TrimSpace(token)
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return true
	}
	defer tx.Rollback(ctx)
	var invID int64
	var sid int64
	var maxU sql.NullInt64
	var uses int
	var exp sql.NullTime
	err = tx.QueryRow(ctx, `
		SELECT id, server_id, max_uses, uses_count, expires_at
		FROM server_invites WHERE upper(code) = upper($1) FOR UPDATE`, tok).Scan(&invID, &sid, &maxU, &uses, &exp)
	if errors.Is(err, pgx.ErrNoRows) {
		return false
	}
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "invite")
		return true
	}
	if exp.Valid && time.Now().UTC().After(exp.Time.UTC()) {
		jsonErr(w, http.StatusNotFound, "invite expired")
		return true
	}
	if maxU.Valid && int64(uses) >= maxU.Int64 {
		jsonErr(w, http.StatusNotFound, "invite exhausted")
		return true
	}
	if _, err := tx.Exec(ctx, `UPDATE server_invites SET uses_count = uses_count + 1 WHERE id = $1`, invID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "invite")
		return true
	}
	var name, iconKey, color, glow string
	if err := tx.QueryRow(ctx, `SELECT id, name, COALESCE(icon_key,''), COALESCE(color,''), COALESCE(glow,'') FROM servers WHERE id = $1`, sid).
		Scan(&sid, &name, &iconKey, &color, &glow); err != nil {
		jsonErr(w, http.StatusNotFound, "invalid invite")
		return true
	}
	var memberRole int64
	if err := tx.QueryRow(ctx, `SELECT id FROM roles WHERE server_id = $1 AND name = 'Member' ORDER BY position DESC LIMIT 1`, sid).Scan(&memberRole); err != nil {
		jsonErr(w, http.StatusInternalServerError, "role")
		return true
	}
	if _, err := tx.Exec(ctx, `INSERT INTO server_members (server_id, user_id) VALUES ($1,$2) ON CONFLICT DO NOTHING`, sid, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "join")
		return true
	}
	_, _ = tx.Exec(ctx, `INSERT INTO member_roles (user_id, server_id, role_id) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`, uid, sid, memberRole)
	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return true
	}
	invite := a.ensureServerInviteCode(ctx, sid)
	jsonWrite(w, http.StatusOK, map[string]interface{}{
		"id": strconv.FormatInt(sid, 10), "name": name, "iconKey": iconKey, "color": color, "glow": glow,
		"inviteCode": invite,
	})
	return true
}
