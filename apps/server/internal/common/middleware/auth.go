package middleware

import (
	"context"
	"net/http"
	"strings"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
)

type authContextKey string

const userIDContextKey authContextKey = "user_id"
const maxBearerTokenLength = 4096

func RequireJWT(tokenManager *security.TokenManager) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			authorization := strings.TrimSpace(r.Header.Get("Authorization"))
			if authorization == "" {
				httpx.Error(w, http.StatusUnauthorized, "missing authorization header")
				return
			}

			parts := strings.SplitN(authorization, " ", 2)
			if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
				httpx.Error(w, http.StatusUnauthorized, "invalid authorization header")
				return
			}
			token := strings.TrimSpace(parts[1])
			if token == "" || len(token) > maxBearerTokenLength {
				httpx.Error(w, http.StatusUnauthorized, "invalid access token")
				return
			}

			claims, err := tokenManager.ParseAccessToken(token)
			if err != nil {
				httpx.Error(w, http.StatusUnauthorized, "invalid access token")
				return
			}

			ctx := context.WithValue(r.Context(), userIDContextKey, claims.Subject)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func UserIDFromContext(ctx context.Context) (string, bool) {
	value := ctx.Value(userIDContextKey)
	if value == nil {
		return "", false
	}
	userID, ok := value.(string)
	if !ok || strings.TrimSpace(userID) == "" {
		return "", false
	}
	return userID, true
}
