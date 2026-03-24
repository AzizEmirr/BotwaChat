package channels

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrForbidden       = errors.New("channel_forbidden")
	ErrConflict        = errors.New("channel_conflict")
	ErrChannelNotFound = errors.New("channel_not_found")
	ErrServerNotFound  = errors.New("server_not_found")
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

func (s *Service) Create(ctx context.Context, userID string, input createChannelRequest) (channelDTO, error) {
	role, err := s.memberRole(ctx, input.ServerID, userID)
	if err != nil {
		return channelDTO{}, err
	}
	if role != "owner" && role != "admin" {
		return channelDTO{}, ErrForbidden
	}

	var created channelDTO
	err = s.db.Pool.QueryRow(ctx, `
		INSERT INTO channels (server_id, name, kind, created_by)
		VALUES ($1, $2, $3, $4)
		RETURNING id, server_id, name, kind, created_by, created_at
	`, input.ServerID, strings.TrimSpace(input.Name), strings.TrimSpace(input.Kind), userID).Scan(
		&created.ID,
		&created.ServerID,
		&created.Name,
		&created.Kind,
		&created.CreatedBy,
		&created.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return channelDTO{}, ErrConflict
		}
		return channelDTO{}, fmt.Errorf("insert channel: %w", err)
	}

	if err := s.publish(ctx, events.EventChannelCreated, events.ServerRoom(created.ServerID), created.CreatedBy, created); err != nil {
		return channelDTO{}, err
	}

	return created, nil
}

func (s *Service) ListByServer(ctx context.Context, userID, serverID, kind string) ([]channelDTO, error) {
	if _, err := s.memberRole(ctx, serverID, userID); err != nil {
		return nil, err
	}

	filterKind := strings.TrimSpace(kind)
	var kindParam interface{}
	if filterKind != "" {
		kindParam = filterKind
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, server_id, name, kind, created_by, created_at
		FROM channels
		WHERE server_id = $1
		  AND ($2::text IS NULL OR kind = $2::text)
		ORDER BY created_at ASC, name ASC
	`, serverID, kindParam)
	if err != nil {
		return nil, fmt.Errorf("list channels: %w", err)
	}
	defer rows.Close()

	items := make([]channelDTO, 0)
	for rows.Next() {
		var item channelDTO
		if err := rows.Scan(
			&item.ID,
			&item.ServerID,
			&item.Name,
			&item.Kind,
			&item.CreatedBy,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan channel: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate channels: %w", err)
	}

	return items, nil
}

func (s *Service) Update(ctx context.Context, userID, channelID string, req updateChannelRequest) (channelDTO, error) {
	current, err := s.loadChannel(ctx, channelID)
	if err != nil {
		return channelDTO{}, err
	}

	role, err := s.memberRole(ctx, current.ServerID, userID)
	if err != nil {
		return channelDTO{}, err
	}
	if role != "owner" && role != "admin" {
		return channelDTO{}, ErrForbidden
	}

	nextName := current.Name
	nextKind := current.Kind

	if req.Name != nil {
		nextName = strings.TrimSpace(*req.Name)
	}
	if req.Kind != nil {
		nextKind = strings.TrimSpace(*req.Kind)
	}

	var updated channelDTO
	err = s.db.Pool.QueryRow(ctx, `
		UPDATE channels
		SET name = $2, kind = $3
		WHERE id = $1
		RETURNING id, server_id, name, kind, created_by, created_at
	`, channelID, nextName, nextKind).Scan(
		&updated.ID,
		&updated.ServerID,
		&updated.Name,
		&updated.Kind,
		&updated.CreatedBy,
		&updated.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return channelDTO{}, ErrConflict
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return channelDTO{}, ErrChannelNotFound
		}
		return channelDTO{}, fmt.Errorf("update channel: %w", err)
	}

	if err := s.publish(ctx, events.EventChannelUpdated, events.ServerRoom(updated.ServerID), userID, updated); err != nil {
		return channelDTO{}, err
	}

	return updated, nil
}

func (s *Service) Delete(ctx context.Context, userID, channelID string) (deletedChannelResponse, error) {
	current, err := s.loadChannel(ctx, channelID)
	if err != nil {
		return deletedChannelResponse{}, err
	}

	role, err := s.memberRole(ctx, current.ServerID, userID)
	if err != nil {
		return deletedChannelResponse{}, err
	}
	if role != "owner" && role != "admin" {
		return deletedChannelResponse{}, ErrForbidden
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return deletedChannelResponse{}, fmt.Errorf("begin delete channel tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		DELETE FROM messages
		WHERE conversation_type = 'channel' AND conversation_id = $1
	`, channelID); err != nil {
		return deletedChannelResponse{}, fmt.Errorf("delete channel messages: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM channels
		WHERE id = $1
	`, channelID); err != nil {
		return deletedChannelResponse{}, fmt.Errorf("delete channel: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return deletedChannelResponse{}, fmt.Errorf("commit delete channel tx: %w", err)
	}

	response := deletedChannelResponse{
		ID:       current.ID,
		ServerID: current.ServerID,
	}

	if err := s.publish(ctx, events.EventChannelDeleted, events.ServerRoom(current.ServerID), userID, response); err != nil {
		return deletedChannelResponse{}, err
	}

	return response, nil
}

func (s *Service) loadChannel(ctx context.Context, channelID string) (channelDTO, error) {
	var item channelDTO
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, server_id, name, kind, created_by, created_at
		FROM channels
		WHERE id = $1
	`, channelID).Scan(&item.ID, &item.ServerID, &item.Name, &item.Kind, &item.CreatedBy, &item.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return channelDTO{}, ErrChannelNotFound
		}
		return channelDTO{}, fmt.Errorf("load channel: %w", err)
	}
	return item, nil
}

func (s *Service) memberRole(ctx context.Context, serverID, userID string) (string, error) {
	var role string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, userID).Scan(&role)
	if err == nil {
		return role, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("load member role: %w", err)
	}

	var exists bool
	if err := s.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM servers
			WHERE id = $1
		)
	`, serverID).Scan(&exists); err != nil {
		return "", fmt.Errorf("check server exists: %w", err)
	}
	if !exists {
		return "", ErrServerNotFound
	}
	return "", ErrForbidden
}

func (s *Service) publish(ctx context.Context, eventType, room, senderID string, payload interface{}) error {
	if s.publisher == nil {
		return nil
	}

	event, err := events.NewEnvelope(eventType, room, senderID, payload)
	if err != nil {
		return fmt.Errorf("create channel event: %w", err)
	}

	if err := s.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish channel event: %w", err)
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
