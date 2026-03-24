package websocket

import (
	"context"
	"sync"

	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
)

type UserConnectionHook func(ctx context.Context, userID string)

type ConnectionManager struct {
	mu               sync.RWMutex
	clients          map[string]*Client
	userConnections  map[string]map[string]*Client
	rooms            map[string]map[string]*Client
	onFirstConnect   UserConnectionHook
	onLastDisconnect UserConnectionHook
}

func NewConnectionManager() *ConnectionManager {
	return &ConnectionManager{
		clients:         make(map[string]*Client),
		userConnections: make(map[string]map[string]*Client),
		rooms:           make(map[string]map[string]*Client),
	}
}

func (m *ConnectionManager) SetConnectionHooks(onFirstConnect, onLastDisconnect UserConnectionHook) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.onFirstConnect = onFirstConnect
	m.onLastDisconnect = onLastDisconnect
}

func (m *ConnectionManager) Register(ctx context.Context, client *Client) {
	m.mu.Lock()
	_, alreadyConnected := m.userConnections[client.UserID]

	m.clients[client.ID] = client
	if _, ok := m.userConnections[client.UserID]; !ok {
		m.userConnections[client.UserID] = make(map[string]*Client)
	}
	m.userConnections[client.UserID][client.ID] = client
	onFirst := m.onFirstConnect
	m.mu.Unlock()

	if !alreadyConnected && onFirst != nil {
		go onFirst(ctx, client.UserID)
	}
}

func (m *ConnectionManager) Unregister(ctx context.Context, client *Client) {
	m.mu.Lock()
	if _, exists := m.clients[client.ID]; !exists {
		m.mu.Unlock()
		return
	}

	delete(m.clients, client.ID)
	for room := range client.rooms {
		if subscribers, ok := m.rooms[room]; ok {
			delete(subscribers, client.ID)
			if len(subscribers) == 0 {
				delete(m.rooms, room)
			}
		}
	}

	lastConnection := false
	if userSockets, ok := m.userConnections[client.UserID]; ok {
		delete(userSockets, client.ID)
		if len(userSockets) == 0 {
			delete(m.userConnections, client.UserID)
			lastConnection = true
		}
	}

	onLast := m.onLastDisconnect
	m.mu.Unlock()

	close(client.Send)

	if lastConnection && onLast != nil {
		go onLast(ctx, client.UserID)
	}
}

func (m *ConnectionManager) JoinRoom(client *Client, room string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.rooms[room]; !ok {
		m.rooms[room] = make(map[string]*Client)
	}
	m.rooms[room][client.ID] = client
	client.rooms[room] = struct{}{}
}

func (m *ConnectionManager) LeaveRoom(client *Client, room string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	if subscribers, ok := m.rooms[room]; ok {
		delete(subscribers, client.ID)
		if len(subscribers) == 0 {
			delete(m.rooms, room)
		}
	}
	delete(client.rooms, room)
}

func (m *ConnectionManager) PublishRoom(event events.Envelope) {
	payload, err := MarshalEvent(event)
	if err != nil {
		return
	}

	m.mu.RLock()
	subscribers, ok := m.rooms[event.Room]
	if !ok {
		m.mu.RUnlock()
		return
	}

	clients := make([]*Client, 0, len(subscribers))
	for _, client := range subscribers {
		clients = append(clients, client)
	}
	m.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.Send <- payload:
		default:
		}
	}
}

func (m *ConnectionManager) PublishToUser(userID string, event events.Envelope) {
	payload, err := MarshalEvent(event)
	if err != nil {
		return
	}

	m.mu.RLock()
	connections, ok := m.userConnections[userID]
	if !ok {
		m.mu.RUnlock()
		return
	}

	clients := make([]*Client, 0, len(connections))
	for _, client := range connections {
		clients = append(clients, client)
	}
	m.mu.RUnlock()

	for _, client := range clients {
		select {
		case client.Send <- payload:
		default:
		}
	}
}
