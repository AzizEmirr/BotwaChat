package gateway

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"sync"
	"time"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/voice"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/typing"
	socket "github.com/AzizEmirr/catwa/apps/server/internal/realtime/websocket"
	"github.com/google/uuid"
	gws "github.com/gorilla/websocket"
	"golang.org/x/time/rate"
)

const websocketTokenExpiredCloseCode = 4001

type Config struct {
	AllowedOrigins    []string
	AllowEmptyOrigin  bool
	HeartbeatInterval time.Duration
	ReconnectAfter    time.Duration
	MaxMessageBytes   int64
	QueueSize         int
	ActionRPS         float64
	ActionBurst       int
}

type Gateway struct {
	manager           *socket.ConnectionManager
	auth              *socket.SocketAuthenticator
	authorizer        socket.RoomAuthorizer
	typing            *typing.Manager
	voice             *voice.Service
	allowedOrigins    map[string]struct{}
	allowEmptyOrigin  bool
	heartbeatInterval time.Duration
	reconnectAfter    time.Duration
	maxMessageBytes   int64
	queueSize         int
	actionLimiter     *actionLimiter
	upgrader          gws.Upgrader
}

type actionVisitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type actionLimiter struct {
	mu       sync.Mutex
	visitors map[string]*actionVisitor
	rps      rate.Limit
	burst    int
	ttl      time.Duration
}

func newActionLimiter(rps float64, burst int, ttl time.Duration) *actionLimiter {
	limiter := &actionLimiter{
		visitors: make(map[string]*actionVisitor),
		rps:      rate.Limit(rps),
		burst:    burst,
		ttl:      ttl,
	}

	go limiter.cleanupLoop()
	return limiter
}

func (l *actionLimiter) Allow(key string) bool {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	entry, ok := l.visitors[key]
	if !ok {
		entry = &actionVisitor{
			limiter: rate.NewLimiter(l.rps, l.burst),
		}
		l.visitors[key] = entry
	}
	entry.lastSeen = now
	return entry.limiter.Allow()
}

func (l *actionLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Add(-l.ttl)

		l.mu.Lock()
		for key, entry := range l.visitors {
			if entry.lastSeen.Before(cutoff) {
				delete(l.visitors, key)
			}
		}
		l.mu.Unlock()
	}
}

type typingActionData struct {
	ConversationType string `json:"conversationType"`
	ConversationID   string `json:"conversationId"`
}

type voiceJoinActionData struct {
	ChannelID string `json:"channelId"`
}

type voiceSpeakingActionData struct {
	ChannelID string `json:"channelId"`
}

func New(
	config Config,
	manager *socket.ConnectionManager,
	auth *socket.SocketAuthenticator,
	authorizer socket.RoomAuthorizer,
	typingManager *typing.Manager,
	voiceService *voice.Service,
) *Gateway {
	allowedOrigins := make(map[string]struct{}, len(config.AllowedOrigins))
	for _, origin := range config.AllowedOrigins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			allowedOrigins[trimmed] = struct{}{}
		}
	}

	actionRPS := config.ActionRPS
	if actionRPS <= 0 {
		actionRPS = 20
	}
	actionBurst := config.ActionBurst
	if actionBurst <= 0 {
		actionBurst = 60
	}

	g := &Gateway{
		manager:           manager,
		auth:              auth,
		authorizer:        authorizer,
		typing:            typingManager,
		voice:             voiceService,
		allowedOrigins:    allowedOrigins,
		allowEmptyOrigin:  config.AllowEmptyOrigin,
		heartbeatInterval: config.HeartbeatInterval,
		reconnectAfter:    config.ReconnectAfter,
		maxMessageBytes:   config.MaxMessageBytes,
		queueSize:         config.QueueSize,
		actionLimiter:     newActionLimiter(actionRPS, actionBurst, 5*time.Minute),
	}

	g.upgrader = gws.Upgrader{
		ReadBufferSize:  1024,
		WriteBufferSize: 1024,
		Subprotocols:    []string{"catwa.v1"},
		CheckOrigin: func(r *http.Request) bool {
			if len(g.allowedOrigins) == 0 {
				return false
			}
			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin == "" {
				return g.allowEmptyOrigin
			}
			// Electron fallback pages (file://) can emit Origin: null.
			// Allow this only when desktop protocol origins are explicitly configured.
			if strings.EqualFold(origin, "null") {
				if _, ok := g.allowedOrigins["app://localhost"]; ok {
					return true
				}
				if _, ok := g.allowedOrigins["tauri://localhost"]; ok {
					return true
				}
				if _, ok := g.allowedOrigins["https://tauri.localhost"]; ok {
					return true
				}
				if _, ok := g.allowedOrigins["http://tauri.localhost"]; ok {
					return true
				}
				return false
			}
			_, ok := g.allowedOrigins[origin]
			return ok
		},
	}

	if g.heartbeatInterval <= 0 {
		g.heartbeatInterval = 15 * time.Second
	}
	if g.reconnectAfter <= 0 {
		g.reconnectAfter = 2 * time.Second
	}
	if g.maxMessageBytes <= 0 {
		g.maxMessageBytes = 1024 * 1024
	}
	if g.queueSize <= 0 {
		g.queueSize = 256
	}

	return g
}

func (g *Gateway) HandleWS(w http.ResponseWriter, r *http.Request) {
	subject, err := g.auth.Authenticate(r)
	if err != nil {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized websocket")
		return
	}

	conn, err := g.upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	client := socket.NewClient(uuid.NewString(), subject.UserID, conn, g.queueSize)
	ctx := context.Background()

	g.manager.Register(ctx, client)
	g.manager.JoinRoom(client, events.UserRoom(subject.UserID))
	_ = g.enqueueInfo(client, map[string]interface{}{
		"connectionId":        client.ID,
		"userId":              subject.UserID,
		"heartbeatIntervalMs": g.heartbeatInterval.Milliseconds(),
		"reconnectAfterMs":    g.reconnectAfter.Milliseconds(),
	})

	var once sync.Once
	cleanup := func() {
		once.Do(func() {
			g.manager.Unregister(ctx, client)
			_ = client.Conn.Close()
		})
	}

	go g.writePump(client, cleanup)
	go g.readPump(client, cleanup)
	go g.expireClientOnTokenExpiry(client, subject.ExpiresAt, cleanup)
}

func (g *Gateway) readPump(client *socket.Client, cleanup func()) {
	defer cleanup()

	_ = client.Conn.SetReadDeadline(time.Now().Add(g.heartbeatInterval * 3))
	client.Conn.SetReadLimit(g.maxMessageBytes)
	client.Conn.SetPongHandler(func(string) error {
		return client.Conn.SetReadDeadline(time.Now().Add(g.heartbeatInterval * 3))
	})

	for {
		_, payload, err := client.Conn.ReadMessage()
		if err != nil {
			return
		}

		var incoming socket.Incoming
		if err := json.Unmarshal(payload, &incoming); err != nil {
			_ = g.enqueueError(client, "", "invalid json payload")
			continue
		}

		if err := g.handleIncoming(client, incoming); err != nil {
			_ = g.enqueueError(client, incoming.RequestID, err.Error())
		}
	}
}

func (g *Gateway) writePump(client *socket.Client, cleanup func()) {
	defer cleanup()

	ticker := time.NewTicker(g.heartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case message, ok := <-client.Send:
			_ = client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				_ = client.Conn.WriteMessage(gws.CloseMessage, []byte{})
				return
			}

			if err := client.Conn.WriteMessage(gws.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			_ = client.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.Conn.WriteMessage(gws.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (g *Gateway) expireClientOnTokenExpiry(client *socket.Client, expiresAt time.Time, cleanup func()) {
	waitFor := time.Until(expiresAt)
	if waitFor <= 0 {
		_ = client.Conn.WriteControl(
			gws.CloseMessage,
			gws.FormatCloseMessage(websocketTokenExpiredCloseCode, "access token expired"),
			time.Now().Add(2*time.Second),
		)
		cleanup()
		return
	}

	timer := time.NewTimer(waitFor)
	defer timer.Stop()

	<-timer.C
	_ = client.Conn.WriteControl(
		gws.CloseMessage,
		gws.FormatCloseMessage(websocketTokenExpiredCloseCode, "access token expired"),
		time.Now().Add(2*time.Second),
	)
	cleanup()
}

func (g *Gateway) handleIncoming(client *socket.Client, incoming socket.Incoming) error {
	action := strings.TrimSpace(strings.ToLower(incoming.Action))
	if action == "" || len(action) > 64 {
		return errors.New("invalid action")
	}

	requestID := strings.TrimSpace(incoming.RequestID)
	if len(requestID) > 128 {
		return errors.New("invalid request id")
	}
	incoming.RequestID = requestID

	if g.actionLimiter != nil {
		if !g.actionLimiter.Allow(client.UserID + ":" + action) {
			return errors.New("too many websocket requests")
		}
	}

	switch action {
	case "subscribe":
		room := strings.TrimSpace(incoming.Room)
		if room == "" || len(room) > 128 {
			return errors.New("invalid room")
		}

		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		allowed, err := g.authorizer.CanJoinRoom(ctx, client.UserID, room)
		if err != nil {
			return err
		}
		if !allowed {
			return errors.New("not authorized for room")
		}

		g.manager.JoinRoom(client, room)
		return g.enqueueAck(client, incoming.RequestID, map[string]string{"room": room, "status": "subscribed"})
	case "unsubscribe":
		room := strings.TrimSpace(incoming.Room)
		if room == "" || len(room) > 128 {
			return errors.New("invalid room")
		}
		g.manager.LeaveRoom(client, room)
		return g.enqueueAck(client, incoming.RequestID, map[string]string{"room": room, "status": "unsubscribed"})
	case "typing.start":
		return g.handleTyping(client, incoming, true)
	case "typing.stop":
		return g.handleTyping(client, incoming, false)
	case "voice.join":
		return g.handleVoiceJoin(client, incoming)
	case "voice.leave":
		return g.handleVoiceLeave(client, incoming)
	case "voice.mute":
		return g.handleVoiceMute(client, incoming, true)
	case "voice.unmute":
		return g.handleVoiceMute(client, incoming, false)
	case "voice.deafen":
		return g.handleVoiceDeafen(client, incoming, true)
	case "voice.undeafen":
		return g.handleVoiceDeafen(client, incoming, false)
	case "voice.speaking.start":
		return g.handleVoiceSpeaking(client, incoming, true)
	case "voice.speaking.stop":
		return g.handleVoiceSpeaking(client, incoming, false)
	case "ping":
		return g.enqueueAck(client, incoming.RequestID, map[string]string{"status": "pong"})
	default:
		return errors.New("unsupported action")
	}
}

func (g *Gateway) handleTyping(client *socket.Client, incoming socket.Incoming, start bool) error {
	if g.typing == nil {
		return errors.New("typing service is not available")
	}

	var payload typingActionData
	if err := json.Unmarshal(incoming.Data, &payload); err != nil {
		return errors.New("invalid typing payload")
	}

	conversationType := strings.TrimSpace(payload.ConversationType)
	conversationID := strings.TrimSpace(payload.ConversationID)
	if conversationType == "" || conversationID == "" {
		return errors.New("invalid typing payload")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	allowed, err := g.authorizer.CanUseConversation(ctx, client.UserID, conversationType, conversationID)
	if err != nil {
		return err
	}
	if !allowed {
		return errors.New("not authorized for conversation")
	}

	if start {
		if err := g.typing.Start(ctx, client.UserID, conversationType, conversationID); err != nil {
			return err
		}
		return g.enqueueAck(client, incoming.RequestID, map[string]string{"status": "typing_started"})
	}

	if err := g.typing.Stop(ctx, client.UserID, conversationType, conversationID); err != nil {
		return err
	}
	return g.enqueueAck(client, incoming.RequestID, map[string]string{"status": "typing_stopped"})
}

func (g *Gateway) handleVoiceJoin(client *socket.Client, incoming socket.Incoming) error {
	if g.voice == nil {
		return errors.New("voice service is not available")
	}

	var payload voiceJoinActionData
	if err := json.Unmarshal(incoming.Data, &payload); err != nil {
		return errors.New("invalid voice join payload")
	}

	channelID := strings.TrimSpace(payload.ChannelID)
	if _, err := uuid.Parse(channelID); err != nil {
		return errors.New("invalid voice channel id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := g.voice.Join(ctx, client.UserID, channelID)
	if err != nil {
		switch err {
		case voice.ErrVoiceChannelNotFound:
			return errors.New("voice channel not found")
		case voice.ErrVoiceForbidden:
			return errors.New("not authorized for voice channel")
		case voice.ErrVoiceCapacityReached:
			return errors.New("voice channel is full")
		default:
			return err
		}
	}

	if resp.PreviousChannelID != nil && *resp.PreviousChannelID != "" {
		g.manager.LeaveRoom(client, events.VoiceRoom(*resp.PreviousChannelID))
	}
	g.manager.JoinRoom(client, events.VoiceRoom(channelID))

	return g.enqueueAck(client, incoming.RequestID, resp)
}

func (g *Gateway) handleVoiceLeave(client *socket.Client, incoming socket.Incoming) error {
	if g.voice == nil {
		return errors.New("voice service is not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	resp, err := g.voice.Leave(ctx, client.UserID)
	if err != nil {
		return err
	}

	if resp.ChannelID != "" {
		g.manager.LeaveRoom(client, events.VoiceRoom(resp.ChannelID))
	}

	return g.enqueueAck(client, incoming.RequestID, resp)
}

func (g *Gateway) handleVoiceMute(client *socket.Client, incoming socket.Incoming, muted bool) error {
	if g.voice == nil {
		return errors.New("voice service is not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	state, err := g.voice.SetMuted(ctx, client.UserID, muted)
	if err != nil {
		switch err {
		case voice.ErrVoiceNotConnected:
			return errors.New("not connected to a voice channel")
		default:
			return err
		}
	}

	return g.enqueueAck(client, incoming.RequestID, state)
}

func (g *Gateway) handleVoiceDeafen(client *socket.Client, incoming socket.Incoming, deafened bool) error {
	if g.voice == nil {
		return errors.New("voice service is not available")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	state, err := g.voice.SetDeafened(ctx, client.UserID, deafened)
	if err != nil {
		switch err {
		case voice.ErrVoiceNotConnected:
			return errors.New("not connected to a voice channel")
		default:
			return err
		}
	}

	return g.enqueueAck(client, incoming.RequestID, state)
}

func (g *Gateway) handleVoiceSpeaking(client *socket.Client, incoming socket.Incoming, speaking bool) error {
	if g.voice == nil {
		return errors.New("voice service is not available")
	}

	var payload voiceSpeakingActionData
	if err := json.Unmarshal(incoming.Data, &payload); err != nil {
		return errors.New("invalid voice speaking payload")
	}

	channelID := strings.TrimSpace(payload.ChannelID)
	if _, err := uuid.Parse(channelID); err != nil {
		return errors.New("invalid voice channel id")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := g.voice.SetSpeaking(ctx, client.UserID, channelID, speaking); err != nil {
		switch err {
		case voice.ErrVoiceNotConnected:
			return errors.New("not connected to voice channel")
		default:
			return err
		}
	}

	status := "voice_speaking_stopped"
	if speaking {
		status = "voice_speaking_started"
	}

	return g.enqueueAck(client, incoming.RequestID, map[string]string{
		"channelId": channelID,
		"status":    status,
	})
}

func (g *Gateway) enqueueAck(client *socket.Client, requestID string, data interface{}) error {
	message, err := socket.MarshalAck(requestID, data)
	if err != nil {
		return err
	}
	select {
	case client.Send <- message:
	default:
		return errors.New("socket queue is full")
	}
	return nil
}

func (g *Gateway) enqueueError(client *socket.Client, requestID, reason string) error {
	message, err := socket.MarshalError(requestID, reason)
	if err != nil {
		return err
	}
	select {
	case client.Send <- message:
	default:
	}
	return nil
}

func (g *Gateway) enqueueInfo(client *socket.Client, data interface{}) error {
	message, err := socket.MarshalInfo(data)
	if err != nil {
		return err
	}
	select {
	case client.Send <- message:
	default:
		return errors.New("socket queue is full")
	}
	return nil
}
