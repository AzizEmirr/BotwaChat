package servers

import "time"

type createServerRequest struct {
	Name string `json:"name"`
}

type updateServerRequest struct {
	Name *string `json:"name"`
}

type updateMemberRoleRequest struct {
	Role string `json:"role"`
}

type inviteMemberRequest struct {
	UserID         string `json:"userId"`
	TurnstileToken string `json:"turnstileToken,omitempty"`
}

type serverDTO struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	OwnerID     string    `json:"ownerId"`
	Role        string    `json:"role"`
	MemberCount int       `json:"memberCount"`
	CreatedAt   time.Time `json:"createdAt"`
}

type listServersResponse struct {
	Servers []serverDTO `json:"servers"`
}

type serverMemberDTO struct {
	UserID      string     `json:"userId"`
	Username    string     `json:"username"`
	DisplayName string     `json:"displayName"`
	AvatarPath  *string    `json:"avatarPath,omitempty"`
	Role        string     `json:"role"`
	JoinedAt    time.Time  `json:"joinedAt"`
	Status      string     `json:"status"`
	LastSeenAt  *time.Time `json:"lastSeenAt,omitempty"`
}

type listMembersResponse struct {
	Members []serverMemberDTO `json:"members"`
}

type inviteMemberResponse struct {
	Invite  serverInviteDTO `json:"invite"`
	Created bool            `json:"created"`
}

type serverInviteDTO struct {
	ID                   string     `json:"id"`
	ServerID             string     `json:"serverId"`
	ServerName           string     `json:"serverName"`
	InvitedUserID        string     `json:"invitedUserId"`
	InvitedByUserID      string     `json:"invitedByUserId"`
	InvitedByUsername    string     `json:"invitedByUsername"`
	InvitedByDisplayName string     `json:"invitedByDisplayName"`
	InvitedByAvatarPath  *string    `json:"invitedByAvatarPath,omitempty"`
	Status               string     `json:"status"`
	CreatedAt            time.Time  `json:"createdAt"`
	UpdatedAt            time.Time  `json:"updatedAt"`
	RespondedAt          *time.Time `json:"respondedAt,omitempty"`
}

type listInvitesResponse struct {
	Invites []serverInviteDTO `json:"invites"`
}

type acceptInviteResponse struct {
	Status string    `json:"status"`
	Server serverDTO `json:"server"`
}

type leaveServerResponse struct {
	Left bool `json:"left"`
}
