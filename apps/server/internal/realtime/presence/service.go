package presence

import (
	"context"
	"fmt"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
)

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type Service struct {
	db        *database.DB
	publisher EventPublisher
}

func NewService(db *database.DB, publisher EventPublisher) *Service {
	return &Service{db: db, publisher: publisher}
}

func (s *Service) SetStatus(ctx context.Context, userID, status string) error {
	status = normalizeStatus(status)
	lastSeen := presenceLastSeen(status)
	if err := s.upsertState(ctx, userID, status, lastSeen); err != nil {
		return err
	}
	return s.broadcastPresence(ctx, userID, status, lastSeen)
}

func (s *Service) UserConnected(ctx context.Context, userID string) {
	status := "online"
	existingStatus, err := s.currentStatus(ctx, userID)
	if err == nil {
		switch existingStatus {
		case "idle", "dnd", "invisible":
			status = existingStatus
		}
	}

	if err := s.upsertState(ctx, userID, status, presenceLastSeen(status)); err != nil {
		return
	}
	_ = s.broadcastPresence(ctx, userID, status, presenceLastSeen(status))
}

func (s *Service) UserDisconnected(ctx context.Context, userID string) {
	now := time.Now().UTC()
	if err := s.upsertState(ctx, userID, "offline", &now); err != nil {
		return
	}
	_ = s.broadcastPresence(ctx, userID, "offline", &now)
}

func (s *Service) upsertState(ctx context.Context, userID, status string, lastSeen *time.Time) error {
	_, err := s.db.Pool.Exec(ctx, `
		INSERT INTO presence_states (user_id, status, last_seen_at)
		VALUES ($1, $2, COALESCE($3, NOW()))
		ON CONFLICT (user_id) DO UPDATE
		SET status = EXCLUDED.status,
			last_seen_at = COALESCE($3, presence_states.last_seen_at),
			updated_at = NOW()
	`, userID, status, lastSeen)
	if err != nil {
		return fmt.Errorf("upsert presence state: %w", err)
	}
	return nil
}

func (s *Service) currentStatus(ctx context.Context, userID string) (string, error) {
	var status string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT status
		FROM presence_states
		WHERE user_id = $1
	`, userID).Scan(&status)
	if err != nil {
		return "", fmt.Errorf("query current presence status: %w", err)
	}
	return normalizeStatus(status), nil
}

func (s *Service) broadcastPresence(ctx context.Context, subjectUserID, status string, lastSeen *time.Time) error {
	if s.publisher == nil {
		return nil
	}

	relatedUsers, err := s.fetchRelatedUsers(ctx, subjectUserID)
	if err != nil {
		return err
	}

	payload := events.PresencePayload{
		UserID:   subjectUserID,
		Status:   status,
		LastSeen: lastSeen,
	}

	for _, watcherID := range relatedUsers {
		envelope, err := events.NewEnvelope(
			events.EventUserPresenceUpdated,
			events.UserRoom(watcherID),
			subjectUserID,
			payload,
		)
		if err != nil {
			continue
		}
		_ = s.publisher.Publish(ctx, envelope)
	}

	return nil
}

func (s *Service) fetchRelatedUsers(ctx context.Context, userID string) ([]string, error) {
	rows, err := s.db.Pool.Query(ctx, `
		WITH related_server_users AS (
			SELECT DISTINCT sm.user_id
			FROM server_members me
			JOIN server_members sm ON sm.server_id = me.server_id
			WHERE me.user_id = $1
		), related_dm_users AS (
			SELECT DISTINCT dm2.user_id
			FROM direct_conversation_members dm1
			JOIN direct_conversation_members dm2 ON dm2.conversation_id = dm1.conversation_id
			WHERE dm1.user_id = $1
		)
		SELECT DISTINCT related.user_id::text
		FROM (
			SELECT user_id FROM related_server_users
			UNION
			SELECT user_id FROM related_dm_users
			UNION
			SELECT $1::uuid AS user_id
		) related
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query related presence users: %w", err)
	}
	defer rows.Close()

	result := make([]string, 0)
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, fmt.Errorf("scan related user id: %w", err)
		}
		result = append(result, id)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate related users: %w", err)
	}

	return result, nil
}

func normalizeStatus(status string) string {
	switch status {
	case "online", "idle", "dnd", "invisible", "offline":
		return status
	default:
		return "online"
	}
}

func presenceLastSeen(status string) *time.Time {
	if status != "offline" && status != "invisible" {
		return nil
	}

	now := time.Now().UTC()
	return &now
}
