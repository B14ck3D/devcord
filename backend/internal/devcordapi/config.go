package devcordapi

import (
	"os"
	"strings"
)

func unquoteEnv(s string) string {
	s = strings.TrimSpace(s)
	if len(s) >= 2 {
		switch {
		case s[0] == '"' && s[len(s)-1] == '"':
			return strings.TrimSpace(s[1 : len(s)-1])
		case s[0] == '\'' && s[len(s)-1] == '\'':
			return strings.TrimSpace(s[1 : len(s)-1])
		}
	}
	return s
}

type Config struct {
	DatabaseURL  string
	RedisAddr    string
	RedisPass    string
	JWTSecret    string
	ListenAddr   string
	SMTPHost     string
	SMTPPort     string
	SMTPUser     string
	SMTPPassword string
	SMTPFrom     string
	// LiveKit (SFU) — puste = endpoint /api/voice/livekit-token zwraca 503.
	LiveKitURL       string
	LiveKitAPIKey    string
	LiveKitAPISecret string
}

func LoadConfig() *Config {
	return &Config{
		DatabaseURL:  unquoteEnv(os.Getenv("DATABASE_URL")),
		RedisAddr:    firstNonEmpty(unquoteEnv(os.Getenv("REDIS_ADDR")), "127.0.0.1:6379"),
		RedisPass:    unquoteEnv(os.Getenv("REDIS_PASSWORD")),
		JWTSecret:    unquoteEnv(os.Getenv("JWT_SECRET")),
		ListenAddr: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_API_LISTEN")),
			firstNonEmpty(unquoteEnv(os.Getenv("FLUX_API_LISTEN")), ":12823"),
		),
		SMTPHost:     unquoteEnv(os.Getenv("SMTP_HOST")),
		SMTPPort:     firstNonEmpty(unquoteEnv(os.Getenv("SMTP_PORT")), "587"),
		SMTPUser:     unquoteEnv(os.Getenv("SMTP_USER")),
		SMTPPassword: unquoteEnv(os.Getenv("SMTP_PASSWORD")),
		SMTPFrom:     firstNonEmpty(unquoteEnv(os.Getenv("SMTP_FROM")), "noreply@ndevelopment.org"),
		LiveKitURL:       strings.TrimRight(unquoteEnv(os.Getenv("LIVEKIT_URL")), "/"),
		LiveKitAPIKey:    unquoteEnv(os.Getenv("LIVEKIT_API_KEY")),
		LiveKitAPISecret: unquoteEnv(os.Getenv("LIVEKIT_API_SECRET")),
	}
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
