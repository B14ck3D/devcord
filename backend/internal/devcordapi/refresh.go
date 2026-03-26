package devcordapi

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"time"
)

const refreshTTL = 30 * 24 * time.Hour

func hashRefreshToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (a *App) issueRefreshToken(ctx context.Context, userID int64) (plain string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", err
	}
	plain = hex.EncodeToString(b)
	_, err = a.pool.Exec(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		userID, hashRefreshToken(plain), time.Now().Add(refreshTTL))
	return plain, err
}

func (a *App) rotateRefreshToken(ctx context.Context, userID int64, oldHash string) (plain string, err error) {
	tx, err := a.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `DELETE FROM refresh_tokens WHERE token_hash = $1`, oldHash)
	if err != nil {
		return "", err
	}
	if tag.RowsAffected() == 0 {
		return "", errors.New("refresh token missing")
	}
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", err
	}
	plain = hex.EncodeToString(b)
	if _, err = tx.Exec(ctx, `INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1,$2,$3)`,
		userID, hashRefreshToken(plain), time.Now().Add(refreshTTL)); err != nil {
		return "", err
	}
	return plain, tx.Commit(ctx)
}
