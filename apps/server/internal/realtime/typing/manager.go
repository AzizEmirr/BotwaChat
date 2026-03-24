package typing

import (
	"context"
	"sync"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
)

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type Manager struct {
	mu        sync.Mutex
	active    map[string]*typingState
	timeout   time.Duration
	publisher EventPublisher
}

type typingState struct {
	userID           string
	conversationType string
	conversationID   string
	room             string
	timer            *time.Timer
}

func NewManager(timeout time.Duration, publisher EventPublisher) *Manager {
	return &Manager{
		active:    make(map[string]*typingState),
		timeout:   timeout,
		publisher: publisher,
	}
}

func (m *Manager) Start(ctx context.Context, userID, conversationType, conversationID string) error {
	room := events.ConversationRoom(conversationType, conversationID)
	key := typingKey(userID, room)

	m.mu.Lock()
	if state, ok := m.active[key]; ok {
		state.timer.Reset(m.timeout)
		m.mu.Unlock()
		return nil
	}

	state := &typingState{
		userID:           userID,
		conversationType: conversationType,
		conversationID:   conversationID,
		room:             room,
	}
	state.timer = time.AfterFunc(m.timeout, func() {
		m.autoStop(userID, room, conversationType, conversationID)
	})
	m.active[key] = state
	m.mu.Unlock()

	return m.publishTypingEvent(ctx, events.EventUserTypingStarted, userID, conversationType, conversationID, room)
}

func (m *Manager) Stop(ctx context.Context, userID, conversationType, conversationID string) error {
	room := events.ConversationRoom(conversationType, conversationID)
	key := typingKey(userID, room)

	shouldPublish := false
	m.mu.Lock()
	if state, ok := m.active[key]; ok {
		state.timer.Stop()
		delete(m.active, key)
		shouldPublish = true
	}
	m.mu.Unlock()

	if !shouldPublish {
		return nil
	}

	return m.publishTypingEvent(ctx, events.EventUserTypingStopped, userID, conversationType, conversationID, room)
}

func (m *Manager) autoStop(userID, room, conversationType, conversationID string) {
	key := typingKey(userID, room)

	m.mu.Lock()
	if _, ok := m.active[key]; !ok {
		m.mu.Unlock()
		return
	}
	delete(m.active, key)
	m.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	_ = m.publishTypingEvent(ctx, events.EventUserTypingStopped, userID, conversationType, conversationID, room)
}

func (m *Manager) publishTypingEvent(ctx context.Context, eventType, userID, conversationType, conversationID, room string) error {
	if m.publisher == nil {
		return nil
	}

	envelope, err := events.NewEnvelope(eventType, room, userID, events.TypingPayload{
		UserID:           userID,
		ConversationType: conversationType,
		ConversationID:   conversationID,
	})
	if err != nil {
		return err
	}

	return m.publisher.Publish(ctx, envelope)
}

func typingKey(userID, room string) string {
	return userID + "|" + room
}
