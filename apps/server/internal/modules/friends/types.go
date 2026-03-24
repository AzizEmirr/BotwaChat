package friends

import "time"

type friendDTO struct {
	UserID      string     `json:"userId"`
	Username    string     `json:"username"`
	DisplayName string     `json:"displayName"`
	AvatarPath  *string    `json:"avatarPath,omitempty"`
	Status      string     `json:"status"`
	LastSeenAt  *time.Time `json:"lastSeenAt,omitempty"`
	CreatedAt   time.Time  `json:"createdAt"`
}

type friendRequestDTO struct {
	ID          string    `json:"id"`
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarPath  *string   `json:"avatarPath,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
}

type listFriendsResponse struct {
	Friends []friendDTO `json:"friends"`
}

type listRequestsResponse struct {
	Incoming []friendRequestDTO `json:"incoming"`
	Outgoing []friendRequestDTO `json:"outgoing"`
}

type sendRequestBody struct {
	UserID string `json:"userId"`
}

type sendRequestResponse struct {
	Created      bool              `json:"created"`
	AutoAccepted bool              `json:"autoAccepted"`
	Request      *friendRequestDTO `json:"request,omitempty"`
}

type friendPrivacySettingsDTO struct {
	AllowEveryone        bool      `json:"allowEveryone"`
	AllowFriendsOfFriend bool      `json:"allowFriendsOfFriends"`
	AllowServerMembers   bool      `json:"allowServerMembers"`
	UpdatedAt            time.Time `json:"updatedAt"`
}

type listFriendPrivacyResponse struct {
	Settings friendPrivacySettingsDTO `json:"settings"`
}

type updateFriendPrivacyBody struct {
	AllowEveryone        *bool `json:"allowEveryone,omitempty"`
	AllowFriendsOfFriend *bool `json:"allowFriendsOfFriends,omitempty"`
	AllowServerMembers   *bool `json:"allowServerMembers,omitempty"`
}

type blockedUserDTO struct {
	UserID      string    `json:"userId"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	AvatarPath  *string   `json:"avatarPath,omitempty"`
	BlockedAt   time.Time `json:"blockedAt"`
}

type listBlockedUsersResponse struct {
	Blocked []blockedUserDTO `json:"blocked"`
}

type blockUserBody struct {
	UserID string `json:"userId"`
}

type actionResponse struct {
	Status string `json:"status"`
}
