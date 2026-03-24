package auth

import (
	"context"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrInvalidCredentials = errors.New("invalid_credentials")
	ErrTokenInvalid       = errors.New("invalid_refresh_token")
	ErrConflict           = errors.New("conflict")
	ErrNotFound           = errors.New("not_found")
)

// Precomputed bcrypt hash for "catwa.invalid.password" used to reduce login timing differences.
const dummyPasswordHash = "$2a$12$wYIrYhtN2fTHR.AElO4J2O0SG2Vf4MZN7sufx7z8X/jjYHvuSEu6a"
const maxRefreshTokenLength = 8192

type Service struct {
	db           *database.DB
	tokenManager *security.TokenManager
}

func NewService(db *database.DB, tokenManager *security.TokenManager) *Service {
	return &Service{db: db, tokenManager: tokenManager}
}

type registerInput struct {
	Email     string
	Username  string
	Password  string
	IP        string
	UserAgent string
}

func (s *Service) Register(ctx context.Context, input registerInput) (authResponse, error) {
	passwordHash, err := security.HashPassword(input.Password)
	if err != nil {
		return authResponse{}, fmt.Errorf("hash password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return authResponse{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var user userDTO
	err = tx.QueryRow(ctx, `
		INSERT INTO users (email, username, display_name, password_hash)
		VALUES (LOWER($1), $2, $3, $4)
		RETURNING id, email, username, display_name, created_at
	`, strings.TrimSpace(input.Email), strings.TrimSpace(input.Username), strings.TrimSpace(input.Username), passwordHash).
		Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return authResponse{}, ErrConflict
		}
		return authResponse{}, fmt.Errorf("insert user: %w", err)
	}

	sessionID, err := s.createSession(ctx, tx, user.ID, input.IP, input.UserAgent)
	if err != nil {
		return authResponse{}, err
	}

	tokens, err := s.issueTokens(ctx, tx, user.ID, sessionID, input.IP, input.UserAgent)
	if err != nil {
		return authResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return authResponse{}, fmt.Errorf("commit register tx: %w", err)
	}

	return authResponse{User: user, Tokens: tokens}, nil
}

type loginInput struct {
	EmailOrUsername string
	Password        string
	IP              string
	UserAgent       string
}

func (s *Service) Login(ctx context.Context, input loginInput) (authResponse, error) {
	var user struct {
		ID           string
		Email        string
		Username     string
		DisplayName  string
		PasswordHash string
		CreatedAt    time.Time
	}

	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, email, username, display_name, password_hash, created_at
		FROM users
		WHERE email = LOWER($1) OR username = $1
		LIMIT 1
	`, strings.TrimSpace(input.EmailOrUsername)).
		Scan(&user.ID, &user.Email, &user.Username, &user.DisplayName, &user.PasswordHash, &user.CreatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_ = security.ComparePassword(dummyPasswordHash, input.Password)
			return authResponse{}, ErrInvalidCredentials
		}
		return authResponse{}, fmt.Errorf("get user: %w", err)
	}

	if err := security.ComparePassword(user.PasswordHash, input.Password); err != nil {
		return authResponse{}, ErrInvalidCredentials
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return authResponse{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	sessionID, err := s.createSession(ctx, tx, user.ID, input.IP, input.UserAgent)
	if err != nil {
		return authResponse{}, err
	}

	tokens, err := s.issueTokens(ctx, tx, user.ID, sessionID, input.IP, input.UserAgent)
	if err != nil {
		return authResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return authResponse{}, fmt.Errorf("commit login tx: %w", err)
	}

	return authResponse{
		User: userDTO{
			ID:          user.ID,
			Email:       user.Email,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			CreatedAt:   user.CreatedAt,
		},
		Tokens: tokens,
	}, nil
}

func (s *Service) Logout(ctx context.Context, refreshToken string) error {
	cleanToken := strings.TrimSpace(refreshToken)
	if cleanToken == "" || len(cleanToken) > maxRefreshTokenLength {
		return ErrTokenInvalid
	}
	claims, err := s.tokenManager.ParseRefreshToken(cleanToken)
	if err != nil {
		return ErrTokenInvalid
	}

	hash := security.HashToken(cleanToken)
	result, err := s.db.Pool.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE id = $1 AND token_hash = $2 AND revoked_at IS NULL
	`, claims.ID, hash)
	if err != nil {
		return fmt.Errorf("revoke refresh token: %w", err)
	}

	if result.RowsAffected() == 0 {
		return ErrTokenInvalid
	}

	_, err = s.db.Pool.Exec(ctx, `
		UPDATE user_sessions
		SET revoked_at = NOW()
		WHERE id = (
			SELECT session_id
			FROM refresh_tokens
			WHERE id = $1
		)
	`, claims.ID)
	if err != nil {
		return fmt.Errorf("revoke user session: %w", err)
	}

	return nil
}

func (s *Service) Refresh(ctx context.Context, refreshToken, ip, userAgent string) (tokensDTO, error) {
	cleanToken := strings.TrimSpace(refreshToken)
	if cleanToken == "" || len(cleanToken) > maxRefreshTokenLength {
		return tokensDTO{}, ErrTokenInvalid
	}
	claims, err := s.tokenManager.ParseRefreshToken(cleanToken)
	if err != nil {
		return tokensDTO{}, ErrTokenInvalid
	}

	hash := security.HashToken(cleanToken)

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return tokensDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var row struct {
		UserID    string
		SessionID string
		ExpiresAt time.Time
		RevokedAt *time.Time
	}

	err = tx.QueryRow(ctx, `
		SELECT user_id, session_id, expires_at, revoked_at
		FROM refresh_tokens
		WHERE id = $1 AND token_hash = $2
		FOR UPDATE
	`, claims.ID, hash).Scan(&row.UserID, &row.SessionID, &row.ExpiresAt, &row.RevokedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return tokensDTO{}, ErrTokenInvalid
		}
		return tokensDTO{}, fmt.Errorf("load refresh token: %w", err)
	}

	now := time.Now().UTC()
	if row.ExpiresAt.Before(now) || row.UserID != claims.Subject {
		return tokensDTO{}, ErrTokenInvalid
	}
	if row.RevokedAt != nil {
		if err := s.revokeSessionTokensTx(ctx, tx, row.SessionID); err != nil {
			return tokensDTO{}, err
		}
		if err := tx.Commit(ctx); err != nil {
			return tokensDTO{}, fmt.Errorf("commit refresh token reuse tx: %w", err)
		}
		return tokensDTO{}, ErrTokenInvalid
	}

	if _, err := tx.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE id = $1
	`, claims.ID); err != nil {
		return tokensDTO{}, fmt.Errorf("revoke old refresh token: %w", err)
	}

	tokens, err := s.issueTokens(ctx, tx, row.UserID, row.SessionID, ip, userAgent)
	if err != nil {
		return tokensDTO{}, err
	}

	if _, err := tx.Exec(ctx, `
		UPDATE user_sessions
		SET last_seen_at = NOW()
		WHERE id = $1
	`, row.SessionID); err != nil {
		return tokensDTO{}, fmt.Errorf("update session heartbeat: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return tokensDTO{}, fmt.Errorf("commit refresh tx: %w", err)
	}

	return tokens, nil
}

func (s *Service) ChangePassword(ctx context.Context, userID, currentPassword, newPassword string) error {
	var currentHash string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT password_hash
		FROM users
		WHERE id = $1
	`, userID).Scan(&currentHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrNotFound
		}
		return fmt.Errorf("get user hash: %w", err)
	}

	if err := security.ComparePassword(currentHash, currentPassword); err != nil {
		return ErrInvalidCredentials
	}

	newHash, err := security.HashPassword(newPassword)
	if err != nil {
		return fmt.Errorf("hash new password: %w", err)
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		UPDATE users
		SET password_hash = $2, updated_at = NOW()
		WHERE id = $1
	`, userID, newHash); err != nil {
		return fmt.Errorf("update user password: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, userID); err != nil {
		return fmt.Errorf("revoke refresh tokens: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE user_sessions
		SET revoked_at = NOW()
		WHERE user_id = $1 AND revoked_at IS NULL
	`, userID); err != nil {
		return fmt.Errorf("revoke sessions: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit password tx: %w", err)
	}

	return nil
}

func (s *Service) createSession(ctx context.Context, tx pgx.Tx, userID, ip, userAgent string) (string, error) {
	ipAddress := sanitizeIPAddress(ip)

	var sessionID string
	err := tx.QueryRow(ctx, `
		INSERT INTO user_sessions (user_id, ip_address, user_agent, last_seen_at)
		VALUES ($1, NULLIF($2, '')::inet, NULLIF($3, ''), NOW())
		RETURNING id
	`, userID, ipAddress, strings.TrimSpace(userAgent)).Scan(&sessionID)
	if err != nil {
		return "", fmt.Errorf("insert session: %w", err)
	}

	return sessionID, nil
}

func (s *Service) issueTokens(ctx context.Context, tx pgx.Tx, userID, sessionID, ip, userAgent string) (tokensDTO, error) {
	accessToken, accessExpiry, err := s.tokenManager.GenerateAccessToken(userID)
	if err != nil {
		return tokensDTO{}, fmt.Errorf("generate access token: %w", err)
	}

	refreshTokenID := uuid.NewString()
	refreshToken, refreshExpiry, err := s.tokenManager.GenerateRefreshToken(userID, refreshTokenID)
	if err != nil {
		return tokensDTO{}, fmt.Errorf("generate refresh token: %w", err)
	}

	refreshHash := security.HashToken(refreshToken)
	ipAddress := sanitizeIPAddress(ip)
	if _, err := tx.Exec(ctx, `
		INSERT INTO refresh_tokens (id, user_id, session_id, token_hash, expires_at, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, NULLIF($6, '')::inet, NULLIF($7, ''))
	`, refreshTokenID, userID, sessionID, refreshHash, refreshExpiry, ipAddress, strings.TrimSpace(userAgent)); err != nil {
		return tokensDTO{}, fmt.Errorf("insert refresh token: %w", err)
	}

	return tokensDTO{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "Bearer",
		ExpiresIn:    int64(time.Until(accessExpiry).Seconds()),
	}, nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}

func (s *Service) revokeSessionTokensTx(ctx context.Context, tx pgx.Tx, sessionID string) error {
	if _, err := tx.Exec(ctx, `
		UPDATE refresh_tokens
		SET revoked_at = NOW()
		WHERE session_id = $1 AND revoked_at IS NULL
	`, sessionID); err != nil {
		return fmt.Errorf("revoke refresh tokens for session: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE user_sessions
		SET revoked_at = NOW()
		WHERE id = $1 AND revoked_at IS NULL
	`, sessionID); err != nil {
		return fmt.Errorf("revoke session: %w", err)
	}

	return nil
}

func sanitizeIPAddress(ip string) string {
	value := strings.TrimSpace(ip)
	if value == "" {
		return ""
	}

	parsed := net.ParseIP(value)
	if parsed == nil {
		return ""
	}
	return parsed.String()
}
