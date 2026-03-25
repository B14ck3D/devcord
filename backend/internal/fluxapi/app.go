package fluxapi

import (
	"context"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"webrtc/signaling/internal/snowflake"
)

type App struct {
	cfg     *Config
	pool    *pgxpool.Pool
	rdb     *redis.Client
	gen     *snowflake.Generator
	chathub *ChatHub
}

func New(ctx context.Context, cfg *Config) (*App, error) {
	pool, err := pgxpool.New(ctx, cfg.DatabaseURL)
	if err != nil {
		return nil, err
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	opt := redis.Options{Addr: cfg.RedisAddr}
	if cfg.RedisPass != "" {
		opt.Password = cfg.RedisPass
	}
	rdb := redis.NewClient(&opt)
	if err := rdb.Ping(ctx).Err(); err != nil {
		pool.Close()
		return nil, err
	}
	hub := newChatHub()
	a := &App{
		cfg:     cfg,
		pool:    pool,
		rdb:     rdb,
		gen:     snowflake.NewGenerator(),
		chathub: hub,
	}
	hub.app = a
	return a, nil
}

func (a *App) Close() {
	if a.pool != nil {
		a.pool.Close()
	}
	if a.rdb != nil {
		_ = a.rdb.Close()
	}
}

func (a *App) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(90 * time.Second))

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	r.Get("/api/ping", a.handlePublicPing)

	r.Route("/api", func(r chi.Router) {
		r.Post("/auth/register", a.handleRegister)
		r.Post("/auth/verify", a.handleVerify)
		r.Post("/auth/login", a.handleLogin)
		r.Post("/auth/refresh", a.handleRefresh)

		r.Group(func(r chi.Router) {
			r.Use(a.authMW)
			r.Get("/auth/me", a.handleMe)
			r.Put("/auth/me", a.handleUpdateMe)

			r.Post("/servers/join", a.handleJoinServer)
			r.Get("/servers", a.handleListServers)
			r.Post("/servers", a.handleCreateServer)
			r.Get("/servers/{id}/invites", a.handleListServerInvites)
			r.Post("/servers/{id}/invites", a.handleCreateServerInvite)
			r.Post("/servers/{id}/leave", a.handleLeaveServer)

			r.Get("/categories", a.handleListCategories)
			r.Post("/categories", a.handleCreateCategory)
			r.Put("/categories/{id}", a.handleUpdateCategory)
			r.Delete("/categories/{id}", a.handleDeleteCategory)

			r.Get("/channels", a.handleListChannels)
			r.Post("/channels", a.handleCreateChannel)
			r.Delete("/channels/{id}", a.handleDeleteChannel)

			r.Get("/channels/{id}/messages", a.handleListMessages)
			r.Post("/channels/{id}/messages", a.handleCreateMessage)
			r.Delete("/messages/{id}", a.handleDeleteMessage)

			r.Get("/tasks", a.handleListTasks)
			r.Post("/tasks", a.handleCreateTask)
			r.Put("/tasks/{id}", a.handleUpdateTask)
			r.Delete("/tasks/{id}", a.handleDeleteTask)

			r.Get("/members", a.handleListMembers)
		})
	})

	r.Get("/api/ws/chat", a.handleChatWS)

	return r
}
