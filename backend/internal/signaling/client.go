package signaling

import (
	"log"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20
)

type Client struct {
	hub     *Hub
	conn    *websocket.Conn
	send    chan []byte
	userID  string
	roomID  string
	room    *Room
	// authSub — JWT sub po weryfikacji przy upgrade (pusty = tryb bez auth).
	authSub string
	joinMu  sync.Mutex
	closeMu sync.Mutex
	closed  bool
}

func newClient(hub *Hub, conn *websocket.Conn, authSub string) *Client {
	return &Client{
		hub:     hub,
		conn:    conn,
		send:    make(chan []byte, 256),
		authSub: authSub,
	}
}

func (c *Client) UserID() string { return c.userID }
func (c *Client) RoomID() string { return c.roomID }

func (c *Client) Close() {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	if c.closed {
		return
	}
	c.closed = true
	_ = c.conn.Close()
	close(c.send)
}

func (c *Client) Send(b []byte) bool {
	c.closeMu.Lock()
	defer c.closeMu.Unlock()
	if c.closed {
		return false
	}
	select {
	case c.send <- b:
		return true
	default:
		return false
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister(c)
		c.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		return c.conn.SetReadDeadline(time.Now().Add(pongWait))
	})

	for {
		_, data, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("websocket read error: %v", err)
			}
			return
		}
		if err := c.hub.handleInbound(c, data); err != nil {
			if b, mErr := MarshalEnvelope(TypeError, ErrorPayload{Code: "signal", Message: err.Error()}); mErr == nil {
				_ = c.Send(b)
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()

	for {
		select {
		case msg, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (c *Client) Serve() {
	go c.writePump()
	c.readPump()
}
