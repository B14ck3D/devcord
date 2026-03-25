package fluxapi

import (
	"context"
	"encoding/json"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

const msgListMax = 200

type cachedMessage struct {
	ID        string `json:"id"`
	ChannelID string `json:"channel_id"`
	UserID    string `json:"user_id"`
	Content   string `json:"content"`
	CreatedAt string `json:"created_at"`
	IsEdited  bool   `json:"is_edited"`
}

func msgListKey(channelID int64) string {
	return "devcord:msglist:" + strconv.FormatInt(channelID, 10)
}

func (a *App) redisPushMessage(ctx context.Context, chID int64, m cachedMessage) error {
	b, err := json.Marshal(m)
	if err != nil {
		return err
	}
	pipe := a.rdb.Pipeline()
	pipe.LPush(ctx, msgListKey(chID), string(b))
	pipe.LTrim(ctx, msgListKey(chID), 0, msgListMax-1)
	_, err = pipe.Exec(ctx)
	return err
}

func (a *App) redisListMessages(ctx context.Context, chID int64, limit int) ([]cachedMessage, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	raw, err := a.rdb.LRange(ctx, msgListKey(chID), 0, int64(limit-1)).Result()
	if err != nil && err != redis.Nil {
		return nil, err
	}
	out := make([]cachedMessage, 0, len(raw))
	for _, s := range raw {
		var m cachedMessage
		if json.Unmarshal([]byte(s), &m) == nil {
			out = append(out, m)
		}
	}
	return out, nil
}

func (a *App) redisInvalidateChannel(ctx context.Context, chID int64) error {
	return a.rdb.Del(ctx, msgListKey(chID)).Err()
}

func chatRowTime(t time.Time) string {
	return t.UTC().Format("15:04")
}
