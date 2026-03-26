package signaling

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

// ParseDevcordAccessSub wyciąga sub (user id) z JWT takiego samego jak devcord-api (HS256 + JWT_SECRET).
func ParseDevcordAccessSub(secret, bearerOrRaw string) (string, error) {
	secret = strings.TrimSpace(secret)
	if len(secret) < 16 {
		return "", errors.New("jwt secret too short")
	}
	raw := strings.TrimSpace(bearerOrRaw)
	if raw == "" {
		return "", errors.New("missing token")
	}
	if strings.HasPrefix(strings.ToLower(raw), "bearer ") {
		raw = strings.TrimSpace(raw[7:])
	}
	tok, err := jwt.Parse(raw, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("bad alg")
		}
		return []byte(secret), nil
	})
	if err != nil || !tok.Valid {
		return "", errors.New("invalid token")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return "", errors.New("claims")
	}
	subVal, ok := claims["sub"]
	if !ok || subVal == nil {
		return "", errors.New("sub")
	}
	switch v := subVal.(type) {
	case string:
		if v == "" {
			return "", errors.New("sub")
		}
		return v, nil
	case float64:
		return strconv.FormatInt(int64(v), 10), nil
	default:
		s := strings.TrimSpace(fmt.Sprint(subVal))
		if s == "" {
			return "", errors.New("sub")
		}
		return s, nil
	}
}
