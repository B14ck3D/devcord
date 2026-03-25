package fluxapi

import (
	"encoding/json"
	"strconv"
	"sync"
	"time"
)

type ChatHub struct {
	mu      sync.RWMutex
	ch      map[int64]map[*wsConn]struct{}
	app     *App
	typMu   sync.Mutex
	lastTyp map[string]time.Time
}

func newChatHub() *ChatHub {
	return &ChatHub{
		ch:      make(map[int64]map[*wsConn]struct{}),
		lastTyp: make(map[string]time.Time),
	}
}

func (h *ChatHub) subscribe(chID int64, c *wsConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	if h.ch[chID] == nil {
		h.ch[chID] = make(map[*wsConn]struct{})
	}
	h.ch[chID][c] = struct{}{}
	c.channels[chID] = struct{}{}
}

func (h *ChatHub) unsubscribeAll(c *wsConn) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for chID := range c.channels {
		if m, ok := h.ch[chID]; ok {
			delete(m, c)
			if len(m) == 0 {
				delete(h.ch, chID)
			}
		}
	}
	for k := range c.channels {
		delete(c.channels, k)
	}
}

func (h *ChatHub) Broadcast(chID int64, msg []byte) {
	h.mu.RLock()
	m := h.ch[chID]
	h.mu.RUnlock()
	for c := range m {
		select {
		case c.send <- msg:
		default:
		}
	}
}

func (h *ChatHub) BroadcastGlobal(msg []byte) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	seen := make(map[*wsConn]struct{})
	for _, m := range h.ch {
		for c := range m {
			if _, ok := seen[c]; !ok {
				seen[c] = struct{}{}
				select {
				case c.send <- msg:
				default:
				}
			}
		}
	}
}

func (h *ChatHub) maybeTyping(chID, uid int64, typing bool) {
	key := strconv.FormatInt(chID, 10) + ":" + strconv.FormatInt(uid, 10)
	now := time.Now()
	h.typMu.Lock()
	if typing {
		if t, ok := h.lastTyp[key]; ok && now.Sub(t) < 3*time.Second {
			h.typMu.Unlock()
			return
		}
		h.lastTyp[key] = now
	} else {
		delete(h.lastTyp, key)
	}
	h.typMu.Unlock()
	payload, err := json.Marshal(map[string]interface{}{
		"type": "typing",
		"payload": map[string]interface{}{
			"user_id":    strconv.FormatInt(uid, 10),
			"channel_id": strconv.FormatInt(chID, 10),
			"typing":     typing,
		},
	})
	if err != nil {
		return
	}
	h.Broadcast(chID, payload)
}
