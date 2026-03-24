package dms

import "time"

type conversationDTO struct {
	ConversationID   string     `json:"conversationId"`
	OtherUserID      string     `json:"otherUserId"`
	OtherUsername    string     `json:"otherUsername"`
	OtherDisplayName string     `json:"otherDisplayName"`
	OtherAvatarPath  *string    `json:"otherAvatarPath,omitempty"`
	LastMessage      *string    `json:"lastMessage,omitempty"`
	LastMessageAt    *time.Time `json:"lastMessageAt,omitempty"`
}

type listResponse struct {
	Conversations []conversationDTO `json:"conversations"`
}

type conversationPeer struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	AvatarPath  *string `json:"avatarPath,omitempty"`
}

type createConversationRequest struct {
	UserID string `json:"userId"`
}

type createConversationResponse struct {
	ConversationID string           `json:"conversationId"`
	OtherUser      conversationPeer `json:"otherUser"`
	Created        bool             `json:"created"`
}
