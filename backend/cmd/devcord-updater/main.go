package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type updateFeed struct {
	Version      string `json:"version"`
	AppArchive   struct {
		URL string `json:"url"`
	} `json:"app_archive"`
	Bootstrapper struct {
		URL      string `json:"url"`
		FileName string `json:"fileName"`
	} `json:"bootstrapper"`
}

func main() {
	feedURL := flag.String("feed", "https://devcord.ndevelopment.org/api/updates/latest", "JSON update feed URL")
	archiveURL := flag.String("archive-url", "", "override app archive URL")
	installerURL := flag.String("installer-url", "", "override installer URL")
	workDir := flag.String("workdir", defaultWorkDir(), "directory for downloaded artifacts")
	timeout := flag.Duration("timeout", 10*time.Minute, "HTTP timeout")
	flag.Parse()

	if runtime.GOOS != "windows" {
		fmt.Fprintln(os.Stderr, "Devcord Updater supports only Windows.")
		os.Exit(2)
	}

	if err := run(*feedURL, *archiveURL, *installerURL, *workDir, *timeout); err != nil {
		fmt.Fprintln(os.Stderr, "Update failed:", err)
		os.Exit(1)
	}

	fmt.Println("Update process started. Devcord should restart after installer completes.")
}

func run(feedURL, archiveURLOverride, installerURLOverride, workDir string, timeout time.Duration) error {
	client := &http.Client{Timeout: timeout}
	feed, err := fetchFeed(client, feedURL)
	if err != nil {
		return err
	}

	archiveURL := strings.TrimSpace(archiveURLOverride)
	if archiveURL == "" {
		archiveURL = strings.TrimSpace(feed.AppArchive.URL)
	}
	if archiveURL == "" {
		return errors.New("missing app archive URL")
	}

	installerURL := strings.TrimSpace(installerURLOverride)
	if installerURL == "" {
		installerURL = strings.TrimSpace(feed.Bootstrapper.URL)
	}
	if installerURL == "" {
		return errors.New("missing bootstrapper URL")
	}

	if err := os.MkdirAll(workDir, 0o755); err != nil {
		return fmt.Errorf("create workdir: %w", err)
	}

	zipPath := filepath.Join(workDir, "devcord-update.zip")
	installerPath := filepath.Join(workDir, "Devcord_Installer.exe")

	if err := downloadToFile(client, archiveURL, zipPath); err != nil {
		return fmt.Errorf("download archive: %w", err)
	}
	if err := downloadToFile(client, installerURL, installerPath); err != nil {
		return fmt.Errorf("download installer: %w", err)
	}

	cmd := exec.Command(installerPath, "--update-mode", "--archive-path="+zipPath)
	applyDetachedProcessAttrs(cmd)
	if err := cmd.Start(); err != nil {
		return fmt.Errorf("start installer: %w", err)
	}
	return nil
}

func fetchFeed(client *http.Client, url string) (*updateFeed, error) {
	resp, err := client.Get(url)
	if err != nil {
		return nil, fmt.Errorf("request feed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("feed http status: %s", resp.Status)
	}
	var feed updateFeed
	if err := json.NewDecoder(resp.Body).Decode(&feed); err != nil {
		return nil, fmt.Errorf("decode feed: %w", err)
	}
	return &feed, nil
}

func downloadToFile(client *http.Client, url, dst string) error {
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("http status: %s", resp.Status)
	}

	tmp := dst + ".downloading"
	_ = os.Remove(tmp)
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	_, cpErr := io.Copy(f, resp.Body)
	closeErr := f.Close()
	if cpErr != nil {
		return cpErr
	}
	if closeErr != nil {
		return closeErr
	}
	if err := os.Rename(tmp, dst); err != nil {
		return err
	}
	return nil
}

func defaultWorkDir() string {
	localAppData := strings.TrimSpace(os.Getenv("LOCALAPPDATA"))
	if localAppData != "" {
		return filepath.Join(localAppData, "Devcord-Updater")
	}
	return filepath.Join(os.TempDir(), "Devcord-Updater")
}
