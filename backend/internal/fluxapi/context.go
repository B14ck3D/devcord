package fluxapi

import (
	"context"
	"net/http"
)

type ctxKey int

const userIDKey ctxKey = 1

func (a *App) authMW(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		uid, err := a.parseUserIDFromBearer(r.Header.Get("Authorization"))
		if err != nil {
			jsonErr(w, http.StatusUnauthorized, "unauthorized")
			return
		}
		ctx := context.WithValue(r.Context(), userIDKey, uid)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func userIDFromReq(r *http.Request) int64 {
	v := r.Context().Value(userIDKey)
	if v == nil {
		return 0
	}
	return v.(int64)
}
