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
	TypeVoiceState       MessageType = "voice_state"
	TypeUserProfileUpdated MessageType = "user_profile_updated"
	TypeMediaState         MessageType = "media_state"
	TypeError              MessageType = "error"
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

type PeerMediaEntry struct {
	UserID string `json:"user_id"`
	Screen bool   `json:"screen"`
	Camera bool   `json:"camera"`
}

type JoinedPayload struct {
	RoomID    string           `json:"room_id"`
	UserID    string           `json:"user_id"`
	PeerIDs   []string         `json:"peer_ids"`
	PeerMedia []PeerMediaEntry `json:"peer_media,omitempty"`
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

type VoiceStatePayload struct {
	UserID   string `json:"user_id"`
	Muted    bool   `json:"muted"`
	Deafened bool   `json:"deafened"`
}

type UserProfileUpdatedPayload struct {
	UserID string `json:"user_id"`
}

type MediaStatePayload struct {
	UserID string `json:"user_id"`
	Screen bool   `json:"screen"`
	Camera bool   `json:"camera"`
}

func MarshalEnvelope(t MessageType, payload any) ([]byte, error) {
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return json.Marshal(Envelope{Type: t, Payload: raw})
}

func (p *JoinRoomPayload) UnmarshalJSON(b []byte) error {
	var aux struct {
		UserID interface{} `json:"user_id"`
		RoomID interface{} `json:"room_id"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	p.UserID = unstructuredIDToString(aux.UserID)
	p.RoomID = unstructuredIDToString(aux.RoomID)
	return nil
}

func (p *SessionDescriptionPayload) UnmarshalJSON(b []byte) error {
	var aux struct {
		TargetUserID interface{} `json:"target_user_id"`
		SDP          string        `json:"sdp"`
		Type         string        `json:"type"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	p.TargetUserID = unstructuredIDToString(aux.TargetUserID)
	p.SDP = aux.SDP
	p.Type = aux.Type
	return nil
}

func (p *ICECandidatePayload) UnmarshalJSON(b []byte) error {
	var aux struct {
		TargetUserID interface{}     `json:"target_user_id"`
		Candidate    json.RawMessage `json:"candidate"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	p.TargetUserID = unstructuredIDToString(aux.TargetUserID)
	p.Candidate = aux.Candidate
	return nil
}

func (p *MediaStatePayload) UnmarshalJSON(b []byte) error {
	var aux struct {
		UserID interface{} `json:"user_id"`
		Screen bool        `json:"screen"`
		Camera bool        `json:"camera"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	p.UserID = unstructuredIDToString(aux.UserID)
	p.Screen = aux.Screen
	p.Camera = aux.Camera
	return nil
}

func (p *VoiceStatePayload) UnmarshalJSON(b []byte) error {
	var aux struct {
		UserID   interface{} `json:"user_id"`
		Muted    bool        `json:"muted"`
		Deafened bool        `json:"deafened"`
	}
	if err := json.Unmarshal(b, &aux); err != nil {
		return err
	}
	p.UserID = unstructuredIDToString(aux.UserID)
	p.Muted = aux.Muted
	p.Deafened = aux.Deafened
	return nil
}
