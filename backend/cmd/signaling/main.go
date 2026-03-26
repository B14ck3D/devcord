package main

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"webrtc/signaling/internal/signaling"
)

func main() {
	addr := strings.TrimSpace(os.Getenv("LISTEN_ADDR"))
	if addr == "" {
		addr = ":23623"
	}
	if !strings.HasPrefix(addr, ":") && !strings.Contains(addr, ":") {
		addr = ":" + addr
	}

	hub := signaling.NewHub()
	jwtSecret := strings.TrimSpace(os.Getenv("SIGNALING_JWT_SECRET"))
	if jwtSecret == "" {
		jwtSecret = strings.TrimSpace(os.Getenv("JWT_SECRET"))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		_, _ = w.Write([]byte("ok"))
	})
	mux.HandleFunc("/ws", signaling.ServeWS(hub, jwtSecret))
	mux.HandleFunc("/voice/peers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		room := strings.TrimSpace(r.URL.Query().Get("room"))
		if room == "" {
			http.Error(w, "missing room", http.StatusBadRequest)
			return
		}
		ids := hub.ListPeerIDs(room)
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(map[string][]string{"user_ids": ids})
	})

	srv := &http.Server{
		Addr:              addr,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	go func() {
		if jwtSecret != "" {
			log.Println("signaling: WebSocket requires access_token query (JWT)")
		}
		log.Println("signaling listening on", srv.Addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal(err)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	hub.Shutdown()
	log.Println("shutdown complete")
}
