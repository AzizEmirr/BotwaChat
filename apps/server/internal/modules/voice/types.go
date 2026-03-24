package voice

import "time"

type createChannelRequest struct {
	WorkspaceID     string `json:"workspaceId"`
	Name            string `json:"name"`
	MaxParticipants *int   `json:"maxParticipants,omitempty"`
}

type updateChannelRequest struct {
	Name            *string `json:"name,omitempty"`
	MaxParticipants *int    `json:"maxParticipants,omitempty"`
}

type voiceParticipantDTO struct {
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarPath  *string   `json:"avatarPath,omitempty"`
	Muted       bool      `json:"muted"`
	Deafened    bool      `json:"deafened"`
	Speaking    bool      `json:"speaking"`
	JoinedAt    time.Time `json:"joinedAt"`
}

type voiceChannelDTO struct {
	ID               string                `json:"id"`
	WorkspaceID      string                `json:"workspaceId"`
	WorkspaceName    string                `json:"workspaceName"`
	Name             string                `json:"name"`
	MaxParticipants  int                   `json:"maxParticipants"`
	ParticipantCount int                   `json:"participantCount"`
	CreatedAt        time.Time             `json:"createdAt"`
	Participants     []voiceParticipantDTO `json:"participants"`
}

type voiceStateDTO struct {
	ChannelID string    `json:"channelId"`
	Muted     bool      `json:"muted"`
	Deafened  bool      `json:"deafened"`
	JoinedAt  time.Time `json:"joinedAt"`
}

type listChannelsResponse struct {
	Channels     []voiceChannelDTO `json:"channels"`
	CurrentState *voiceStateDTO    `json:"currentState,omitempty"`
}

type liveKitConnectDTO struct {
	URL      string `json:"url"`
	RoomName string `json:"roomName"`
	Token    string `json:"token"`
}

type joinResult struct {
	Channel           voiceChannelDTO   `json:"channel"`
	State             voiceStateDTO     `json:"state"`
	LiveKit           liveKitConnectDTO `json:"liveKit"`
	PreviousChannelID *string           `json:"previousChannelId,omitempty"`
}

type leaveResult struct {
	ChannelID string `json:"channelId,omitempty"`
}

type deleteChannelResponse struct {
	ID          string `json:"id"`
	WorkspaceID string `json:"workspaceId"`
}
