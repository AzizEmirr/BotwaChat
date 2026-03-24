package notifications

import "time"

type notificationDTO struct {
	ID        string      `json:"id"`
	Type      string      `json:"type"`
	Payload   interface{} `json:"payload"`
	ReadAt    *time.Time  `json:"readAt,omitempty"`
	CreatedAt time.Time   `json:"createdAt"`
}

type listResponse struct {
	Notifications []notificationDTO `json:"notifications"`
}
