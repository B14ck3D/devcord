package signaling

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gorilla/websocket"
)

// ServeWS — gdy jwtSecret niepusty, wymaga query `access_token` (JWT devcord-api); sub musi zgadzać się z user_id w join_room.
func ServeWS(hub *Hub, jwtSecret string) http.HandlerFunc {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}
	jwtSecret = strings.TrimSpace(jwtSecret)
	return func(w http.ResponseWriter, r *http.Request) {
		var authSub string
		if jwtSecret != "" {
			tok := strings.TrimSpace(r.URL.Query().Get("access_token"))
			if tok == "" {
				http.Error(w, "missing access_token", http.StatusUnauthorized)
				return
			}
			sub, err := ParseDevcordAccessSub(jwtSecret, tok)
			if err != nil {
				http.Error(w, "unauthorized", http.StatusUnauthorized)
				return
			}
			authSub = sub
		}
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := newClient(hub, conn, authSub)
		go client.Serve()
	}
}

func (h *Hub) handleInbound(c *Client, data []byte) error {
	var env Envelope
	if err := json.Unmarshal(data, &env); err != nil {
		return ErrBadPayload
	}
	switch env.Type {
	case TypeJoinRoom:
		return h.handleJoinRoom(c, env.Payload)
	case TypeOffer:
		return h.handleForwardSession(c, TypeOffer, env.Payload)
	case TypeAnswer:
		return h.handleForwardSession(c, TypeAnswer, env.Payload)
	case TypeICECandidate:
		return h.handleForwardICE(c, env.Payload)
	case TypeVoiceState, TypeUserProfileUpdated:
		return h.handleBroadcastToRoom(c, env.Type, env.Payload)
	case TypeMediaState:
		return h.handleMediaState(c, env.Payload)
	case TypeLeave, TypeUserDisconnected:
		h.unregister(c)
		return nil
	default:
		return ErrBadPayload
	}
}

func (h *Hub) handleJoinRoom(c *Client, payload json.RawMessage) error {
	c.joinMu.Lock()
	defer c.joinMu.Unlock()
	if c.room != nil {
		return ErrAlreadyJoined
	}
	var p JoinRoomPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return ErrBadPayload
	}
	if p.UserID == "" || p.RoomID == "" {
		return ErrInvalidJoin
	}
	if c.authSub != "" && c.authSub != p.UserID {
		return ErrJoinIdentityMismatch
	}
	c.userID = p.UserID
	room := h.getOrCreateRoom(p.RoomID)
	// Ta sama tożsamość z drugiej karty / po zerwaniu TCP bez leave — wyrzuć starą sesję zamiast ErrUserExists.
	if existing := room.Get(p.UserID); existing != nil {
		h.unregister(existing)
	}
	others, err := room.Add(c)
	if err != nil {
		c.userID = ""
		return err
	}
	c.roomID = p.RoomID
	c.room = room

	peerIDs := room.PeerIDs(c.userID)
	bJoined, err := MarshalEnvelope(TypeJoined, JoinedPayload{
		RoomID:    p.RoomID,
		UserID:    p.UserID,
		PeerIDs:   peerIDs,
		PeerMedia: room.PeerMediaSnapshot(peerIDs),
	})
	if err != nil {
		room.Remove(c.userID)
		c.room = nil
		c.roomID = ""
		c.userID = ""
		return err
	}
	if !c.Send(bJoined) {
		room.Remove(c.userID)
		c.room = nil
		c.roomID = ""
		c.userID = ""
		return ErrBadPayload
	}
	bUserJoined, err := MarshalEnvelope(TypeUserJoined, UserIDPayload{UserID: p.UserID})
	if err != nil {
		return nil
	}
	for _, oc := range others {
		oc.Send(bUserJoined)
	}
	return nil
}

func (h *Hub) handleForwardSession(c *Client, msgType MessageType, payload json.RawMessage) error {
	if c.room == nil {
		return ErrNotJoined
	}
	var p SessionDescriptionPayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return ErrBadPayload
	}
	if p.TargetUserID == "" || p.SDP == "" {
		return ErrBadPayload
	}
	room := c.room
	target := room.Get(p.TargetUserID)
	if target == nil {
		return ErrUnknownUser
	}
	out, err := MarshalEnvelope(msgType, ForwardedSessionDescriptionPayload{
		FromUserID: c.userID,
		SDP:        p.SDP,
		Type:       p.Type,
	})
	if err != nil {
		return err
	}
	if !target.Send(out) {
		return ErrUnknownUser
	}
	return nil
}

func (h *Hub) handleForwardICE(c *Client, payload json.RawMessage) error {
	if c.room == nil {
		return ErrNotJoined
	}
	var p ICECandidatePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return ErrBadPayload
	}
	if p.TargetUserID == "" || len(p.Candidate) == 0 {
		return ErrBadPayload
	}
	room := c.room
	target := room.Get(p.TargetUserID)
	if target == nil {
		return ErrUnknownUser
	}
	out, err := MarshalEnvelope(TypeICECandidate, ForwardedICECandidatePayload{
		FromUserID: c.userID,
		Candidate:  p.Candidate,
	})
	if err != nil {
		return err
	}
	if !target.Send(out) {
		return ErrUnknownUser
	}
	return nil
}

func (h *Hub) handleMediaState(c *Client, payload json.RawMessage) error {
	if c.room == nil {
		return ErrNotJoined
	}
	var p MediaStatePayload
	if err := json.Unmarshal(payload, &p); err != nil {
		return ErrBadPayload
	}
	if p.UserID == "" || p.UserID != c.userID {
		return ErrBadPayload
	}
	c.room.SetPeerMedia(p.UserID, p.Screen, p.Camera)
	return h.handleBroadcastToRoom(c, TypeMediaState, payload)
}

func (h *Hub) handleBroadcastToRoom(c *Client, msgType MessageType, payload json.RawMessage) error {
	if c.room == nil {
		return ErrNotJoined
	}
	out, err := json.Marshal(Envelope{Type: msgType, Payload: payload})
	if err != nil {
		return err
	}
	for _, pid := range c.room.PeerIDs(c.userID) {
		target := c.room.Get(pid)
		if target != nil {
			target.Send(out)
		}
	}
	return nil
}

func (h *Hub) unregister(c *Client) {
	c.joinMu.Lock()
	defer c.joinMu.Unlock()
	if c.room == nil {
		return
	}
	room := c.room
	userID := c.userID
	roomID := c.roomID

	removed := room.Remove(userID)
	if removed == nil {
		c.room = nil
		c.userID = ""
		c.roomID = ""
		return
	}

	b, err := MarshalEnvelope(TypeUserDisconnected, UserIDPayload{UserID: userID})
	if err != nil {
		b = nil
	}
	peerIDs := room.PeerIDs("")
	for _, pid := range peerIDs {
		target := room.Get(pid)
		if target != nil && b != nil {
			target.Send(b)
		}
	}

	h.removeRoomIfEmpty(roomID)
	c.room = nil
	c.userID = ""
	c.roomID = ""
}
