package fluxapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type wsConn struct {
	hub      *ChatHub
	app      *App
	conn     *websocket.Conn
	send     chan []byte
	channels map[int64]struct{}
	uid      int64
	writeMu  sync.Mutex
}

var chatUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

func (a *App) handleChatWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	uid, err := a.parseUserIDFromBearer("Bearer " + token)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}
	c, err := chatUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	wc := &wsConn{
		hub:      a.chathub,
		app:      a,
		conn:     c,
		send:     make(chan []byte, 32),
		channels: make(map[int64]struct{}),
		uid:      uid,
	}
	go wc.writePump()
	wc.readPump()
}

type wsClientMsg struct {
	Type      string `json:"type"`
	ChannelID string `json:"channel_id"`
	Typing    *bool  `json:"typing"`
}

func (wcc *wsConn) readPump() {
	defer func() {
		wcc.hub.unsubscribeAll(wcc)
		_ = wcc.conn.Close()
	}()
	_ = wcc.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	wcc.conn.SetPongHandler(func(string) error {
		return wcc.conn.SetReadDeadline(time.Now().Add(90 * time.Second))
	})
	for {
		_, data, err := wcc.conn.ReadMessage()
		if err != nil {
			return
		}
		var m wsClientMsg
		if json.Unmarshal(data, &m) != nil || m.Type == "" {
			continue
		}
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		switch m.Type {
		case "subscribe":
			chID, err := strconv.ParseInt(m.ChannelID, 10, 64)
			if err != nil {
				cancel()
				continue
			}
			_, ok, err := wcc.app.requireChannelPerm(ctx, wcc.uid, chID, PermReadMessages)
			cancel()
			if err != nil || !ok {
				continue
			}
			wcc.hub.subscribe(chID, wcc)
		case "typing":
			chID, err := strconv.ParseInt(m.ChannelID, 10, 64)
			if err != nil {
				cancel()
				continue
			}
			_, ok, err := wcc.app.requireChannelPerm(ctx, wcc.uid, chID, PermSendMessages)
			cancel()
			if err != nil || !ok {
				continue
			}
			t := false
			if m.Typing != nil {
				t = *m.Typing
			}
			wcc.hub.maybeTyping(chID, wcc.uid, t)
		default:
			cancel()
		}
	}
}

func (wcc *wsConn) writePump() {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-wcc.send:
			_ = wcc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = wcc.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			wcc.writeMu.Lock()
			err := wcc.conn.WriteMessage(websocket.TextMessage, msg)
			wcc.writeMu.Unlock()
			if err != nil {
				return
			}
		case <-ticker.C:
			_ = wcc.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			wcc.writeMu.Lock()
			err := wcc.conn.WriteMessage(websocket.PingMessage, nil)
			wcc.writeMu.Unlock()
			if err != nil {
				return
			}
		}
	}
}
