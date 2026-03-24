package users

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrUserNotFound         = errors.New("user_not_found")
	ErrUserConflict         = errors.New("user_conflict")
	ErrInvalidPresenceState = errors.New("invalid_presence_status")
)

type Service struct {
	db       *database.DB
	presence PresenceUpdater
}

type PresenceUpdater interface {
	SetStatus(ctx context.Context, userID, status string) error
}

func NewService(db *database.DB, presence PresenceUpdater) *Service {
	return &Service{db: db, presence: presence}
}

func (s *Service) GetMe(ctx context.Context, userID string) (userProfile, error) {
	var profile userProfile
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, bio, avatar_path, created_at, updated_at
		FROM users
		WHERE id = $1
	`, userID).Scan(
		&profile.ID,
		&profile.Email,
		&profile.Username,
		&profile.DisplayName,
		&profile.Bio,
		&profile.AvatarPath,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return userProfile{}, ErrUserNotFound
		}
		return userProfile{}, fmt.Errorf("get profile: %w", err)
	}

	return profile, nil
}

func (s *Service) Search(ctx context.Context, userID, query string, limit int) ([]userSearchItem, error) {
	q := strings.TrimSpace(query)
	if q == "" {
		return []userSearchItem{}, nil
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT id, username, display_name, avatar_path
		FROM users
		WHERE id <> $1
		  AND (
			username ILIKE $2
			OR display_name ILIKE $2
			OR email ILIKE $2
		  )
		ORDER BY username ASC
		LIMIT $3
	`, userID, "%"+q+"%", limit)
	if err != nil {
		return nil, fmt.Errorf("search users: %w", err)
	}
	defer rows.Close()

	items := make([]userSearchItem, 0, limit)
	for rows.Next() {
		var item userSearchItem
		if err := rows.Scan(&item.ID, &item.Username, &item.DisplayName, &item.AvatarPath); err != nil {
			return nil, fmt.Errorf("scan user search row: %w", err)
		}
		items = append(items, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate user search rows: %w", err)
	}

	return items, nil
}

func (s *Service) UpdateProfile(ctx context.Context, userID string, req updateProfileRequest) (userProfile, error) {
	setClauses := make([]string, 0, 4)
	args := []interface{}{userID}
	idx := 2

	if req.Username != nil {
		username := strings.TrimSpace(*req.Username)
		setClauses = append(setClauses, fmt.Sprintf("username = $%d", idx))
		args = append(args, username)
		idx++
	}

	if req.DisplayName != nil {
		displayName := strings.TrimSpace(*req.DisplayName)
		setClauses = append(setClauses, fmt.Sprintf("display_name = $%d", idx))
		args = append(args, displayName)
		idx++
	}

	if req.Bio != nil {
		bio := strings.TrimSpace(*req.Bio)
		if bio == "" {
			setClauses = append(setClauses, "bio = NULL")
		} else {
			setClauses = append(setClauses, fmt.Sprintf("bio = $%d", idx))
			args = append(args, bio)
			idx++
		}
	}

	if req.AvatarPath != nil {
		avatarPath := strings.TrimSpace(*req.AvatarPath)
		if avatarPath == "" {
			setClauses = append(setClauses, "avatar_path = NULL")
		} else {
			setClauses = append(setClauses, fmt.Sprintf("avatar_path = $%d", idx))
			args = append(args, avatarPath)
			idx++
		}
	}

	if len(setClauses) == 0 {
		return s.GetMe(ctx, userID)
	}

	query := fmt.Sprintf(`
		UPDATE users
		SET %s, updated_at = NOW()
		WHERE id = $1
		RETURNING id, email, username, display_name, bio, avatar_path, created_at, updated_at
	`, strings.Join(setClauses, ", "))

	var profile userProfile
	err := s.db.Pool.QueryRow(ctx, query, args...).Scan(
		&profile.ID,
		&profile.Email,
		&profile.Username,
		&profile.DisplayName,
		&profile.Bio,
		&profile.AvatarPath,
		&profile.CreatedAt,
		&profile.UpdatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return userProfile{}, ErrUserConflict
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return userProfile{}, ErrUserNotFound
		}
		return userProfile{}, fmt.Errorf("update profile: %w", err)
	}

	return profile, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

func (s *Service) UpdatePresence(ctx context.Context, userID, status string) error {
	normalized := normalizePresenceStatus(status)
	if normalized == "" {
		return ErrInvalidPresenceState
	}

	if s.presence == nil {
		return nil
	}

	if err := s.presence.SetStatus(ctx, userID, normalized); err != nil {
		return fmt.Errorf("update presence: %w", err)
	}

	return nil
}

func normalizePresenceStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "online":
		return "online"
	case "idle":
		return "idle"
	case "dnd":
		return "dnd"
	case "invisible":
		return "invisible"
	case "offline":
		return "offline"
	default:
		return ""
	}
}
