package security

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/golang-jwt/jwt/v5"
)

type TokenType string

const (
	AccessTokenType  TokenType = "access"
	RefreshTokenType TokenType = "refresh"
)

type Claims struct {
	TokenType TokenType `json:"token_type"`
	jwt.RegisteredClaims
}

type TokenManager struct {
	issuer        string
	audience      string
	accessSecret  []byte
	refreshSecret []byte
	accessTTL     time.Duration
	refreshTTL    time.Duration
	parser        *jwt.Parser
}

func NewTokenManager(issuer, audience, accessSecret, refreshSecret string, accessTTL, refreshTTL time.Duration) *TokenManager {
	normalizedIssuer := issuer
	if normalizedIssuer == "" {
		normalizedIssuer = "catwa"
	}
	normalizedAudience := audience
	if normalizedAudience == "" {
		normalizedAudience = "catwa-client"
	}

	return &TokenManager{
		issuer:        normalizedIssuer,
		audience:      normalizedAudience,
		accessSecret:  []byte(accessSecret),
		refreshSecret: []byte(refreshSecret),
		accessTTL:     accessTTL,
		refreshTTL:    refreshTTL,
		parser: jwt.NewParser(
			jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
			jwt.WithIssuer(normalizedIssuer),
			jwt.WithAudience(normalizedAudience),
			jwt.WithLeeway(30*time.Second),
			jwt.WithExpirationRequired(),
			jwt.WithIssuedAt(),
		),
	}
}

func (tm *TokenManager) GenerateAccessToken(userID string) (string, time.Time, error) {
	expiresAt := time.Now().UTC().Add(tm.accessTTL)
	claims := Claims{
		TokenType: AccessTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tm.issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{tm.audience},
			ID:        uuid.NewString(),
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(tm.accessSecret)
	if err != nil {
		return "", time.Time{}, err
	}

	return signed, expiresAt, nil
}

func (tm *TokenManager) GenerateRefreshToken(userID, tokenID string) (string, time.Time, error) {
	expiresAt := time.Now().UTC().Add(tm.refreshTTL)
	claims := Claims{
		TokenType: RefreshTokenType,
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    tm.issuer,
			Subject:   userID,
			Audience:  jwt.ClaimStrings{tm.audience},
			ID:        tokenID,
			IssuedAt:  jwt.NewNumericDate(time.Now().UTC()),
			ExpiresAt: jwt.NewNumericDate(expiresAt),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString(tm.refreshSecret)
	if err != nil {
		return "", time.Time{}, err
	}

	return signed, expiresAt, nil
}

func (tm *TokenManager) ParseAccessToken(rawToken string) (*Claims, error) {
	claims, err := tm.parse(rawToken, tm.accessSecret)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != AccessTokenType {
		return nil, errors.New("invalid token type")
	}
	if claims.ID == "" {
		return nil, errors.New("missing token id")
	}
	return claims, nil
}

func (tm *TokenManager) ParseRefreshToken(rawToken string) (*Claims, error) {
	claims, err := tm.parse(rawToken, tm.refreshSecret)
	if err != nil {
		return nil, err
	}
	if claims.TokenType != RefreshTokenType {
		return nil, errors.New("invalid token type")
	}
	if claims.ID == "" {
		return nil, errors.New("missing token id")
	}
	return claims, nil
}

func (tm *TokenManager) parse(rawToken string, secret []byte) (*Claims, error) {
	claims := &Claims{}
	token, err := tm.parser.ParseWithClaims(rawToken, claims, func(token *jwt.Token) (interface{}, error) {
		if token.Method != jwt.SigningMethodHS256 {
			return nil, fmt.Errorf("unexpected signing method")
		}
		return secret, nil
	})
	if err != nil {
		return nil, err
	}
	if !token.Valid {
		return nil, errors.New("invalid token")
	}
	if claims.Issuer != tm.issuer {
		return nil, errors.New("invalid token issuer")
	}
	if !hasAudience(claims.Audience, tm.audience) {
		return nil, errors.New("invalid token audience")
	}
	if claims.Subject == "" {
		return nil, errors.New("missing subject")
	}
	return claims, nil
}

func hasAudience(aud jwt.ClaimStrings, expected string) bool {
	target := expected
	for _, candidate := range aud {
		if candidate == target {
			return true
		}
	}
	return false
}

func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
