package signaling

import "encoding/json"

type MessageType string

const (
	TypeJoinRoom         MessageType = "join_room"
	TypeOffer            MessageType = "offer"
	TypeAnswer           MessageType = "answer"
	TypeICECandidate     MessageType = "ice_candidate"
	TypeLeave            MessageType = "leave"
	TypeUserDisconnected MessageType = "user_disconnected"
	TypeJoined           MessageType = "joined"
	TypeUserJoined       MessageType = "user_joined"
	TypeError            MessageType = "error"
)

type Envelope struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

type JoinRoomPayload struct {
	UserID string `json:"user_id"`
	RoomID string `json:"room_id"`
}

type SessionDescriptionPayload struct {
	TargetUserID string `json:"target_user_id"`
	SDP          string `json:"sdp"`
	Type         string `json:"type"`
}

type ICECandidatePayload struct {
	TargetUserID string          `json:"target_user_id"`
	Candidate    json.RawMessage `json:"candidate"`
}

type UserIDPayload struct {
	UserID string `json:"user_id"`
}

type JoinedPayload struct {
	RoomID  string   `json:"room_id"`
	UserID  string   `json:"user_id"`
	PeerIDs []string `json:"peer_ids"`
}

type ForwardedSessionDescriptionPayload struct {
	FromUserID string `json:"from_user_id"`
	SDP        string `json:"sdp"`
	Type       string `json:"type"`
}

type ForwardedICECandidatePayload struct {
	FromUserID string          `json:"from_user_id"`
	Candidate  json.RawMessage `json:"candidate"`
}

type ErrorPayload struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func MarshalEnvelope(t MessageType, payload any) ([]byte, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Type: t, Payload: raw})
}
