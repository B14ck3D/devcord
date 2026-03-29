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
	// Desktop updater feed (Electron Windows).
	DesktopUpdatesBaseURL   string
	DesktopUpdatesLocalDir  string
	DesktopLatestVersion    string
	DesktopArtifactName     string
	DesktopArtifactSHA512   string
	DesktopArtifactSize     string
	DesktopBlockMapSize     string
	DesktopReleaseDate      string
	DesktopReleaseNotes     string
	DesktopAppArchiveName   string
	DesktopAppArchiveSHA512 string
	DesktopAppArchiveSize   string
	DesktopBootstrapperName string
	DesktopBootstrapperURL  string
}

func LoadConfig() *Config {
	return &Config{
		DatabaseURL: unquoteEnv(os.Getenv("DATABASE_URL")),
		RedisAddr:   firstNonEmpty(unquoteEnv(os.Getenv("REDIS_ADDR")), "127.0.0.1:6379"),
		RedisPass:   unquoteEnv(os.Getenv("REDIS_PASSWORD")),
		JWTSecret:   unquoteEnv(os.Getenv("JWT_SECRET")),
		ListenAddr: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_API_LISTEN")),
			firstNonEmpty(unquoteEnv(os.Getenv("FLUX_API_LISTEN")), ":12823"),
		),
		SMTPHost:         unquoteEnv(os.Getenv("SMTP_HOST")),
		SMTPPort:         firstNonEmpty(unquoteEnv(os.Getenv("SMTP_PORT")), "587"),
		SMTPUser:         unquoteEnv(os.Getenv("SMTP_USER")),
		SMTPPassword:     unquoteEnv(os.Getenv("SMTP_PASSWORD")),
		SMTPFrom:         firstNonEmpty(unquoteEnv(os.Getenv("SMTP_FROM")), "noreply@ndevelopment.org"),
		LiveKitURL:       strings.TrimRight(unquoteEnv(os.Getenv("LIVEKIT_URL")), "/"),
		LiveKitAPIKey:    unquoteEnv(os.Getenv("LIVEKIT_API_KEY")),
		LiveKitAPISecret: unquoteEnv(os.Getenv("LIVEKIT_API_SECRET")),
		DesktopUpdatesBaseURL: strings.TrimRight(
			firstNonEmpty(
				unquoteEnv(os.Getenv("DEVCORD_UPDATES_BASE_URL")),
				"https://devcord.ndevelopment.org/updates/win",
			),
			"/",
		),
		DesktopUpdatesLocalDir: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_UPDATES_LOCAL_DIR")),
			"updates/win",
		),
		DesktopLatestVersion: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_LATEST_VERSION")),
			firstNonEmpty(unquoteEnv(os.Getenv("DEVCORD_DESKTOP_VERSION")), "0.0.0"),
		),
		DesktopArtifactName: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_ARTIFACT")),
			"Devcord-App-latest.zip",
		),
		DesktopArtifactSHA512: unquoteEnv(os.Getenv("DEVCORD_DESKTOP_SHA512")),
		DesktopArtifactSize:   firstNonEmpty(unquoteEnv(os.Getenv("DEVCORD_DESKTOP_SIZE")), "0"),
		DesktopBlockMapSize:   firstNonEmpty(unquoteEnv(os.Getenv("DEVCORD_DESKTOP_BLOCKMAP_SIZE")), "0"),
		DesktopReleaseDate: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_RELEASE_DATE")),
			"1970-01-01T00:00:00Z",
		),
		DesktopReleaseNotes: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_RELEASE_NOTES")),
			"Desktop release",
		),
		DesktopAppArchiveName: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_APP_ARCHIVE")),
			"Devcord-App-latest.zip",
		),
		DesktopAppArchiveSHA512: unquoteEnv(os.Getenv("DEVCORD_DESKTOP_APP_ARCHIVE_SHA512")),
		DesktopAppArchiveSize: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_DESKTOP_APP_ARCHIVE_SIZE")),
			"0",
		),
		DesktopBootstrapperName: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_BOOTSTRAPPER_ARTIFACT")),
			"Devcord_Installer.exe",
		),
		DesktopBootstrapperURL: firstNonEmpty(
			unquoteEnv(os.Getenv("DEVCORD_BOOTSTRAPPER_URL")),
			"https://devcord.ndevelopment.org/updates/win/Devcord_Installer.exe",
		),
	}
}

func firstNonEmpty(a, b string) string {
	if a != "" {
		return a
	}
	return b
}
