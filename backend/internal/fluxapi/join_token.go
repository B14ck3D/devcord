package fluxapi

import (
	"net/url"
	"regexp"
	"strings"
)

var joinPathRe = regexp.MustCompile(`(?i)/(?:join|invite)/([^/?#]+)`)

func extractJoinToken(raw string) string {
	raw = strings.TrimSpace(raw)
	if m := joinPathRe.FindStringSubmatch(raw); len(m) == 2 {
		return strings.TrimSpace(m[1])
	}
	u, err := url.Parse(raw)
	if err == nil && u.Path != "" {
		if m := joinPathRe.FindStringSubmatch(u.Path); len(m) == 2 {
			return strings.TrimSpace(m[1])
		}
	}
	return strings.TrimSpace(raw)
}
