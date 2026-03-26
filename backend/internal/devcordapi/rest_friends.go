package devcordapi

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"webrtc/signaling/internal/snowflake"
)

var (
	errFriendReqMissing   = errors.New("friend request not found")
	errFriendReqForbidden = errors.New("friend request forbidden")
)

func friendshipPair(a, b int64) (low, high int64) {
	if a < b {
		return a, b
	}
	return b, a
}

func (a *App) userPublicJSON(ctx context.Context, id int64) map[string]interface{} {
	var dn string
	var av *string
	_ = a.pool.QueryRow(ctx, `SELECT display_name, avatar_url FROM users WHERE id = $1`, id).Scan(&dn, &av)
	m := map[string]interface{}{"id": strconv.FormatInt(id, 10), "name": dn}
	if av != nil && *av != "" {
		m["avatar_url"] = *av
	}
	return m
}

func (a *App) areFriends(ctx context.Context, u1, u2 int64) bool {
	low, high := friendshipPair(u1, u2)
	var x int
	_ = a.pool.QueryRow(ctx, `SELECT 1 FROM friendships WHERE user_low = $1 AND user_high = $2`, low, high).Scan(&x)
	return x == 1
}

type friendRequestBody struct {
	ToUserID string `json:"to_user_id"`
}

func (a *App) handleFriendRequestCreate(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	var body friendRequestBody
	if json.NewDecoder(r.Body).Decode(&body) != nil {
		jsonErr(w, http.StatusBadRequest, "json")
		return
	}
	toID, err := parseID(strings.TrimSpace(body.ToUserID))
	if err != nil || toID == me {
		jsonErr(w, http.StatusBadRequest, "to_user_id")
		return
	}
	ctx := r.Context()
	var one int
	if err := a.pool.QueryRow(ctx, `SELECT 1 FROM users WHERE id = $1`, toID).Scan(&one); err != nil {
		if err == pgx.ErrNoRows {
			jsonErr(w, http.StatusNotFound, "user")
			return
		}
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	if a.areFriends(ctx, me, toID) {
		jsonErr(w, http.StatusConflict, "already friends")
		return
	}
	var revID int64
	err = a.pool.QueryRow(ctx,
		`SELECT id FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2`,
		toID, me,
	).Scan(&revID)
	if err == nil {
		if err := a.acceptFriendRequest(ctx, me, revID); err != nil {
			if errors.Is(err, errFriendReqMissing) {
				jsonErr(w, http.StatusNotFound, "request")
				return
			}
			if errors.Is(err, errFriendReqForbidden) {
				jsonErr(w, http.StatusForbidden, "forbidden")
				return
			}
			jsonErr(w, http.StatusInternalServerError, "accept")
			return
		}
		jsonWrite(w, http.StatusOK, map[string]interface{}{"status": "accepted", "auto": true})
		return
	}
	if err != nil && err != pgx.ErrNoRows {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	var dup int
	_ = a.pool.QueryRow(ctx,
		`SELECT 1 FROM friend_requests WHERE from_user_id = $1 AND to_user_id = $2`,
		me, toID,
	).Scan(&dup)
	if dup == 1 {
		jsonErr(w, http.StatusConflict, "request pending")
		return
	}
	rid, err := a.gen.Next(snowflake.TypeDmConversation)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	if _, err = a.pool.Exec(ctx, `INSERT INTO friend_requests (id, from_user_id, to_user_id) VALUES ($1,$2,$3)`, rid, me, toID); err != nil {
		jsonErr(w, http.StatusInternalServerError, "insert")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]interface{}{
		"id": strconv.FormatInt(rid, 10),
		"to": a.userPublicJSON(ctx, toID),
	})
}

func (a *App) acceptFriendRequest(ctx context.Context, me, requestID int64) error {
	var fromID, toID int64
	err := a.pool.QueryRow(ctx, `SELECT from_user_id, to_user_id FROM friend_requests WHERE id = $1`, requestID).Scan(&fromID, &toID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return errFriendReqMissing
		}
		return err
	}
	if toID != me {
		return errFriendReqForbidden
	}
	low, high := friendshipPair(fromID, toID)
	fid, err := a.gen.Next(snowflake.TypeDmConversation)
	if err != nil {
		return err
	}
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if _, err = tx.Exec(ctx, `DELETE FROM friend_requests WHERE id = $1 OR (from_user_id = $2 AND to_user_id = $3) OR (from_user_id = $3 AND to_user_id = $2)`,
		requestID, fromID, toID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx,
		`INSERT INTO friendships (id, user_low, user_high) VALUES ($1,$2,$3) ON CONFLICT (user_low, user_high) DO NOTHING`,
		fid, low, high); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (a *App) handleFriendRequestAccept(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	rid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	if err := a.acceptFriendRequest(ctx, me, rid); err != nil {
		if errors.Is(err, errFriendReqMissing) {
			jsonErr(w, http.StatusNotFound, "request")
			return
		}
		if errors.Is(err, errFriendReqForbidden) {
			jsonErr(w, http.StatusForbidden, "forbidden")
			return
		}
		jsonErr(w, http.StatusInternalServerError, "accept")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]interface{}{"ok": true})
}

func (a *App) handleFriendRequestReject(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	rid, err := parseID(chi.URLParam(r, "id"))
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "id")
		return
	}
	ctx := r.Context()
	cmd, err := a.pool.Exec(ctx, `DELETE FROM friend_requests WHERE id = $1 AND to_user_id = $2`, rid, me)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "delete")
		return
	}
	if cmd.RowsAffected() == 0 {
		jsonErr(w, http.StatusNotFound, "request")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *App) handleFriendRequestsIncoming(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT r.id, r.from_user_id, u.display_name, u.avatar_url
		FROM friend_requests r
		JOIN users u ON u.id = r.from_user_id
		WHERE r.to_user_id = $1
		ORDER BY r.created_at DESC
	`, me)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id, fromID int64
		var dn string
		var av *string
		if rows.Scan(&id, &fromID, &dn, &av) != nil {
			continue
		}
		peer := map[string]interface{}{"id": strconv.FormatInt(fromID, 10), "name": dn}
		if av != nil && *av != "" {
			peer["avatar_url"] = *av
		}
		list = append(list, map[string]interface{}{
			"id":   strconv.FormatInt(id, 10),
			"from": peer,
		})
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

func (a *App) handleFriendRequestsOutgoing(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT r.id, r.to_user_id, u.display_name, u.avatar_url
		FROM friend_requests r
		JOIN users u ON u.id = r.to_user_id
		WHERE r.from_user_id = $1
		ORDER BY r.created_at DESC
	`, me)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var id, toID int64
		var dn string
		var av *string
		if rows.Scan(&id, &toID, &dn, &av) != nil {
			continue
		}
		peer := map[string]interface{}{"id": strconv.FormatInt(toID, 10), "name": dn}
		if av != nil && *av != "" {
			peer["avatar_url"] = *av
		}
		list = append(list, map[string]interface{}{
			"id": strconv.FormatInt(id, 10),
			"to": peer,
		})
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}

func (a *App) handleFriendsList(w http.ResponseWriter, r *http.Request) {
	me := userIDFromReq(r)
	ctx := r.Context()
	rows, err := a.pool.Query(ctx, `
		SELECT CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END AS fid,
			u.display_name, u.avatar_url
		FROM friendships f
		JOIN users u ON u.id = CASE WHEN f.user_low = $1 THEN f.user_high ELSE f.user_low END
		WHERE f.user_low = $1 OR f.user_high = $1
		ORDER BY u.display_name
	`, me)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "query")
		return
	}
	defer rows.Close()
	var list []map[string]interface{}
	for rows.Next() {
		var fid int64
		var dn string
		var av *string
		if rows.Scan(&fid, &dn, &av) != nil {
			continue
		}
		m := map[string]interface{}{"id": strconv.FormatInt(fid, 10), "name": dn}
		if av != nil && *av != "" {
			m["avatar_url"] = *av
		}
		list = append(list, m)
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	jsonWrite(w, http.StatusOK, list)
}
