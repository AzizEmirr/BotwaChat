package config

import (
	"crypto/subtle"
	"fmt"
	"net/netip"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
)

const (
	defaultAppEnv                = "development"
	defaultHTTPAddr              = ":8080"
	defaultPostgresURLDev        = "postgres://postgres:postgres@localhost:5432/catwa?sslmode=disable"
	defaultPostgresURLProd       = ""
	defaultCORSOriginsDev        = "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,https://tauri.localhost,http://tauri.localhost,app://localhost"
	defaultWSOriginsDev          = "http://localhost:1420,http://127.0.0.1:1420,tauri://localhost,https://tauri.localhost,http://tauri.localhost,app://localhost"
	defaultCORSOriginsProd       = "https://catwa.chat,https://www.catwa.chat"
	defaultWSOriginsProd         = "https://catwa.chat,https://www.catwa.chat,https://ws.catwa.chat"
	defaultTrustedProxyCIDRsDev  = "127.0.0.1/8,::1/128,10.0.0.0/8,172.16.0.0/12,192.168.0.0/16,fc00::/7"
	defaultTrustedProxyCIDRsProd = ""
	defaultWSNotifyChannel       = "catwa_realtime_events"
	defaultLiveKitURL            = "http://127.0.0.1:7880"
	defaultLiveKitPublicURL      = "wss://livekit.catwa.chat"
	defaultLiveKitAPIKey         = "devkey"
	defaultLiveKitAPISecret      = "secret"
	defaultVoiceRoomPrefix       = "catwa-voice-"
	defaultJWTIssuer             = "catwa"
	defaultJWTAudience           = "catwa-client"
	defaultJWTAccessSecret       = "replace-with-strong-access-secret"
	defaultJWTRefreshSecret      = "replace-with-strong-refresh-secret"
	defaultUploadAccessSecret    = "replace-with-strong-upload-access-secret"
	defaultAccessTokenTTL        = "15m"
	defaultRefreshTokenTTL       = "720h"
	defaultVoiceTokenTTL         = "5m"
	defaultWSHeartbeat           = "15s"
	defaultWSReconnectAfter      = "2s"
	defaultWSTypingTimeout       = "5s"
	defaultVoiceDisconnect       = "30s"
	defaultStoragePath           = "./storage"
	defaultRateLimitRPS          = 10.0
	defaultRateLimitBurst        = 30
	defaultWSQueueSize           = 256
	defaultWSMaxMessageSize      = int64(1024 * 1024)
	defaultMaxUploadBytes        = int64(10 * 1024 * 1024)
	defaultUploadAccessTTL       = "2m"
	defaultVoiceCapacity         = 10
	defaultTurnstileVerify       = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
	defaultTurnstileDesktopBypass = true
)

func loadDotEnv() {
	candidates := []string{
		".env",
		filepath.Join("apps", "server", ".env"),
	}

	for _, candidate := range candidates {
		if _, err := os.Stat(candidate); err == nil {
			_ = godotenv.Load(candidate)
		}
	}
}

type Config struct {
	AppEnv                       string
	HTTPAddr                     string
	PostgresURL                  string
	LiveKitURL                   string
	LiveKitPublicURL             string
	LiveKitAPIKey                string
	LiveKitAPISecret             string
	VoiceRoomPrefix              string
	VoiceTokenTTL                time.Duration
	VoiceMaxCapacity             int
	VoiceDisconnectTTL           time.Duration
	CORSAllowedOrigins           []string
	WSAllowedOrigins             []string
	WSNotifyChannel              string
	WSHeartbeat                  time.Duration
	WSReconnectAfter             time.Duration
	WSTypingTimeout              time.Duration
	WSAllowEmptyOrigin           bool
	TrustedProxyCIDRs            []string
	WSQueueSize                  int
	WSMaxMessageSize             int64
	JWTIssuer                    string
	JWTAudience                  string
	JWTAccessSecret              string
	JWTRefreshSecret             string
	AccessTokenTTL               time.Duration
	RefreshTokenTTL              time.Duration
	StoragePath                  string
	UploadsPath                  string
	MaxUploadBytes               int64
	UploadAccessSecret           string
	UploadAccessTTL              time.Duration
	TurnstileSecretKey           string
	TurnstileVerifyURL           string
	TurnstileEnforceServerInvite bool
	TurnstileAllowDesktopBypass  bool
	RateLimitRPS                 float64
	RateLimitBurst               int
}

func Load() (Config, error) {
	loadDotEnv()
	appEnv := getEnv("APP_ENV", defaultAppEnv)

	defaultCORSOrigins := defaultCORSOriginsDev
	defaultWSOrigins := defaultWSOriginsDev
	defaultTrustedProxyCIDRs := defaultTrustedProxyCIDRsDev
	defaultWSAllowEmptyOrigin := true
	defaultPostgresURL := defaultPostgresURLDev
	if strings.ToLower(strings.TrimSpace(appEnv)) != defaultAppEnv {
		defaultCORSOrigins = defaultCORSOriginsProd
		defaultWSOrigins = defaultWSOriginsProd
		defaultTrustedProxyCIDRs = defaultTrustedProxyCIDRsProd
		defaultWSAllowEmptyOrigin = false
		defaultPostgresURL = defaultPostgresURLProd
	}

	accessTTL, err := time.ParseDuration(getEnv("ACCESS_TOKEN_TTL", defaultAccessTokenTTL))
	if err != nil {
		return Config{}, fmt.Errorf("invalid ACCESS_TOKEN_TTL: %w", err)
	}

	refreshTTL, err := time.ParseDuration(getEnv("REFRESH_TOKEN_TTL", defaultRefreshTokenTTL))
	if err != nil {
		return Config{}, fmt.Errorf("invalid REFRESH_TOKEN_TTL: %w", err)
	}

	voiceTokenTTL, err := time.ParseDuration(getEnv("VOICE_TOKEN_TTL", defaultVoiceTokenTTL))
	if err != nil {
		return Config{}, fmt.Errorf("invalid VOICE_TOKEN_TTL: %w", err)
	}

	wsHeartbeat, err := time.ParseDuration(getEnv("WS_HEARTBEAT_INTERVAL", defaultWSHeartbeat))
	if err != nil {
		return Config{}, fmt.Errorf("invalid WS_HEARTBEAT_INTERVAL: %w", err)
	}

	wsReconnectAfter, err := time.ParseDuration(getEnv("WS_RECONNECT_AFTER", defaultWSReconnectAfter))
	if err != nil {
		return Config{}, fmt.Errorf("invalid WS_RECONNECT_AFTER: %w", err)
	}

	wsTypingTimeout, err := time.ParseDuration(getEnv("WS_TYPING_TIMEOUT", defaultWSTypingTimeout))
	if err != nil {
		return Config{}, fmt.Errorf("invalid WS_TYPING_TIMEOUT: %w", err)
	}

	voiceDisconnectTTL, err := time.ParseDuration(getEnv("VOICE_DISCONNECT_GRACE", defaultVoiceDisconnect))
	if err != nil {
		return Config{}, fmt.Errorf("invalid VOICE_DISCONNECT_GRACE: %w", err)
	}

	rateLimitRPS, err := getEnvFloat("RATE_LIMIT_RPS", defaultRateLimitRPS)
	if err != nil {
		return Config{}, err
	}

	rateLimitBurst, err := getEnvInt("RATE_LIMIT_BURST", defaultRateLimitBurst)
	if err != nil {
		return Config{}, err
	}

	maxUploadBytes, err := getEnvInt64("MAX_UPLOAD_BYTES", defaultMaxUploadBytes)
	if err != nil {
		return Config{}, err
	}
	uploadAccessTTL, err := time.ParseDuration(getEnv("UPLOAD_ACCESS_URL_TTL", defaultUploadAccessTTL))
	if err != nil {
		return Config{}, fmt.Errorf("invalid UPLOAD_ACCESS_URL_TTL: %w", err)
	}

	wsQueueSize, err := getEnvInt("WS_QUEUE_SIZE", defaultWSQueueSize)
	if err != nil {
		return Config{}, err
	}

	wsMaxMessageSize, err := getEnvInt64("WS_MAX_MESSAGE_SIZE", defaultWSMaxMessageSize)
	if err != nil {
		return Config{}, err
	}

	voiceMaxCapacity, err := getEnvInt("VOICE_MAX_CAPACITY", defaultVoiceCapacity)
	if err != nil {
		return Config{}, err
	}

	storagePath := filepath.Clean(getEnv("STORAGE_PATH", defaultStoragePath))
	uploadsPath := getEnv("UPLOADS_PATH", filepath.Join(storagePath, "uploads"))

	cfg := Config{
		AppEnv:                       appEnv,
		HTTPAddr:                     getEnv("HTTP_ADDR", defaultHTTPAddr),
		PostgresURL:                  getEnv("POSTGRES_URL", defaultPostgresURL),
		LiveKitURL:                   getEnv("LIVEKIT_URL", defaultLiveKitURL),
		LiveKitPublicURL:             getEnv("LIVEKIT_PUBLIC_URL", defaultLiveKitPublicURL),
		LiveKitAPIKey:                getEnv("LIVEKIT_API_KEY", defaultLiveKitAPIKey),
		LiveKitAPISecret:             getEnv("LIVEKIT_API_SECRET", defaultLiveKitAPISecret),
		VoiceRoomPrefix:              getEnv("VOICE_ROOM_PREFIX", defaultVoiceRoomPrefix),
		VoiceTokenTTL:                voiceTokenTTL,
		VoiceMaxCapacity:             voiceMaxCapacity,
		VoiceDisconnectTTL:           voiceDisconnectTTL,
		CORSAllowedOrigins:           splitCSV(getEnv("CORS_ALLOWED_ORIGINS", defaultCORSOrigins)),
		WSAllowedOrigins:             splitCSV(getEnv("WS_ALLOWED_ORIGINS", defaultWSOrigins)),
		WSNotifyChannel:              getEnv("WS_NOTIFY_CHANNEL", defaultWSNotifyChannel),
		WSHeartbeat:                  wsHeartbeat,
		WSReconnectAfter:             wsReconnectAfter,
		WSTypingTimeout:              wsTypingTimeout,
		WSAllowEmptyOrigin:           getEnvBool("WS_ALLOW_EMPTY_ORIGIN", defaultWSAllowEmptyOrigin),
		TrustedProxyCIDRs:            splitCSV(getEnv("TRUSTED_PROXY_CIDRS", defaultTrustedProxyCIDRs)),
		WSQueueSize:                  wsQueueSize,
		WSMaxMessageSize:             wsMaxMessageSize,
		JWTIssuer:                    getEnv("JWT_ISSUER", defaultJWTIssuer),
		JWTAudience:                  getEnv("JWT_AUDIENCE", defaultJWTAudience),
		JWTAccessSecret:              getEnv("JWT_ACCESS_SECRET", defaultJWTAccessSecret),
		JWTRefreshSecret:             getEnv("JWT_REFRESH_SECRET", defaultJWTRefreshSecret),
		AccessTokenTTL:               accessTTL,
		RefreshTokenTTL:              refreshTTL,
		StoragePath:                  storagePath,
		UploadsPath:                  filepath.Clean(uploadsPath),
		MaxUploadBytes:               maxUploadBytes,
		UploadAccessTTL:              uploadAccessTTL,
		TurnstileSecretKey:           getEnv("TURNSTILE_SECRET_KEY", ""),
		TurnstileVerifyURL:           getEnv("TURNSTILE_VERIFY_URL", defaultTurnstileVerify),
		TurnstileEnforceServerInvite: getEnvBool("TURNSTILE_ENFORCE_SERVER_INVITE", false),
		TurnstileAllowDesktopBypass:  getEnvBool("TURNSTILE_ALLOW_DESKTOP_BYPASS", defaultTurnstileDesktopBypass),
		RateLimitRPS:                 rateLimitRPS,
		RateLimitBurst:               rateLimitBurst,
	}
	cfg.UploadAccessSecret = getEnv("UPLOAD_ACCESS_SECRET", defaultUploadAccessSecret)
	if strings.TrimSpace(cfg.PostgresURL) == "" {
		return Config{}, fmt.Errorf("POSTGRES_URL cannot be empty")
	}

	parsedPostgresURL, err := url.Parse(strings.TrimSpace(cfg.PostgresURL))
	if err != nil {
		return Config{}, fmt.Errorf("POSTGRES_URL must be a valid url: %w", err)
	}
	switch strings.ToLower(strings.TrimSpace(parsedPostgresURL.Scheme)) {
	case "postgres", "postgresql":
	default:
		return Config{}, fmt.Errorf("POSTGRES_URL must use postgres or postgresql scheme")
	}
	if strings.TrimSpace(parsedPostgresURL.Host) == "" {
		return Config{}, fmt.Errorf("POSTGRES_URL host cannot be empty")
	}

	if len(cfg.JWTAccessSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be at least 32 characters")
	}
	if len(cfg.JWTRefreshSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_REFRESH_SECRET must be at least 32 characters")
	}
	if len(cfg.UploadAccessSecret) < 32 {
		return Config{}, fmt.Errorf("UPLOAD_ACCESS_SECRET must be at least 32 characters")
	}
	if strings.TrimSpace(cfg.JWTIssuer) == "" {
		return Config{}, fmt.Errorf("JWT_ISSUER cannot be empty")
	}
	if strings.TrimSpace(cfg.JWTAudience) == "" {
		return Config{}, fmt.Errorf("JWT_AUDIENCE cannot be empty")
	}
	isDevelopment := strings.EqualFold(strings.TrimSpace(cfg.AppEnv), defaultAppEnv)
	if !isDevelopment {
		if parsedPostgresURL.User != nil {
			username := parsedPostgresURL.User.Username()
			password, _ := parsedPostgresURL.User.Password()
			if strings.EqualFold(strings.TrimSpace(username), "postgres") && password == "postgres" {
				return Config{}, fmt.Errorf("POSTGRES_URL must not use default postgres credentials in production")
			}
		}
		if isWeakSecret(cfg.JWTAccessSecret, defaultJWTAccessSecret, "dev_access_secret_change_this_1234567890") {
			return Config{}, fmt.Errorf("JWT_ACCESS_SECRET must be a strong non-default value in production")
		}
		if isWeakSecret(cfg.JWTRefreshSecret, defaultJWTRefreshSecret, "dev_refresh_secret_change_this_1234567890") {
			return Config{}, fmt.Errorf("JWT_REFRESH_SECRET must be a strong non-default value in production")
		}
		if isWeakSecret(cfg.UploadAccessSecret, defaultUploadAccessSecret, "dev_upload_access_secret_change_this_1234567890") {
			return Config{}, fmt.Errorf("UPLOAD_ACCESS_SECRET must be a strong non-default value in production")
		}
		if subtleConstantTimeEqual(cfg.UploadAccessSecret, cfg.JWTAccessSecret) {
			return Config{}, fmt.Errorf("UPLOAD_ACCESS_SECRET must be different from JWT_ACCESS_SECRET in production")
		}
		if subtleConstantTimeEqual(cfg.UploadAccessSecret, cfg.JWTRefreshSecret) {
			return Config{}, fmt.Errorf("UPLOAD_ACCESS_SECRET must be different from JWT_REFRESH_SECRET in production")
		}
		if isWeakSecret(cfg.LiveKitAPIKey, defaultLiveKitAPIKey) {
			return Config{}, fmt.Errorf("LIVEKIT_API_KEY must be non-default in production")
		}
		if isWeakSecret(cfg.LiveKitAPISecret, defaultLiveKitAPISecret, "secret") {
			return Config{}, fmt.Errorf("LIVEKIT_API_SECRET must be non-default in production")
		}
	}
	if len(cfg.CORSAllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("CORS_ALLOWED_ORIGINS cannot be empty")
	}
	for _, origin := range cfg.CORSAllowedOrigins {
		if err := validateOrigin(origin, isDevelopment); err != nil {
			return Config{}, fmt.Errorf("invalid CORS_ALLOWED_ORIGINS entry %q: %w", origin, err)
		}
	}
	if len(cfg.WSAllowedOrigins) == 0 {
		return Config{}, fmt.Errorf("WS_ALLOWED_ORIGINS cannot be empty")
	}
	for _, origin := range cfg.WSAllowedOrigins {
		if err := validateOrigin(origin, isDevelopment); err != nil {
			return Config{}, fmt.Errorf("invalid WS_ALLOWED_ORIGINS entry %q: %w", origin, err)
		}
	}
	if !isDevelopment && cfg.WSAllowEmptyOrigin {
		return Config{}, fmt.Errorf("WS_ALLOW_EMPTY_ORIGIN cannot be enabled in production")
	}
	for _, cidr := range cfg.TrustedProxyCIDRs {
		if _, err := netip.ParsePrefix(cidr); err != nil {
			return Config{}, fmt.Errorf("invalid TRUSTED_PROXY_CIDRS entry %q: %w", cidr, err)
		}
	}
	if cfg.MaxUploadBytes <= 0 {
		return Config{}, fmt.Errorf("MAX_UPLOAD_BYTES must be positive")
	}
	if cfg.UploadAccessTTL <= 0 {
		return Config{}, fmt.Errorf("UPLOAD_ACCESS_URL_TTL must be positive")
	}
	if cfg.WSQueueSize <= 0 {
		return Config{}, fmt.Errorf("WS_QUEUE_SIZE must be positive")
	}
	if cfg.WSMaxMessageSize <= 0 {
		return Config{}, fmt.Errorf("WS_MAX_MESSAGE_SIZE must be positive")
	}
	if strings.TrimSpace(cfg.WSNotifyChannel) == "" {
		return Config{}, fmt.Errorf("WS_NOTIFY_CHANNEL cannot be empty")
	}
	if strings.TrimSpace(cfg.LiveKitURL) == "" {
		return Config{}, fmt.Errorf("LIVEKIT_URL cannot be empty")
	}
	if strings.TrimSpace(cfg.LiveKitPublicURL) == "" {
		return Config{}, fmt.Errorf("LIVEKIT_PUBLIC_URL cannot be empty")
	}
	if strings.TrimSpace(cfg.LiveKitAPIKey) == "" {
		return Config{}, fmt.Errorf("LIVEKIT_API_KEY cannot be empty")
	}
	if strings.TrimSpace(cfg.LiveKitAPISecret) == "" {
		return Config{}, fmt.Errorf("LIVEKIT_API_SECRET cannot be empty")
	}
	if strings.TrimSpace(cfg.VoiceRoomPrefix) == "" {
		return Config{}, fmt.Errorf("VOICE_ROOM_PREFIX cannot be empty")
	}
	if cfg.VoiceTokenTTL <= 0 {
		return Config{}, fmt.Errorf("VOICE_TOKEN_TTL must be positive")
	}
	if !isDevelopment && cfg.VoiceTokenTTL > 5*time.Minute {
		return Config{}, fmt.Errorf("VOICE_TOKEN_TTL must be <= 5m in production")
	}
	if cfg.VoiceMaxCapacity <= 0 {
		return Config{}, fmt.Errorf("VOICE_MAX_CAPACITY must be positive")
	}
	if cfg.VoiceDisconnectTTL <= 0 {
		return Config{}, fmt.Errorf("VOICE_DISCONNECT_GRACE must be positive")
	}
	if strings.TrimSpace(cfg.TurnstileSecretKey) != "" {
		parsed, err := url.Parse(strings.TrimSpace(cfg.TurnstileVerifyURL))
		if err != nil || parsed.Scheme != "https" || parsed.Host == "" {
			return Config{}, fmt.Errorf("TURNSTILE_VERIFY_URL must be a valid https url when TURNSTILE_SECRET_KEY is set")
		}
	}

	return cfg, nil
}

func splitCSV(value string) []string {
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func getEnv(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func getEnvInt(key string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.Atoi(value)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	return parsed, nil
}

func getEnvFloat(key string, fallback float64) (float64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	return parsed, nil
}

func getEnvInt64(key string, fallback int64) (int64, error) {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback, nil
	}

	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", key, err)
	}
	return parsed, nil
}

func getEnvBool(key string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(os.Getenv(key)))
	switch value {
	case "1", "true", "yes", "on":
		return true
	case "0", "false", "no", "off":
		return false
	default:
		return fallback
	}
}

func validateOrigin(origin string, isDevelopment bool) error {
	normalized := strings.TrimSpace(origin)
	if normalized == "" {
		return fmt.Errorf("origin cannot be empty")
	}

	lowered := strings.ToLower(normalized)
	if lowered == "*" {
		return fmt.Errorf("wildcard origin is not allowed")
	}
	if lowered == "null" {
		return fmt.Errorf("'null' origin is not allowed")
	}
	if strings.Contains(normalized, "*") {
		return fmt.Errorf("wildcard origin patterns are not allowed")
	}

	parsed, err := url.Parse(normalized)
	if err != nil {
		return fmt.Errorf("invalid origin format")
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return fmt.Errorf("origin must include scheme and host")
	}

	switch strings.ToLower(parsed.Scheme) {
	case "https", "http", "tauri", "app":
		if !isDevelopment && strings.EqualFold(parsed.Scheme, "http") {
			host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
			if !isLoopbackHost(host) {
				return fmt.Errorf("http origin is only allowed for loopback hosts in production")
			}
		}
		return nil
	default:
		return fmt.Errorf("origin scheme is not allowed")
	}
}

func isLoopbackHost(host string) bool {
	switch host {
	case "localhost", "127.0.0.1", "::1":
		return true
	default:
		if strings.HasSuffix(host, ".localhost") {
			return true
		}
		if ip, err := netip.ParseAddr(host); err == nil && ip.IsLoopback() {
			return true
		}
		return false
	}
}

func isWeakSecret(value string, disallowed ...string) bool {
	normalized := strings.ToLower(strings.TrimSpace(value))
	if normalized == "" {
		return true
	}

	for _, banned := range disallowed {
		if normalized == strings.ToLower(strings.TrimSpace(banned)) {
			return true
		}
	}

	if strings.Contains(normalized, "replace-with-strong") {
		return true
	}
	if strings.Contains(normalized, "change_this") || strings.Contains(normalized, "changeme") || strings.Contains(normalized, "change-me") {
		return true
	}
	return false
}

func subtleConstantTimeEqual(left, right string) bool {
	if len(left) != len(right) {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}
