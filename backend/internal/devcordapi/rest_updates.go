package devcordapi

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
)

type desktopUpdateFile struct {
	URL          string `json:"url"`
	SHA512       string `json:"sha512"`
	Size         int64  `json:"size"`
	BlockMapSize int64  `json:"blockMapSize,omitempty"`
}

type desktopUpdateInfo struct {
	Provider     string              `json:"provider"`
	URL          string              `json:"url"`
	Version      string              `json:"version"`
	ReleaseDate  string              `json:"releaseDate"`
	ReleaseNotes string              `json:"releaseNotes,omitempty"`
	Path         string              `json:"path"`
	SHA512       string              `json:"sha512"`
	Files        []desktopUpdateFile `json:"files"`
	AppArchive   desktopUpdateFile   `json:"app_archive"`
	Bootstrapper struct {
		URL      string `json:"url"`
		FileName string `json:"fileName"`
	} `json:"bootstrapper"`
}

func (a *App) composeDesktopUpdateInfo() desktopUpdateInfo {
	base := strings.TrimSpace(a.cfg.DesktopUpdatesBaseURL)
	size, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopArtifactSize), 10, 64)
	blockMapSize, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopBlockMapSize), 10, 64)
	artifact := strings.TrimSpace(a.cfg.DesktopArtifactName)
	if artifact == "" {
		artifact = "Devcord-Setup-latest.exe"
	}
	sha := strings.TrimSpace(a.cfg.DesktopArtifactSHA512)
	appArchiveName := strings.TrimSpace(a.cfg.DesktopAppArchiveName)
	if appArchiveName == "" {
		appArchiveName = "Devcord-App-latest.7z"
	}
	appArchiveSha := strings.TrimSpace(a.cfg.DesktopAppArchiveSHA512)
	appArchiveSize, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopAppArchiveSize), 10, 64)
	appArchiveURL := fmt.Sprintf("%s/%s", strings.TrimRight(base, "/"), strings.TrimLeft(appArchiveName, "/"))
	bootstrapperName := strings.TrimSpace(a.cfg.DesktopBootstrapperName)
	if bootstrapperName == "" {
		bootstrapperName = "Devcord_Installer.exe"
	}
	bootstrapperURL := strings.TrimSpace(a.cfg.DesktopBootstrapperURL)
	if bootstrapperURL == "" {
		bootstrapperURL = fmt.Sprintf("%s/%s", strings.TrimRight(base, "/"), strings.TrimLeft(bootstrapperName, "/"))
	}
	artifactURL := fmt.Sprintf("%s/%s", strings.TrimRight(base, "/"), strings.TrimLeft(artifact, "/"))

	info := desktopUpdateInfo{
		Provider:     "generic",
		URL:          base,
		Version:      strings.TrimSpace(a.cfg.DesktopLatestVersion),
		ReleaseDate:  strings.TrimSpace(a.cfg.DesktopReleaseDate),
		ReleaseNotes: strings.TrimSpace(a.cfg.DesktopReleaseNotes),
		Path:         artifactURL,
		SHA512:       sha,
		Files: []desktopUpdateFile{
			{
				URL:          artifactURL,
				SHA512:       sha,
				Size:         size,
				BlockMapSize: blockMapSize,
			},
		},
		AppArchive: desktopUpdateFile{
			URL:    appArchiveURL,
			SHA512: appArchiveSha,
			Size:   appArchiveSize,
		},
	}
	info.Bootstrapper.URL = bootstrapperURL
	info.Bootstrapper.FileName = bootstrapperName
	if info.Version == "" {
		info.Version = "0.0.0"
	}
	if info.ReleaseDate == "" {
		info.ReleaseDate = "1970-01-01T00:00:00Z"
	}
	return info
}

// GET /api/updates/latest — JSON feed used by desktop client.
func (a *App) handleUpdatesLatest(w http.ResponseWriter, _ *http.Request) {
	base := strings.TrimSpace(a.cfg.DesktopUpdatesBaseURL)
	if base == "" {
		jsonErr(w, http.StatusServiceUnavailable, "desktop updates feed not configured")
		return
	}
	info := a.composeDesktopUpdateInfo()
	jsonWrite(w, http.StatusOK, info)
}

// GET /api/updates/latest.yml — generic provider feed for electron-updater.
func (a *App) handleUpdatesLatestYml(w http.ResponseWriter, _ *http.Request) {
	base := strings.TrimSpace(a.cfg.DesktopUpdatesBaseURL)
	if base == "" {
		http.Error(w, "desktop updates feed not configured", http.StatusServiceUnavailable)
		return
	}
	info := a.composeDesktopUpdateInfo()
	file := info.Files[0]

	w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(
		w,
		"version: %s\nfiles:\n  - url: %s\n    sha512: %s\n    size: %d\npath: %s\nsha512: %s\nreleaseDate: %s\nreleaseNotes: %s\n",
		info.Version,
		file.URL,
		file.SHA512,
		file.Size,
		info.Path,
		info.SHA512,
		info.ReleaseDate,
		strings.ReplaceAll(info.ReleaseNotes, "\n", " "),
	)
}
