package notifications

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
)

type Service struct {
	db *database.DB
}

func NewService(db *database.DB) *Service {
	return &Service{db: db}
}

func (s *Service) List(ctx context.Context, userID string, limit int) ([]notificationDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, type, payload, read_at, created_at
		FROM notifications
		WHERE user_id = $1
		ORDER BY created_at DESC
		LIMIT $2
	`, userID, limit)
	if err != nil {
		return nil, fmt.Errorf("query notifications: %w", err)
	}
	defer rows.Close()

	items := make([]notificationDTO, 0, limit)
	for rows.Next() {
		var (
			item       notificationDTO
			payloadRaw []byte
		)

		if err := rows.Scan(&item.ID, &item.Type, &payloadRaw, &item.ReadAt, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan notification: %w", err)
		}

		var payload interface{}
		if len(payloadRaw) > 0 {
			if err := json.Unmarshal(payloadRaw, &payload); err != nil {
				payload = map[string]interface{}{"raw": string(payloadRaw)}
			}
		}
		item.Payload = payload
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate notifications: %w", err)
	}

	return items, nil
}
