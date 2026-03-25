package signaling

import (
	"encoding/json"
	"net/http"

	"github.com/gorilla/websocket"
)

func ServeWS(hub *Hub) http.HandlerFunc {
	upgrader := websocket.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		CheckOrigin:     func(r *http.Request) bool { return true },
	}
	return func(w http.ResponseWriter, r *http.Request) {
		conn, err := upgrader.Upgrade(w, r, nil)
		if err != nil {
			return
		}
		client := newClient(hub, conn)
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
	c.userID = p.UserID
	room := h.getOrCreateRoom(p.RoomID)
	others, err := room.Add(c)
	if err != nil {
		c.userID = ""
		return err
	}
	c.roomID = p.RoomID
	c.room = room

	peerIDs := room.PeerIDs(c.userID)
	bJoined, err := MarshalEnvelope(TypeJoined, JoinedPayload{
		RoomID:  p.RoomID,
		UserID:  p.UserID,
		PeerIDs: peerIDs,
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
