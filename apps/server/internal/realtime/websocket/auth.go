package websocket

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
)

var ErrSocketUnauthorized = errors.New("socket unauthorized")

const maxSocketTokenLength = 4096

type AuthSubject struct {
	UserID    string
	ExpiresAt time.Time
}

type SocketAuthenticator struct {
	tokenManager *security.TokenManager
}

func NewSocketAuthenticator(tokenManager *security.TokenManager) *SocketAuthenticator {
	return &SocketAuthenticator{tokenManager: tokenManager}
}

func (a *SocketAuthenticator) Authenticate(r *http.Request) (AuthSubject, error) {
	token := tokenFromSubprotocol(r.Header.Get("Sec-WebSocket-Protocol"))
	if token == "" {
		token = extractBearerToken(strings.TrimSpace(r.Header.Get("Authorization")))
	}
	if token == "" || len(token) > maxSocketTokenLength {
		return AuthSubject{}, ErrSocketUnauthorized
	}

	claims, err := a.tokenManager.ParseAccessToken(token)
	if err != nil {
		return AuthSubject{}, ErrSocketUnauthorized
	}
	if strings.TrimSpace(claims.Subject) == "" {
		return AuthSubject{}, ErrSocketUnauthorized
	}
	if claims.ExpiresAt == nil {
		return AuthSubject{}, ErrSocketUnauthorized
	}

	return AuthSubject{
		UserID:    claims.Subject,
		ExpiresAt: claims.ExpiresAt.Time.UTC(),
	}, nil
}

func extractBearerToken(header string) string {
	if header == "" {
		return ""
	}
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 {
		return ""
	}
	if !strings.EqualFold(strings.TrimSpace(parts[0]), "Bearer") {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

func tokenFromSubprotocol(header string) string {
	if strings.TrimSpace(header) == "" {
		return ""
	}

	parts := strings.Split(header, ",")
	for _, part := range parts {
		candidate := strings.TrimSpace(part)
		if !strings.HasPrefix(strings.ToLower(candidate), "access_token.") {
			continue
		}
		token := strings.TrimSpace(candidate[len("access_token."):])
		if token != "" {
			return token
		}
	}

	return ""
}
