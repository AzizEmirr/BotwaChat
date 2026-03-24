package messages

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
)

var (
	ErrForbidden            = errors.New("forbidden")
	ErrConversationNotFound = errors.New("conversation_not_found")
	ErrMessageNotFound      = errors.New("message_not_found")
	ErrInvalidEmoji         = errors.New("invalid_emoji")
)

type Service struct {
	db        *database.DB
	publisher EventPublisher
}

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

func NewService(db *database.DB, publisher EventPublisher) *Service {
	return &Service{db: db, publisher: publisher}
}

func (s *Service) Create(ctx context.Context, userID string, req sendMessageRequest) (messageDTO, error) {
	if err := s.ensureParticipant(ctx, userID, req.ConversationType, req.ConversationID); err != nil {
		return messageDTO{}, err
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return messageDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var created messageDTO
	err = tx.QueryRow(ctx, `
		WITH inserted AS (
			INSERT INTO messages (conversation_type, conversation_id, sender_id, content)
			VALUES ($1, $2, $3, $4)
			RETURNING id, conversation_type, conversation_id, sender_id, content, created_at, edited_at, deleted_at
		)
		SELECT i.id, i.conversation_type, i.conversation_id, i.sender_id, u.username, u.display_name, u.avatar_path, i.content, i.created_at, i.edited_at, i.deleted_at
		FROM inserted i
		JOIN users u ON u.id = i.sender_id
	`, req.ConversationType, req.ConversationID, userID, strings.TrimSpace(req.Content)).Scan(
		&created.ID,
		&created.ConversationType,
		&created.ConversationID,
		&created.SenderID,
		&created.SenderUsername,
		&created.SenderDisplayName,
		&created.SenderAvatarPath,
		&created.Content,
		&created.CreatedAt,
		&created.EditedAt,
		&created.DeletedAt,
	)
	if err != nil {
		return messageDTO{}, fmt.Errorf("insert message: %w", err)
	}

	if err := s.insertNotifications(ctx, tx, created); err != nil {
		return messageDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return messageDTO{}, fmt.Errorf("commit create message tx: %w", err)
	}

	if err := s.publishMessageCreated(ctx, created); err != nil {
		log.Printf("messages.create: publish message.created failed for %s: %v", created.ID, err)
	}

	return created, nil
}

func (s *Service) List(ctx context.Context, userID, conversationType, conversationID string, before *time.Time, limit int) ([]messageDTO, error) {
	if err := s.ensureParticipant(ctx, userID, conversationType, conversationID); err != nil {
		return nil, err
	}

	var beforeParam interface{}
	if before != nil {
		beforeParam = *before
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT m.id, m.conversation_type, m.conversation_id, m.sender_id, u.username, u.display_name, u.avatar_path, m.content, m.created_at, m.edited_at, m.deleted_at
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.conversation_type = $1
		  AND m.conversation_id = $2
		  AND ($3::timestamptz IS NULL OR m.created_at < $3)
		ORDER BY m.created_at DESC
		LIMIT $4
	`, conversationType, conversationID, beforeParam, limit)
	if err != nil {
		return nil, fmt.Errorf("query messages: %w", err)
	}
	defer rows.Close()

	messages := make([]messageDTO, 0, limit)
	for rows.Next() {
		var item messageDTO
		if err := rows.Scan(
			&item.ID,
			&item.ConversationType,
			&item.ConversationID,
			&item.SenderID,
			&item.SenderUsername,
			&item.SenderDisplayName,
			&item.SenderAvatarPath,
			&item.Content,
			&item.CreatedAt,
			&item.EditedAt,
			&item.DeletedAt,
		); err != nil {
			return nil, fmt.Errorf("scan message: %w", err)
		}
		messages = append(messages, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate messages: %w", err)
	}

	return messages, nil
}

func (s *Service) ListState(ctx context.Context, userID, conversationType, conversationID string) (listMessageStateResponse, error) {
	if err := s.ensureParticipant(ctx, userID, conversationType, conversationID); err != nil {
		return listMessageStateResponse{}, err
	}

	pinnedMessageIDs := make([]string, 0, 8)
	pinRows, err := s.db.Pool.Query(ctx, `
		SELECT mp.message_id::text
		FROM message_pins mp
		JOIN messages m ON m.id = mp.message_id
		WHERE m.conversation_type = $1
		  AND m.conversation_id = $2::uuid
		ORDER BY mp.created_at DESC
	`, conversationType, conversationID)
	if err != nil {
		return listMessageStateResponse{}, fmt.Errorf("query pinned messages: %w", err)
	}
	defer pinRows.Close()

	for pinRows.Next() {
		var messageID string
		if err := pinRows.Scan(&messageID); err != nil {
			return listMessageStateResponse{}, fmt.Errorf("scan pinned message: %w", err)
		}
		pinnedMessageIDs = append(pinnedMessageIDs, messageID)
	}
	if err := pinRows.Err(); err != nil {
		return listMessageStateResponse{}, fmt.Errorf("iterate pinned messages: %w", err)
	}

	reactionsByMessage := make(map[string][]messageReactionDTO)
	reactionRows, err := s.db.Pool.Query(ctx, `
		SELECT
			mr.message_id::text,
			mr.emoji,
			COUNT(*)::int AS count,
			BOOL_OR(mr.user_id = $3::uuid) AS reacted
		FROM message_reactions mr
		JOIN messages m ON m.id = mr.message_id
		WHERE m.conversation_type = $1
		  AND m.conversation_id = $2::uuid
		GROUP BY mr.message_id, mr.emoji
		ORDER BY mr.message_id, mr.emoji
	`, conversationType, conversationID, userID)
	if err != nil {
		return listMessageStateResponse{}, fmt.Errorf("query message reactions: %w", err)
	}
	defer reactionRows.Close()

	for reactionRows.Next() {
		var messageID string
		var item messageReactionDTO
		if err := reactionRows.Scan(&messageID, &item.Emoji, &item.Count, &item.Reacted); err != nil {
			return listMessageStateResponse{}, fmt.Errorf("scan message reaction: %w", err)
		}
		reactionsByMessage[messageID] = append(reactionsByMessage[messageID], item)
	}
	if err := reactionRows.Err(); err != nil {
		return listMessageStateResponse{}, fmt.Errorf("iterate message reactions: %w", err)
	}

	return listMessageStateResponse{
		PinnedMessageIDs:   pinnedMessageIDs,
		ReactionsByMessage: reactionsByMessage,
	}, nil
}

func (s *Service) TogglePin(ctx context.Context, userID, messageID string) (toggleMessagePinResponse, error) {
	message, err := s.loadMessageByID(ctx, messageID)
	if err != nil {
		return toggleMessagePinResponse{}, err
	}
	if err := s.ensureParticipant(ctx, userID, message.ConversationType, message.ConversationID); err != nil {
		return toggleMessagePinResponse{}, err
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return toggleMessagePinResponse{}, fmt.Errorf("begin toggle pin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var currentlyPinned bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM message_pins
			WHERE message_id = $1::uuid
		)
	`, messageID).Scan(&currentlyPinned); err != nil {
		return toggleMessagePinResponse{}, fmt.Errorf("check pin status: %w", err)
	}

	nextPinned := !currentlyPinned
	var pinnedAt *time.Time
	if nextPinned {
		var createdAt time.Time
		if err := tx.QueryRow(ctx, `
			INSERT INTO message_pins (message_id, pinned_by)
			VALUES ($1::uuid, $2::uuid)
			ON CONFLICT (message_id) DO UPDATE
				SET pinned_by = EXCLUDED.pinned_by,
					created_at = NOW()
			RETURNING created_at
		`, messageID, userID).Scan(&createdAt); err != nil {
			return toggleMessagePinResponse{}, fmt.Errorf("pin message: %w", err)
		}
		pinnedAt = &createdAt
	} else {
		if _, err := tx.Exec(ctx, `
			DELETE FROM message_pins
			WHERE message_id = $1::uuid
		`, messageID); err != nil {
			return toggleMessagePinResponse{}, fmt.Errorf("unpin message: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return toggleMessagePinResponse{}, fmt.Errorf("commit toggle pin tx: %w", err)
	}

	response := toggleMessagePinResponse{
		ConversationType: message.ConversationType,
		ConversationID:   message.ConversationID,
		MessageID:        messageID,
		Pinned:           nextPinned,
		UserID:           userID,
		PinnedAt:         pinnedAt,
	}

	if err := s.publishConversationEvent(ctx, events.EventMessagePinUpdated, message.ConversationType, message.ConversationID, userID, events.MessagePinPayload{
		ConversationType: message.ConversationType,
		ConversationID:   message.ConversationID,
		MessageID:        messageID,
		Pinned:           nextPinned,
		UserID:           userID,
		PinnedAt:         pinnedAt,
	}); err != nil {
		log.Printf("messages.toggle_pin: publish message.pin.updated failed for %s: %v", messageID, err)
	}

	return response, nil
}

func (s *Service) ToggleReaction(ctx context.Context, userID, messageID, emoji string) (toggleMessageReactionResponse, error) {
	normalizedEmoji := strings.TrimSpace(emoji)
	if normalizedEmoji == "" || utf8.RuneCountInString(normalizedEmoji) > 32 {
		return toggleMessageReactionResponse{}, ErrInvalidEmoji
	}

	message, err := s.loadMessageByID(ctx, messageID)
	if err != nil {
		return toggleMessageReactionResponse{}, err
	}
	if err := s.ensureParticipant(ctx, userID, message.ConversationType, message.ConversationID); err != nil {
		return toggleMessageReactionResponse{}, err
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return toggleMessageReactionResponse{}, fmt.Errorf("begin toggle reaction tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var currentlyReacted bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM message_reactions
			WHERE message_id = $1::uuid
			  AND user_id = $2::uuid
			  AND emoji = $3
		)
	`, messageID, userID, normalizedEmoji).Scan(&currentlyReacted); err != nil {
		return toggleMessageReactionResponse{}, fmt.Errorf("check reaction status: %w", err)
	}

	active := !currentlyReacted
	if active {
		if _, err := tx.Exec(ctx, `
			INSERT INTO message_reactions (message_id, user_id, emoji)
			VALUES ($1::uuid, $2::uuid, $3)
			ON CONFLICT (message_id, user_id, emoji) DO NOTHING
		`, messageID, userID, normalizedEmoji); err != nil {
			return toggleMessageReactionResponse{}, fmt.Errorf("add reaction: %w", err)
		}
	} else {
		if _, err := tx.Exec(ctx, `
			DELETE FROM message_reactions
			WHERE message_id = $1::uuid
			  AND user_id = $2::uuid
			  AND emoji = $3
		`, messageID, userID, normalizedEmoji); err != nil {
			return toggleMessageReactionResponse{}, fmt.Errorf("remove reaction: %w", err)
		}
	}

	var count int
	if err := tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM message_reactions
		WHERE message_id = $1::uuid
		  AND emoji = $2
	`, messageID, normalizedEmoji).Scan(&count); err != nil {
		return toggleMessageReactionResponse{}, fmt.Errorf("count reactions: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return toggleMessageReactionResponse{}, fmt.Errorf("commit toggle reaction tx: %w", err)
	}

	response := toggleMessageReactionResponse{
		ConversationType: message.ConversationType,
		ConversationID:   message.ConversationID,
		MessageID:        messageID,
		Emoji:            normalizedEmoji,
		Count:            count,
		UserID:           userID,
		Active:           active,
	}

	if err := s.publishConversationEvent(ctx, events.EventMessageReactionUpdated, message.ConversationType, message.ConversationID, userID, events.MessageReactionPayload{
		ConversationType: message.ConversationType,
		ConversationID:   message.ConversationID,
		MessageID:        messageID,
		Emoji:            normalizedEmoji,
		Count:            count,
		UserID:           userID,
		Active:           active,
	}); err != nil {
		log.Printf("messages.toggle_reaction: publish message.reaction.updated failed for %s: %v", messageID, err)
	}

	return response, nil
}

func (s *Service) Update(ctx context.Context, userID, messageID string, req updateMessageRequest) (messageDTO, error) {
	message, err := s.loadMessageByID(ctx, messageID)
	if err != nil {
		return messageDTO{}, err
	}
	if err := s.ensureParticipant(ctx, userID, message.ConversationType, message.ConversationID); err != nil {
		return messageDTO{}, err
	}
	if message.SenderID != userID {
		return messageDTO{}, ErrForbidden
	}

	var updated messageDTO
	err = s.db.Pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE messages
			SET content = $2,
			    edited_at = NOW(),
			    deleted_at = NULL
			WHERE id = $1
			RETURNING id, conversation_type, conversation_id, sender_id, content, created_at, edited_at, deleted_at
		)
		SELECT u2.id, u2.conversation_type, u2.conversation_id, u2.sender_id, u.username, u.display_name, u.avatar_path, u2.content, u2.created_at, u2.edited_at, u2.deleted_at
		FROM updated u2
		JOIN users u ON u.id = u2.sender_id
	`, messageID, strings.TrimSpace(req.Content)).Scan(
		&updated.ID,
		&updated.ConversationType,
		&updated.ConversationID,
		&updated.SenderID,
		&updated.SenderUsername,
		&updated.SenderDisplayName,
		&updated.SenderAvatarPath,
		&updated.Content,
		&updated.CreatedAt,
		&updated.EditedAt,
		&updated.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return messageDTO{}, ErrMessageNotFound
		}
		return messageDTO{}, fmt.Errorf("update message: %w", err)
	}

	if err := s.publishMessageEvent(ctx, events.EventMessageUpdated, updated); err != nil {
		log.Printf("messages.update: publish message.updated failed for %s: %v", updated.ID, err)
	}

	return updated, nil
}

func (s *Service) Delete(ctx context.Context, userID, messageID string) (messageDTO, error) {
	message, err := s.loadMessageByID(ctx, messageID)
	if err != nil {
		return messageDTO{}, err
	}
	if err := s.ensureParticipant(ctx, userID, message.ConversationType, message.ConversationID); err != nil {
		return messageDTO{}, err
	}
	if message.SenderID != userID {
		return messageDTO{}, ErrForbidden
	}

	var deleted messageDTO
	err = s.db.Pool.QueryRow(ctx, `
		WITH updated AS (
			UPDATE messages
			SET content = 'Bu mesaj silindi.',
			    edited_at = NOW(),
			    deleted_at = NOW()
			WHERE id = $1
			RETURNING id, conversation_type, conversation_id, sender_id, content, created_at, edited_at, deleted_at
		)
		SELECT u2.id, u2.conversation_type, u2.conversation_id, u2.sender_id, u.username, u.display_name, u.avatar_path, u2.content, u2.created_at, u2.edited_at, u2.deleted_at
		FROM updated u2
		JOIN users u ON u.id = u2.sender_id
	`, messageID).Scan(
		&deleted.ID,
		&deleted.ConversationType,
		&deleted.ConversationID,
		&deleted.SenderID,
		&deleted.SenderUsername,
		&deleted.SenderDisplayName,
		&deleted.SenderAvatarPath,
		&deleted.Content,
		&deleted.CreatedAt,
		&deleted.EditedAt,
		&deleted.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return messageDTO{}, ErrMessageNotFound
		}
		return messageDTO{}, fmt.Errorf("delete message: %w", err)
	}

	if err := s.publishMessageEvent(ctx, events.EventMessageDeleted, deleted); err != nil {
		log.Printf("messages.delete: publish message.deleted failed for %s: %v", deleted.ID, err)
	}

	return deleted, nil
}

func (s *Service) loadMessageByID(ctx context.Context, messageID string) (messageDTO, error) {
	var item messageDTO
	err := s.db.Pool.QueryRow(ctx, `
		SELECT m.id, m.conversation_type, m.conversation_id, m.sender_id, u.username, u.display_name, u.avatar_path, m.content, m.created_at, m.edited_at, m.deleted_at
		FROM messages m
		JOIN users u ON u.id = m.sender_id
		WHERE m.id = $1
	`, messageID).Scan(
		&item.ID,
		&item.ConversationType,
		&item.ConversationID,
		&item.SenderID,
		&item.SenderUsername,
		&item.SenderDisplayName,
		&item.SenderAvatarPath,
		&item.Content,
		&item.CreatedAt,
		&item.EditedAt,
		&item.DeletedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return messageDTO{}, ErrMessageNotFound
		}
		return messageDTO{}, fmt.Errorf("load message: %w", err)
	}
	return item, nil
}

func (s *Service) ensureParticipant(ctx context.Context, userID, conversationType, conversationID string) error {
	switch strings.TrimSpace(conversationType) {
	case "channel":
		var serverID string
		err := s.db.Pool.QueryRow(ctx, `
			SELECT server_id
			FROM channels
			WHERE id = $1
		`, conversationID).Scan(&serverID)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				return ErrConversationNotFound
			}
			return fmt.Errorf("load channel: %w", err)
		}

		var isMember bool
		err = s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM server_members
				WHERE server_id = $1 AND user_id = $2
			)
		`, serverID, userID).Scan(&isMember)
		if err != nil {
			return fmt.Errorf("check channel membership: %w", err)
		}
		if !isMember {
			return ErrForbidden
		}
		return nil
	case "dm":
		var exists bool
		err := s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM direct_conversations
				WHERE id = $1
			)
		`, conversationID).Scan(&exists)
		if err != nil {
			return fmt.Errorf("check dm exists: %w", err)
		}
		if !exists {
			return ErrConversationNotFound
		}

		var isMember bool
		err = s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM direct_conversation_members
				WHERE conversation_id = $1 AND user_id = $2
			)
		`, conversationID, userID).Scan(&isMember)
		if err != nil {
			return fmt.Errorf("check dm membership: %w", err)
		}
		if !isMember {
			return ErrForbidden
		}
		return nil
	default:
		return ErrConversationNotFound
	}
}

func (s *Service) insertNotifications(ctx context.Context, tx pgx.Tx, message messageDTO) error {
	switch message.ConversationType {
	case "channel":
		_, err := tx.Exec(ctx, `
			INSERT INTO notifications (user_id, type, payload)
			SELECT sm.user_id, 'message', jsonb_build_object(
				'messageId', $2::text,
				'conversationType', 'channel',
				'conversationId', $1::text,
				'senderId', $3::text
			)
			FROM channels c
			JOIN server_members sm ON sm.server_id = c.server_id
			WHERE c.id = $1::uuid
			  AND sm.user_id <> $3::uuid
		`, message.ConversationID, message.ID, message.SenderID)
		if err != nil {
			return fmt.Errorf("insert channel notifications: %w", err)
		}
	case "dm":
		_, err := tx.Exec(ctx, `
			INSERT INTO notifications (user_id, type, payload)
			SELECT dcm.user_id, 'message', jsonb_build_object(
				'messageId', $2::text,
				'conversationType', 'dm',
				'conversationId', $1::text,
				'senderId', $3::text
			)
			FROM direct_conversation_members dcm
			WHERE dcm.conversation_id = $1::uuid
			  AND dcm.user_id <> $3::uuid
		`, message.ConversationID, message.ID, message.SenderID)
		if err != nil {
			return fmt.Errorf("insert dm notifications: %w", err)
		}
	}

	return nil
}

func (s *Service) publishMessageCreated(ctx context.Context, message messageDTO) error {
	return s.publishMessageEvent(ctx, events.EventMessageCreated, message)
}

func (s *Service) publishMessageEvent(ctx context.Context, eventType string, message messageDTO) error {
	return s.publishConversationEvent(ctx, eventType, message.ConversationType, message.ConversationID, message.SenderID, message)
}

func (s *Service) resolveMessageRecipients(ctx context.Context, message messageDTO) ([]string, error) {
	return s.resolveConversationRecipients(ctx, message.ConversationType, message.ConversationID)
}

func (s *Service) publishConversationEvent(
	ctx context.Context,
	eventType, conversationType, conversationID, senderID string,
	payload interface{},
) error {
	if s.publisher == nil {
		return nil
	}

	var firstErr error

	conversationRoom := events.ConversationRoom(conversationType, conversationID)
	if conversationRoom != "" {
		event, err := events.NewEnvelope(eventType, conversationRoom, senderID, payload)
		if err != nil {
			firstErr = fmt.Errorf("create conversation event: %w", err)
		} else if err := s.publisher.Publish(ctx, event); err != nil {
			firstErr = fmt.Errorf("publish conversation event: %w", err)
		}
	}

	recipients, err := s.resolveConversationRecipients(ctx, conversationType, conversationID)
	if err != nil {
		if firstErr != nil {
			return firstErr
		}
		return err
	}
	for _, userID := range recipients {
		event, err := events.NewEnvelope(eventType, events.UserRoom(userID), senderID, payload)
		if err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("create user room event: %w", err)
			}
			continue
		}
		if err := s.publisher.Publish(ctx, event); err != nil {
			if firstErr == nil {
				firstErr = fmt.Errorf("publish user room event: %w", err)
			}
		}
	}

	return firstErr
}

func (s *Service) resolveConversationRecipients(ctx context.Context, conversationType, conversationID string) ([]string, error) {
	switch conversationType {
	case "channel":
		rows, err := s.db.Pool.Query(ctx, `
			SELECT DISTINCT sm.user_id::text
			FROM channels c
			JOIN server_members sm ON sm.server_id = c.server_id
			WHERE c.id = $1::uuid
		`, conversationID)
		if err != nil {
			return nil, fmt.Errorf("query channel recipients: %w", err)
		}
		defer rows.Close()

		recipients := make([]string, 0, 8)
		for rows.Next() {
			var userID string
			if err := rows.Scan(&userID); err != nil {
				return nil, fmt.Errorf("scan channel recipient: %w", err)
			}
			recipients = append(recipients, userID)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("iterate channel recipients: %w", err)
		}
		return recipients, nil
	case "dm":
		rows, err := s.db.Pool.Query(ctx, `
			SELECT DISTINCT dcm.user_id::text
			FROM direct_conversation_members dcm
			WHERE dcm.conversation_id = $1::uuid
		`, conversationID)
		if err != nil {
			return nil, fmt.Errorf("query dm recipients: %w", err)
		}
		defer rows.Close()

		recipients := make([]string, 0, 2)
		for rows.Next() {
			var userID string
			if err := rows.Scan(&userID); err != nil {
				return nil, fmt.Errorf("scan dm recipient: %w", err)
			}
			recipients = append(recipients, userID)
		}
		if err := rows.Err(); err != nil {
			return nil, fmt.Errorf("iterate dm recipients: %w", err)
		}
		return recipients, nil
	default:
		return nil, fmt.Errorf("unsupported conversation type")
	}
}
