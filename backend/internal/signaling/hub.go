package signaling

import "sync"

type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room
}

func NewHub() *Hub {
	return &Hub{rooms: make(map[string]*Room)}
}

func (h *Hub) Shutdown() {
	h.mu.Lock()
	rooms := make([]*Room, 0, len(h.rooms))
	for _, r := range h.rooms {
		rooms = append(rooms, r)
	}
	h.rooms = make(map[string]*Room)
	h.mu.Unlock()

	for _, r := range rooms {
		for _, c := range r.snapshotClients() {
			c.Close()
		}
	}
}

func (h *Hub) getOrCreateRoom(roomID string) *Room {
	h.mu.Lock()
	defer h.mu.Unlock()
	if r, ok := h.rooms[roomID]; ok {
		return r
	}
	r := newRoom(roomID)
	h.rooms[roomID] = r
	return r
}

func (h *Hub) ListPeerIDs(roomID string) []string {
	h.mu.RLock()
	r, ok := h.rooms[roomID]
	h.mu.RUnlock()
	if !ok {
		return []string{}
	}
	return r.AllPeerIDs()
}

func (h *Hub) removeRoomIfEmpty(roomID string) {
	h.mu.Lock()
	defer h.mu.Unlock()
	r, ok := h.rooms[roomID]
	if !ok {
		return
	}
	if r.Len() == 0 {
		delete(h.rooms, roomID)
	}
}
