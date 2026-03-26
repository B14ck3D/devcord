package devcordapi

import (
	"errors"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

const accessTTL = 24 * time.Hour

func (a *App) issueAccessToken(userID int64) (string, error) {
	if len(a.cfg.JWTSecret) < 16 {
		return "", errors.New("JWT_SECRET too short")
	}
	t := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": strconv.FormatInt(userID, 10),
		"exp": time.Now().Add(accessTTL).Unix(),
		"iat": time.Now().Unix(),
	})
	return t.SignedString([]byte(a.cfg.JWTSecret))
}

func (a *App) parseUserIDFromBearer(authHeader string) (int64, error) {
	if authHeader == "" || len(authHeader) < 8 || authHeader[:7] != "Bearer " {
		return 0, errors.New("missing bearer")
	}
	tok, err := jwt.Parse(authHeader[7:], func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("bad alg")
		}
		return []byte(a.cfg.JWTSecret), nil
	})
	if err != nil || !tok.Valid {
		return 0, errors.New("invalid token")
	}
	claims, ok := tok.Claims.(jwt.MapClaims)
	if !ok {
		return 0, errors.New("claims")
	}
	sub, _ := claims["sub"].(string)
	if sub == "" {
		return 0, errors.New("sub")
	}
	return strconv.ParseInt(sub, 10, 64)
}
