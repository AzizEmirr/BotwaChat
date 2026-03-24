package messages

import "time"

type sendMessageRequest struct {
	ConversationType string `json:"conversationType"`
	ConversationID   string `json:"conversationId"`
	Content          string `json:"content"`
}

type updateMessageRequest struct {
	Content string `json:"content"`
}

type listMessageStateResponse struct {
	PinnedMessageIDs   []string                        `json:"pinnedMessageIds"`
	ReactionsByMessage map[string][]messageReactionDTO `json:"reactionsByMessage"`
}

type toggleMessagePinResponse struct {
	ConversationType string     `json:"conversationType"`
	ConversationID   string     `json:"conversationId"`
	MessageID        string     `json:"messageId"`
	Pinned           bool       `json:"pinned"`
	UserID           string     `json:"userId"`
	PinnedAt         *time.Time `json:"pinnedAt,omitempty"`
}

type toggleMessageReactionRequest struct {
	Emoji string `json:"emoji"`
}

type toggleMessageReactionResponse struct {
	ConversationType string `json:"conversationType"`
	ConversationID   string `json:"conversationId"`
	MessageID        string `json:"messageId"`
	Emoji            string `json:"emoji"`
	Count            int    `json:"count"`
	UserID           string `json:"userId"`
	Active           bool   `json:"active"`
}

type messageReactionDTO struct {
	Emoji   string `json:"emoji"`
	Count   int    `json:"count"`
	Reacted bool   `json:"reacted"`
}

type messageDTO struct {
	ID                string     `json:"id"`
	ConversationType  string     `json:"conversationType"`
	ConversationID    string     `json:"conversationId"`
	SenderID          string     `json:"senderId"`
	SenderUsername    string     `json:"senderUsername"`
	SenderDisplayName string     `json:"senderDisplayName"`
	SenderAvatarPath  *string    `json:"senderAvatarPath,omitempty"`
	Content           string     `json:"content"`
	CreatedAt         time.Time  `json:"createdAt"`
	EditedAt          *time.Time `json:"editedAt,omitempty"`
	DeletedAt         *time.Time `json:"deletedAt,omitempty"`
}

type listMessagesResponse struct {
	Messages []messageDTO `json:"messages"`
}
