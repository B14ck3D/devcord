package signaling

import "errors"

var (
	ErrUserExists    = errors.New("user_id already in room")
	ErrNotJoined     = errors.New("not joined to a room")
	ErrBadPayload    = errors.New("invalid payload")
	ErrUnknownUser   = errors.New("target user not in room")
	ErrInvalidJoin   = errors.New("invalid join_room")
	ErrAlreadyJoined = errors.New("already joined a room")
)
