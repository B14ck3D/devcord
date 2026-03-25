package fluxapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"
	"webrtc/signaling/internal/snowflake"
)

type regBody struct {
	Email        string `json:"email"`
	Password     string `json:"password"`
	DisplayName  string `json:"display_name"`
	Nick         string `json:"nick"`
}

type verifyBody struct {
	Email string `json:"email"`
	Code  string `json:"code"`
}

type loginBody struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

func allowedEmail(email string) bool {
	e := strings.ToLower(strings.TrimSpace(email))
	return strings.HasSuffix(e, "@ndevelopment.org") && strings.Contains(e, "@")
}

func randomDigits(n int) string {
	const digits = "0123456789"
	b := make([]byte, n)
	_, _ = rand.Read(b)
	for i := range b {
		b[i] = digits[int(b[i])%10]
	}
	return string(b)
}

func hashVerificationCode(code string) string {
	h := sha256.Sum256([]byte(strings.TrimSpace(code)))
	return hex.EncodeToString(h[:])
}

func (a *App) resendVerification(w http.ResponseWriter, ctx context.Context, uid int64, emailTo string, display, nick string) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET display_name = $1, nick = $2 WHERE id = $3`, display, nick, uid); err != nil {
		_ = tx.Rollback(ctx)
		jsonErr(w, http.StatusInternalServerError, "update user")
		return
	}
	if _, err := tx.Exec(ctx, `DELETE FROM email_verification_codes WHERE user_id = $1`, uid); err != nil {
		_ = tx.Rollback(ctx)
		jsonErr(w, http.StatusInternalServerError, "reset codes")
		return
	}
	code := randomDigits(6)
	if _, err := tx.Exec(ctx, `INSERT INTO email_verification_codes (user_id, code_hash, expires_at) VALUES ($1,$2,$3)`,
		uid, hashVerificationCode(code), time.Now().Add(30*time.Minute)); err != nil {
		_ = tx.Rollback(ctx)
		jsonErr(w, http.StatusInternalServerError, "insert code")
		return
	}
	if err := a.sendVerificationEmail(emailTo, code); err != nil {
		_ = tx.Rollback(ctx)
		log.Printf("fluxapi: resend verification mail: %v", err)
		jsonErr(w, http.StatusBadGateway, "mail delivery failed")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]string{"status": "verify_email", "user_id": strconv.FormatInt(uid, 10)})
}

func (a *App) handleRegister(w http.ResponseWriter, r *http.Request) {
	var body regBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := strings.TrimSpace(body.Email)
	if !allowedEmail(email) {
		jsonErr(w, http.StatusBadRequest, "email must be @ndevelopment.org")
		return
	}
	if len(body.Password) < 8 {
		jsonErr(w, http.StatusBadRequest, "password too short")
		return
	}
	display := strings.TrimSpace(body.DisplayName)
	nick := strings.TrimSpace(body.Nick)
	if display == "" {
		display = nick
	}
	if nick == "" {
		nick = strings.Split(email, "@")[0]
	}
	if display == "" {
		display = nick
	}

	emailLower := strings.ToLower(email)
	ctx := r.Context()

	var existingID int64
	var verified *time.Time
	var prevHash []byte
	err := a.pool.QueryRow(ctx, `SELECT id, email_verified_at, password_hash FROM users WHERE email = $1`, emailLower).Scan(&existingID, &verified, &prevHash)
	if err == nil {
		if verified != nil {
			jsonErr(w, http.StatusConflict, "email exists")
			return
		}
		if bcrypt.CompareHashAndPassword(prevHash, []byte(body.Password)) != nil {
			jsonErr(w, http.StatusUnauthorized, "invalid credentials")
			return
		}
		a.resendVerification(w, ctx, existingID, email, display, nick)
		return
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		jsonErr(w, http.StatusInternalServerError, "lookup user")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(body.Password), bcrypt.DefaultCost)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "hash")
		return
	}
	uid, err := a.gen.Next(snowflake.TypeUser)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "id")
		return
	}
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return
	}
	_, err = tx.Exec(ctx, `INSERT INTO users (id, email, password_hash, display_name, nick) VALUES ($1,$2,$3,$4,$5)`,
		uid, emailLower, string(hash), display, nick)
	if err != nil {
		_ = tx.Rollback(ctx)
		if strings.Contains(err.Error(), "unique") {
			jsonErr(w, http.StatusConflict, "email exists")
			return
		}
		jsonErr(w, http.StatusInternalServerError, "insert user")
		return
	}
	code := randomDigits(6)
	_, err = tx.Exec(ctx, `INSERT INTO email_verification_codes (user_id, code_hash, expires_at) VALUES ($1,$2,$3)`,
		uid, hashVerificationCode(code), time.Now().Add(30*time.Minute))
	if err != nil {
		_ = tx.Rollback(ctx)
		jsonErr(w, http.StatusInternalServerError, "insert code")
		return
	}
	if err := a.sendVerificationEmail(email, code); err != nil {
		_ = tx.Rollback(ctx)
		log.Printf("fluxapi: register mail: %v", err)
		jsonErr(w, http.StatusBadGateway, "mail delivery failed")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return
	}
	jsonWrite(w, http.StatusCreated, map[string]string{"status": "verify_email", "user_id": strconv.FormatInt(uid, 10)})
}

func (a *App) handleVerify(w http.ResponseWriter, r *http.Request) {
	var body verifyBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	code := strings.TrimSpace(body.Code)
	if !allowedEmail(email) || len(code) < 4 {
		jsonErr(w, http.StatusBadRequest, "invalid")
		return
	}
	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return
	}
	defer tx.Rollback(ctx)
	var uid int64
	var chHash string
	var expires time.Time
	var consumed *time.Time
	err = tx.QueryRow(ctx, `
		SELECT u.id, c.code_hash, c.expires_at, c.consumed_at
		FROM users u
		JOIN email_verification_codes c ON c.user_id = u.id
		WHERE u.email = $1 AND c.consumed_at IS NULL
		ORDER BY c.created_at DESC LIMIT 1`, email).Scan(&uid, &chHash, &expires, &consumed)
	if err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid code")
		return
	}
	if time.Now().After(expires) {
		jsonErr(w, http.StatusBadRequest, "code expired")
		return
	}
	if hashVerificationCode(code) != chHash {
		jsonErr(w, http.StatusBadRequest, "invalid code")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE users SET email_verified_at = NOW() WHERE id = $1`, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "verify")
		return
	}
	if _, err := tx.Exec(ctx, `UPDATE email_verification_codes SET consumed_at = NOW() WHERE user_id = $1 AND consumed_at IS NULL`, uid); err != nil {
		jsonErr(w, http.StatusInternalServerError, "verify")
		return
	}
	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (a *App) handleLogin(w http.ResponseWriter, r *http.Request) {
	var body loginBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	email := strings.ToLower(strings.TrimSpace(body.Email))
	if email == "" || body.Password == "" {
		jsonErr(w, http.StatusBadRequest, "invalid")
		return
	}
	ctx := r.Context()
	var uid int64
	var hash []byte
	var verified *time.Time
	err := a.pool.QueryRow(ctx, `SELECT id, password_hash, email_verified_at FROM users WHERE email = $1`, email).Scan(&uid, &hash, &verified)
	if err != nil {
		jsonErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	if verified == nil {
		jsonErr(w, http.StatusForbidden, "email not verified")
		return
	}
	if bcrypt.CompareHashAndPassword(hash, []byte(body.Password)) != nil {
		jsonErr(w, http.StatusUnauthorized, "invalid credentials")
		return
	}
	access, err := a.issueAccessToken(uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "token")
		return
	}
	rt, err := a.issueRefreshToken(ctx, uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "token")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]string{
		"access_token": access, "refresh_token": rt, "token_type": "Bearer",
		"user_id": strconv.FormatInt(uid, 10),
	})
}

type refreshBody struct {
	RefreshToken string `json:"refresh_token"`
}

func (a *App) handleRefresh(w http.ResponseWriter, r *http.Request) {
	var body refreshBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	tok := strings.TrimSpace(body.RefreshToken)
	if tok == "" {
		jsonErr(w, http.StatusBadRequest, "missing token")
		return
	}
	ctx := r.Context()
	th := hashRefreshToken(tok)
	var uid int64
	var exp time.Time
	err := a.pool.QueryRow(ctx,
		`SELECT user_id, expires_at FROM refresh_tokens WHERE token_hash = $1`, th).Scan(&uid, &exp)
	if err != nil || time.Now().After(exp) {
		jsonErr(w, http.StatusUnauthorized, "invalid refresh")
		return
	}
	access, err := a.issueAccessToken(uid)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "token")
		return
	}
	newRT, err := a.rotateRefreshToken(ctx, uid, th)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "token")
		return
	}
	jsonWrite(w, http.StatusOK, map[string]string{
		"access_token": access, "refresh_token": newRT, "token_type": "Bearer", "user_id": strconv.FormatInt(uid, 10),
	})
}

func (a *App) handleMe(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	ctx := r.Context()
	var email, display, nick string
	var verified *time.Time
	var avatarURL, nickColor, nickGlow *string
	err := a.pool.QueryRow(ctx,
		`SELECT email, display_name, nick, email_verified_at, avatar_url, nick_color, nick_glow FROM users WHERE id = $1`, uid).Scan(&email, &display, &nick, &verified, &avatarURL, &nickColor, &nickGlow)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "user")
		return
	}
	
	res := map[string]interface{}{
		"id": strconv.FormatInt(uid, 10), "email": email, "display_name": display, "nick": nick,
		"email_verified": verified != nil,
	}
	if avatarURL != nil {
		res["avatar_url"] = *avatarURL
	}
	if nickColor != nil {
		res["nick_color"] = *nickColor
	}
	if nickGlow != nil {
		res["nick_glow"] = *nickGlow
	}
	
	jsonWrite(w, http.StatusOK, res)
}

type updateMeBody struct {
	DisplayName *string `json:"display_name,omitempty"`
	Nick        *string `json:"nick,omitempty"`
	AvatarURL   *string `json:"avatar_url,omitempty"`
	NickColor   *string `json:"nick_color,omitempty"`
	NickGlow    *string `json:"nick_glow,omitempty"`
	OldPassword *string `json:"old_password,omitempty"`
	NewPassword *string `json:"new_password,omitempty"`
}

func (a *App) handleUpdateMe(w http.ResponseWriter, r *http.Request) {
	uid := userIDFromReq(r)
	var body updateMeBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		jsonErr(w, http.StatusBadRequest, "invalid json")
		return
	}
	ctx := r.Context()
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		jsonErr(w, http.StatusInternalServerError, "tx")
		return
	}
	defer tx.Rollback(ctx)

	// Check password
	var currentHash []byte
	err = tx.QueryRow(ctx, `SELECT password_hash FROM users WHERE id = $1`, uid).Scan(&currentHash)
	if err != nil {
		jsonErr(w, http.StatusNotFound, "user")
		return
	}

	if body.NewPassword != nil && *body.NewPassword != "" {
		if body.OldPassword == nil || bcrypt.CompareHashAndPassword(currentHash, []byte(*body.OldPassword)) != nil {
			jsonErr(w, http.StatusUnauthorized, "invalid old password")
			return
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(*body.NewPassword), bcrypt.DefaultCost)
		if err != nil {
			jsonErr(w, http.StatusInternalServerError, "hash")
			return
		}
		if _, err := tx.Exec(ctx, `UPDATE users SET password_hash = $1 WHERE id = $2`, string(hash), uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update password")
			return
		}
	}

	if body.DisplayName != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET display_name = $1 WHERE id = $2`, *body.DisplayName, uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update display_name")
			return
		}
	}
	if body.Nick != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET nick = $1 WHERE id = $2`, *body.Nick, uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update nick")
			return
		}
	}
	if body.AvatarURL != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET avatar_url = $1 WHERE id = $2`, *body.AvatarURL, uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update avatar_url")
			return
		}
	}
	if body.NickColor != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET nick_color = $1 WHERE id = $2`, *body.NickColor, uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update nick_color")
			return
		}
	}
	if body.NickGlow != nil {
		if _, err := tx.Exec(ctx, `UPDATE users SET nick_glow = $1 WHERE id = $2`, *body.NickGlow, uid); err != nil {
			jsonErr(w, http.StatusInternalServerError, "update nick_glow")
			return
		}
	}

	if err := tx.Commit(ctx); err != nil {
		jsonErr(w, http.StatusInternalServerError, "commit")
		return
	}

	payload, _ := json.Marshal(map[string]interface{}{
		"type": "user_updated",
		"payload": map[string]interface{}{
			"user_id": strconv.FormatInt(uid, 10),
		},
	})
	if a.chathub != nil {
		a.chathub.BroadcastGlobal(payload)
	}

	jsonWrite(w, http.StatusOK, map[string]string{"status": "ok"})
}
