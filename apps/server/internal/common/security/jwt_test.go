package security

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestParseAccessTokenRejectsWrongIssuer(t *testing.T) {
	tm := NewTokenManager("catwa", "catwa-client", "12345678901234567890123456789012", "abcdefghijklmnopqrstuvwxyzABCDEF", 15*time.Minute, 24*time.Hour)

	expiresAt := time.Now().UTC().Add(5 * time.Minute)
	claims := Claims{
		TokenType: AccessTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "other",
			Subject:   "user-1",
			Audience:  jwt.ClaimStrings{"catwa-client"},
			ID:        "token-1",
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	raw, err := token.SignedString([]byte("12345678901234567890123456789012"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := tm.ParseAccessToken(raw); err == nil {
		t.Fatalf("expected invalid issuer error")
	}
}

func TestParseRefreshTokenRequiresTokenID(t *testing.T) {
	tm := NewTokenManager("catwa", "catwa-client", "12345678901234567890123456789012", "abcdefghijklmnopqrstuvwxyzABCDEF", 15*time.Minute, 24*time.Hour)

	expiresAt := time.Now().UTC().Add(5 * time.Minute)
	claims := Claims{
		TokenType: RefreshTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "catwa",
			Subject:   "user-1",
			Audience:  jwt.ClaimStrings{"catwa-client"},
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	raw, err := token.SignedString([]byte("abcdefghijklmnopqrstuvwxyzABCDEF"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := tm.ParseRefreshToken(raw); err == nil {
		t.Fatalf("expected missing token id error")
	}
}

func TestParseAccessTokenRequiresTokenID(t *testing.T) {
	tm := NewTokenManager("catwa", "catwa-client", "12345678901234567890123456789012", "abcdefghijklmnopqrstuvwxyzABCDEF", 15*time.Minute, 24*time.Hour)

	expiresAt := time.Now().UTC().Add(5 * time.Minute)
	claims := Claims{
		TokenType: AccessTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "catwa",
			Subject:   "user-1",
			Audience:  jwt.ClaimStrings{"catwa-client"},
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	raw, err := token.SignedString([]byte("12345678901234567890123456789012"))
	if err != nil {
		t.Fatalf("sign token: %v", err)
	}

	if _, err := tm.ParseAccessToken(raw); err == nil {
		t.Fatalf("expected missing token id error")
	}
}
