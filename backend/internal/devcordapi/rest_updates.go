package devcordapi

import (
	"crypto/sha512"
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
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

type localDesktopArchiveInfo struct {
	Version      string
	FileName     string
	Size         int64
	SHA512Base64 string
	ModifiedAt   time.Time
}

var versionedZipPattern = regexp.MustCompile(`^Devcord-App-(\d+)\.(\d+)\.(\d+)\.zip$`)

func parseTripleInts(parts []string) (int, int, int, bool) {
	if len(parts) != 3 {
		return 0, 0, 0, false
	}
	maj, errMaj := strconv.Atoi(parts[0])
	min, errMin := strconv.Atoi(parts[1])
	patch, errPatch := strconv.Atoi(parts[2])
	if errMaj != nil || errMin != nil || errPatch != nil {
		return 0, 0, 0, false
	}
	return maj, min, patch, true
}

func versionGreater(a, b string) bool {
	aMaj, aMin, aPatch, okA := parseTripleInts(strings.Split(strings.TrimSpace(a), "."))
	bMaj, bMin, bPatch, okB := parseTripleInts(strings.Split(strings.TrimSpace(b), "."))
	if !okA {
		return false
	}
	if !okB {
		return true
	}
	if aMaj != bMaj {
		return aMaj > bMaj
	}
	if aMin != bMin {
		return aMin > bMin
	}
	return aPatch > bPatch
}

func computeSHA512Base64(filePath string) (string, int64, time.Time, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return "", 0, time.Time{}, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return "", 0, time.Time{}, err
	}

	hasher := sha512.New()
	if _, err := io.Copy(hasher, f); err != nil {
		return "", 0, time.Time{}, err
	}
	return base64.StdEncoding.EncodeToString(hasher.Sum(nil)), stat.Size(), stat.ModTime().UTC(), nil
}

func discoverLatestArchiveFromLocal(localDir string) (localDesktopArchiveInfo, bool) {
	dir := strings.TrimSpace(localDir)
	if dir == "" {
		return localDesktopArchiveInfo{}, false
	}
	pathsToTry := []string{filepath.Clean(dir)}
	if !filepath.IsAbs(dir) {
		pathsToTry = append(pathsToTry, filepath.Clean(filepath.Join("..", dir)))
	}

	var (
		entries []os.DirEntry
		err     error
		baseDir string
	)
	for _, candidate := range pathsToTry {
		entries, err = os.ReadDir(candidate)
		if err == nil {
			baseDir = candidate
			break
		}
	}
	if baseDir == "" {
		return localDesktopArchiveInfo{}, false
	}

	type versioned struct {
		version string
		file    string
	}
	var files []versioned
	for _, entry := range entries {
		if entry.IsDir() {
			continue
		}
		matches := versionedZipPattern.FindStringSubmatch(entry.Name())
		if len(matches) != 4 {
			continue
		}
		ver := fmt.Sprintf("%s.%s.%s", matches[1], matches[2], matches[3])
		files = append(files, versioned{version: ver, file: entry.Name()})
	}
	if len(files) == 0 {
		return localDesktopArchiveInfo{}, false
	}

	sort.Slice(files, func(i, j int) bool {
		return versionGreater(files[i].version, files[j].version)
	})
	latest := files[0]

	chosenFile := "Devcord-App-latest.zip"
	chosenPath := filepath.Join(baseDir, chosenFile)
	if _, err := os.Stat(chosenPath); err != nil {
		chosenFile = latest.file
		chosenPath = filepath.Join(baseDir, chosenFile)
	}

	sha, size, modifiedAt, err := computeSHA512Base64(chosenPath)
	if err != nil {
		return localDesktopArchiveInfo{}, false
	}

	return localDesktopArchiveInfo{
		Version:      latest.version,
		FileName:     chosenFile,
		Size:         size,
		SHA512Base64: sha,
		ModifiedAt:   modifiedAt,
	}, true
}

func (a *App) composeDesktopUpdateInfo() desktopUpdateInfo {
	base := strings.TrimSpace(a.cfg.DesktopUpdatesBaseURL)
	size, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopArtifactSize), 10, 64)
	blockMapSize, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopBlockMapSize), 10, 64)
	artifact := strings.TrimSpace(a.cfg.DesktopArtifactName)
	if artifact == "" {
		artifact = "Devcord-App-latest.zip"
	}
	sha := strings.TrimSpace(a.cfg.DesktopArtifactSHA512)
	appArchiveName := strings.TrimSpace(a.cfg.DesktopAppArchiveName)
	if appArchiveName == "" {
		appArchiveName = "Devcord-App-latest.zip"
	}
	appArchiveSha := strings.TrimSpace(a.cfg.DesktopAppArchiveSHA512)
	appArchiveSize, _ := strconv.ParseInt(strings.TrimSpace(a.cfg.DesktopAppArchiveSize), 10, 64)
	version := strings.TrimSpace(a.cfg.DesktopLatestVersion)
	releaseDate := strings.TrimSpace(a.cfg.DesktopReleaseDate)

	if localInfo, ok := discoverLatestArchiveFromLocal(a.cfg.DesktopUpdatesLocalDir); ok {
		if version == "" || version == "0.0.0" {
			version = localInfo.Version
		}
		if releaseDate == "" || releaseDate == "1970-01-01T00:00:00Z" {
			releaseDate = localInfo.ModifiedAt.Format(time.RFC3339)
		}
		if appArchiveName == "" || appArchiveName == "Devcord-App-latest.zip" {
			appArchiveName = localInfo.FileName
		}
		if appArchiveSha == "" {
			appArchiveSha = localInfo.SHA512Base64
		}
		if appArchiveSize <= 0 {
			appArchiveSize = localInfo.Size
		}
		if artifact == "" || artifact == "Devcord-App-latest.zip" || artifact == "Devcord-Setup-latest.exe" {
			artifact = appArchiveName
		}
		if sha == "" {
			sha = appArchiveSha
		}
		if size <= 0 {
			size = appArchiveSize
		}
	}

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
		Version:      version,
		ReleaseDate:  releaseDate,
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

// GET /api/updates — convenience endpoint for feed debugging.
func (a *App) handleUpdatesRoot(w http.ResponseWriter, r *http.Request) {
	http.Redirect(w, r, "/api/updates/latest.yml", http.StatusTemporaryRedirect)
}

// GET /api/updates/{artifact} — redirect artifact download to static updates directory.
func (a *App) handleUpdatesArtifact(w http.ResponseWriter, r *http.Request) {
	base := strings.TrimSpace(a.cfg.DesktopUpdatesBaseURL)
	if base == "" {
		http.Error(w, "desktop updates feed not configured", http.StatusServiceUnavailable)
		return
	}
	artifact := strings.TrimSpace(strings.Trim(filepath.Base(chi.URLParam(r, "artifact")), "/"))
	if artifact == "" || artifact == "." || artifact == ".." {
		http.Error(w, "invalid artifact", http.StatusBadRequest)
		return
	}
	http.Redirect(
		w,
		r,
		fmt.Sprintf("%s/%s", strings.TrimRight(base, "/"), artifact),
		http.StatusTemporaryRedirect,
	)
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
	// electron-updater on Windows expects relative file names in latest.yml.
	// Absolute URLs in "path"/"files.url" can be interpreted as file paths and fail with ENOENT.
	fileName := strings.TrimSpace(file.URL)
	if fileName == "" {
		fileName = strings.TrimSpace(info.Path)
	}
	fileName = filepath.Base(strings.ReplaceAll(fileName, "\\", "/"))
	if fileName == "." || fileName == "/" || fileName == "" {
		fileName = "Devcord-App-latest.zip"
	}

	w.Header().Set("Content-Type", "text/yaml; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	_, _ = fmt.Fprintf(
		w,
		"version: %s\nfiles:\n  - url: %s\n    sha512: %s\n    size: %d\npath: %s\nsha512: %s\nreleaseDate: %s\nreleaseNotes: %s\n",
		info.Version,
		fileName,
		file.SHA512,
		file.Size,
		fileName,
		info.SHA512,
		info.ReleaseDate,
		strings.ReplaceAll(strings.TrimSpace(info.ReleaseNotes), "\n", " "),
	)
}
