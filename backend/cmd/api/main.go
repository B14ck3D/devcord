package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"webrtc/signaling/internal/fluxapi"
)

func main() {
	cfg := fluxapi.LoadConfig()
	if cfg.DatabaseURL == "" {
		log.Fatal("DATABASE_URL required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	app, err := fluxapi.New(ctx, cfg)
	cancel()
	if err != nil {
		log.Fatalf("devcord api: %v", err)
	}
	defer app.Close()

	srv := &http.Server{
		Addr:         cfg.ListenAddr,
		Handler:      app.Router(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}
	go func() {
		log.Printf("devcord-api listening %s", cfg.ListenAddr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("listen: %v", err)
		}
	}()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	<-sig
	shutdownCtx, cancelShutdown := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancelShutdown()
	_ = srv.Shutdown(shutdownCtx)
}
