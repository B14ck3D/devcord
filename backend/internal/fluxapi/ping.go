package fluxapi

import (
	"context"
	"encoding/json"
	"net/http"
	"time"
)

// handlePublicPing — lekki endpoint bez JWT: klient mierzy RTT (fetch), serwer zwraca czas własnych pingów DB/Redis.
func (a *App) handlePublicPing(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 1500*time.Millisecond)
	defer cancel()
	t0 := time.Now()
	dbErr := a.pool.Ping(ctx)
	redisErr := a.rdb.Ping(ctx).Err()
	procMs := time.Since(t0).Milliseconds()
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(map[string]any{
		"ok":        dbErr == nil && redisErr == nil,
		"db_ok":     dbErr == nil,
		"redis_ok":  redisErr == nil,
		"server_ms": procMs,
	})
}
