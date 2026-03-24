package events

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

const (
	EventMessageCreated         = "message.created"
	EventMessageUpdated         = "message.updated"
	EventMessageDeleted         = "message.deleted"
	EventMessagePinUpdated      = "message.pin.updated"
	EventMessageReactionUpdated = "message.reaction.updated"
	EventDMCreated              = "dm.created"
	EventChannelCreated         = "channel.created"
	EventChannelUpdated         = "channel.updated"
	EventChannelDeleted         = "channel.deleted"
	EventUserPresenceUpdated    = "user.presence.updated"
	EventUserTypingStarted      = "user.typing.started"
	EventUserTypingStopped      = "user.typing.stopped"
	EventVoiceJoin              = "voice.join"
	EventVoiceLeave             = "voice.leave"
	EventVoiceMute              = "voice.mute"
	EventVoiceUnmute            = "voice.unmute"
	EventVoiceSpeakingStart     = "voice.speaking.start"
	EventVoiceSpeakingStop      = "voice.speaking.stop"
	EventVoiceChannelCreated    = "voice.channel.created"
	EventVoiceChannelUpdated    = "voice.channel.updated"
	EventVoiceChannelDeleted    = "voice.channel.deleted"
	EventServerInviteCreated    = "server.invite.created"
	EventServerInviteUpdated    = "server.invite.updated"
	EventServerMemberUpdated    = "server.member.updated"
	EventServerUpdated          = "server.updated"
	EventServerDeleted          = "server.deleted"
	EventFriendRequestCreated   = "friend.request.created"
	EventFriendRequestUpdated   = "friend.request.updated"
	EventFriendshipUpdated      = "friendship.updated"
	EventFriendshipRemoved      = "friendship.removed"
)

const (
	RoomPrefixChannel = "channel"
	RoomPrefixDM      = "dm"
	RoomPrefixServer  = "server"
	RoomPrefixUser    = "user"
	RoomPrefixVoice   = "voice"
)

type Envelope struct {
	ID         string          `json:"id"`
	Type       string          `json:"type"`
	Room       string          `json:"room"`
	SenderID   string          `json:"senderId,omitempty"`
	OccurredAt time.Time       `json:"occurredAt"`
	Payload    json.RawMessage `json:"payload"`
}

func NewEnvelope(eventType, room, senderID string, payload interface{}) (Envelope, error) {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return Envelope{}, fmt.Errorf("marshal event payload: %w", err)
	}

	return Envelope{
		ID:         uuid.NewString(),
		Type:       strings.TrimSpace(eventType),
		Room:       strings.TrimSpace(room),
		SenderID:   strings.TrimSpace(senderID),
		OccurredAt: time.Now().UTC(),
		Payload:    encoded,
	}, nil
}

func ChannelRoom(channelID string) string {
	return RoomPrefixChannel + ":" + strings.TrimSpace(channelID)
}

func DMRoom(conversationID string) string {
	return RoomPrefixDM + ":" + strings.TrimSpace(conversationID)
}

func ServerRoom(serverID string) string {
	return RoomPrefixServer + ":" + strings.TrimSpace(serverID)
}

func VoiceRoom(channelID string) string {
	return RoomPrefixVoice + ":" + strings.TrimSpace(channelID)
}

func UserRoom(userID string) string {
	return RoomPrefixUser + ":" + strings.TrimSpace(userID)
}

func ConversationRoom(conversationType, conversationID string) string {
	switch strings.TrimSpace(conversationType) {
	case RoomPrefixChannel:
		return ChannelRoom(conversationID)
	case RoomPrefixDM:
		return DMRoom(conversationID)
	default:
		return ""
	}
}

func ParseRoom(room string) (roomType string, roomID string, err error) {
	trimmed := strings.TrimSpace(room)
	parts := strings.SplitN(trimmed, ":", 2)
	if len(parts) != 2 {
		return "", "", fmt.Errorf("invalid room format")
	}

	roomType = strings.TrimSpace(parts[0])
	roomID = strings.TrimSpace(parts[1])
	if roomType == "" || roomID == "" {
		return "", "", fmt.Errorf("invalid room format")
	}

	switch roomType {
	case RoomPrefixChannel, RoomPrefixDM, RoomPrefixServer, RoomPrefixUser, RoomPrefixVoice:
		return roomType, roomID, nil
	default:
		return "", "", fmt.Errorf("unsupported room type")
	}
}

type PresencePayload struct {
	UserID   string     `json:"userId"`
	Status   string     `json:"status"`
	LastSeen *time.Time `json:"lastSeen,omitempty"`
}

type TypingPayload struct {
	ConversationType string `json:"conversationType"`
	ConversationID   string `json:"conversationId"`
	UserID           string `json:"userId"`
}

type VoiceChannelPayload struct {
	ID              string    `json:"id"`
	WorkspaceID     string    `json:"workspaceId"`
	Name            string    `json:"name"`
	MaxParticipants int       `json:"maxParticipants"`
	CreatedAt       time.Time `json:"createdAt"`
}

type VoiceStatePayload struct {
	UserID      string    `json:"userId"`
	ChannelID   string    `json:"channelId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	Muted       bool      `json:"muted"`
	Deafened    bool      `json:"deafened"`
	JoinedAt    time.Time `json:"joinedAt"`
}

type VoiceSpeakingPayload struct {
	UserID    string `json:"userId"`
	ChannelID string `json:"channelId"`
}

type MessagePinPayload struct {
	ConversationType string     `json:"conversationType"`
	ConversationID   string     `json:"conversationId"`
	MessageID        string     `json:"messageId"`
	Pinned           bool       `json:"pinned"`
	UserID           string     `json:"userId"`
	PinnedAt         *time.Time `json:"pinnedAt,omitempty"`
}

type MessageReactionPayload struct {
	ConversationType string `json:"conversationType"`
	ConversationID   string `json:"conversationId"`
	MessageID        string `json:"messageId"`
	Emoji            string `json:"emoji"`
	Count            int    `json:"count"`
	UserID           string `json:"userId"`
	Active           bool   `json:"active"`
}
