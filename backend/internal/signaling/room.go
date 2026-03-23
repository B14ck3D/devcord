package signaling

import "sync"

type Room struct {
	id      string
	mu      sync.RWMutex
	clients map[string]*Client
}

func newRoom(id string) *Room {
	return &Room{id: id, clients: make(map[string]*Client)}
}

func (r *Room) ID() string {
	return r.id
}

func (r *Room) Add(c *Client) (others []*Client, err error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.clients[c.userID]; ok {
		return nil, ErrUserExists
	}
	for _, oc := range r.clients {
		others = append(others, oc)
	}
	r.clients[c.userID] = c
	return others, nil
}

func (r *Room) Remove(userID string) *Client {
	r.mu.Lock()
	defer r.mu.Unlock()
	c := r.clients[userID]
	delete(r.clients, userID)
	return c
}

func (r *Room) Get(userID string) *Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.clients[userID]
}

func (r *Room) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.clients)
}

func (r *Room) PeerIDs(except string) []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.clients))
	for id := range r.clients {
		if id != except {
			out = append(out, id)
		}
	}
	return out
}

func (r *Room) AllPeerIDs() []string {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]string, 0, len(r.clients))
	for id := range r.clients {
		out = append(out, id)
	}
	return out
}

func (r *Room) snapshotClients() []*Client {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*Client, 0, len(r.clients))
	for _, c := range r.clients {
		out = append(out, c)
	}
	return out
}
