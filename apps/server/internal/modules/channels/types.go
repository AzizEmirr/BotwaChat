package channels

import "time"

type createChannelRequest struct {
	ServerID string `json:"serverId"`
	Name     string `json:"name"`
	Kind     string `json:"kind"`
}

type updateChannelRequest struct {
	Name *string `json:"name"`
	Kind *string `json:"kind"`
}

type channelDTO struct {
	ID        string    `json:"id"`
	ServerID  string    `json:"serverId"`
	Name      string    `json:"name"`
	Kind      string    `json:"kind"`
	CreatedBy string    `json:"createdBy"`
	CreatedAt time.Time `json:"createdAt"`
}

type listChannelsResponse struct {
	Channels []channelDTO `json:"channels"`
}

type deletedChannelResponse struct {
	ID       string `json:"id"`
	ServerID string `json:"serverId"`
}
