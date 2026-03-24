package dms

import (
	"context"
	"errors"
	"fmt"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
)

var (
	ErrInvalidParticipant = errors.New("invalid_participant")
	ErrUserNotFound       = errors.New("user_not_found")
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

func (s *Service) List(ctx context.Context, userID string) ([]conversationDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT dc.id,
			other.id,
			other.username,
			other.display_name,
			other.avatar_path,
			lm.content,
			lm.created_at
		FROM direct_conversations dc
		JOIN direct_conversation_members me ON me.conversation_id = dc.id AND me.user_id = $1
		JOIN direct_conversation_members om ON om.conversation_id = dc.id AND om.user_id <> $1
		JOIN users other ON other.id = om.user_id
		LEFT JOIN LATERAL (
			SELECT content, created_at
			FROM messages m
			WHERE m.conversation_type = 'dm' AND m.conversation_id = dc.id
			ORDER BY m.created_at DESC
			LIMIT 1
		) lm ON TRUE
		ORDER BY lm.created_at DESC NULLS LAST, dc.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query dm list: %w", err)
	}
	defer rows.Close()

	items := make([]conversationDTO, 0)
	for rows.Next() {
		var item conversationDTO
		if err := rows.Scan(
			&item.ConversationID,
			&item.OtherUserID,
			&item.OtherUsername,
			&item.OtherDisplayName,
			&item.OtherAvatarPath,
			&item.LastMessage,
			&item.LastMessageAt,
		); err != nil {
			return nil, fmt.Errorf("scan dm row: %w", err)
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate dm rows: %w", err)
	}

	return items, nil
}

func (s *Service) Create(ctx context.Context, userID, otherUserID string) (createConversationResponse, error) {
	if userID == otherUserID {
		return createConversationResponse{}, ErrInvalidParticipant
	}

	var other conversationPeer
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_path
		FROM users
		WHERE id = $1
	`, otherUserID).Scan(&other.ID, &other.Username, &other.DisplayName, &other.AvatarPath)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return createConversationResponse{}, ErrUserNotFound
		}
		return createConversationResponse{}, fmt.Errorf("load participant: %w", err)
	}

	var existingID string
	err = s.db.Pool.QueryRow(ctx, `
		SELECT dc.id
		FROM direct_conversations dc
		JOIN direct_conversation_members m1 ON m1.conversation_id = dc.id AND m1.user_id = $1
		JOIN direct_conversation_members m2 ON m2.conversation_id = dc.id AND m2.user_id = $2
		LIMIT 1
	`, userID, otherUserID).Scan(&existingID)
	if err == nil {
		return createConversationResponse{
			ConversationID: existingID,
			OtherUser:      other,
			Created:        false,
		}, nil
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return createConversationResponse{}, fmt.Errorf("check existing dm: %w", err)
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return createConversationResponse{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var conversationID string
	err = tx.QueryRow(ctx, `
		INSERT INTO direct_conversations (created_by)
		VALUES ($1)
		RETURNING id
	`, userID).Scan(&conversationID)
	if err != nil {
		return createConversationResponse{}, fmt.Errorf("insert direct_conversation: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO direct_conversation_members (conversation_id, user_id)
		VALUES ($1, $2), ($1, $3)
	`, conversationID, userID, otherUserID); err != nil {
		return createConversationResponse{}, fmt.Errorf("insert direct conversation members: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return createConversationResponse{}, fmt.Errorf("commit create dm tx: %w", err)
	}

	resp := createConversationResponse{
		ConversationID: conversationID,
		OtherUser:      other,
		Created:        true,
	}

	if err := s.publishDMCreated(ctx, userID, otherUserID, resp); err != nil {
		return createConversationResponse{}, err
	}

	return resp, nil
}

func (s *Service) publishDMCreated(ctx context.Context, senderID, otherUserID string, payload createConversationResponse) error {
	if s.publisher == nil {
		return nil
	}

	senderEvent, err := events.NewEnvelope(events.EventDMCreated, events.UserRoom(senderID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create dm event for sender: %w", err)
	}
	if err := s.publisher.Publish(ctx, senderEvent); err != nil {
		return fmt.Errorf("publish dm event for sender: %w", err)
	}

	receiverEvent, err := events.NewEnvelope(events.EventDMCreated, events.UserRoom(otherUserID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create dm event for receiver: %w", err)
	}
	if err := s.publisher.Publish(ctx, receiverEvent); err != nil {
		return fmt.Errorf("publish dm event for receiver: %w", err)
	}

	return nil
}
