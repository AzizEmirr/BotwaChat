package users

import "time"

type userProfile struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	Bio         *string   `json:"bio,omitempty"`
	AvatarPath  *string   `json:"avatarPath,omitempty"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

type updateProfileRequest struct {
	Username    *string `json:"username"`
	DisplayName *string `json:"displayName"`
	Bio         *string `json:"bio"`
	AvatarPath  *string `json:"avatarPath"`
}

type updatePresenceRequest struct {
	Status string `json:"status"`
}

type updatePresenceResponse struct {
	Status string `json:"status"`
}

type userSearchItem struct {
	ID          string  `json:"id"`
	Username    string  `json:"username"`
	DisplayName string  `json:"displayName"`
	AvatarPath  *string `json:"avatarPath,omitempty"`
}

type userSearchResponse struct {
	Users []userSearchItem `json:"users"`
}
