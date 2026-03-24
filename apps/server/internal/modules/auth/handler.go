package auth

import (
	"errors"
	"log"
	"net/url"
	"net/http"
	"strconv"
	"strings"
	"time"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/validation"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service                     *Service
	turnstile                   *security.TurnstileVerifier
	attempts                    *AttemptGuard
	allowDesktopTurnstileBypass bool
}

func NewHandler(service *Service, turnstile *security.TurnstileVerifier, allowDesktopTurnstileBypass bool) *Handler {
	return &Handler{
		service:                     service,
		turnstile:                   turnstile,
		attempts:                    NewAttemptGuard(),
		allowDesktopTurnstileBypass: allowDesktopTurnstileBypass,
	}
}

func (h *Handler) Routes(r chi.Router, authMiddleware func(http.Handler) http.Handler) {
	registerLimiter := middleware.NewIPRateLimiter(0.2, 5, 10*time.Minute)
	loginLimiter := middleware.NewIPRateLimiter(0.4, 8, 10*time.Minute)
	refreshLimiter := middleware.NewIPRateLimiter(0.5, 10, 10*time.Minute)
	logoutLimiter := middleware.NewIPRateLimiter(0.5, 10, 10*time.Minute)

	r.Route("/auth", func(r chi.Router) {
		r.With(registerLimiter.Middleware).Post("/register", h.Register)
		r.With(loginLimiter.Middleware).Post("/login", h.Login)
		r.With(logoutLimiter.Middleware).Post("/logout", h.Logout)
		r.With(refreshLimiter.Middleware).Post("/refresh", h.Refresh)
		r.With(authMiddleware).Post("/change-password", h.ChangePassword)
	})
}

func (h *Handler) Register(w http.ResponseWriter, r *http.Request) {
	clientIP := middleware.ClientIP(r)

	var req registerRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if errs := validation.ValidateRegister(req.Email, req.Username, req.Password); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}
	if !h.verifyTurnstile(w, r, req.TurnstileToken, "register", req.DesktopClient) {
		return
	}

	resp, err := h.service.Register(r.Context(), registerInput{
		Email:     req.Email,
		Username:  req.Username,
		Password:  req.Password,
		IP:        clientIP,
		UserAgent: r.UserAgent(),
	})
	if err != nil {
		switch err {
		case ErrConflict:
			log.Printf("security_event=auth_register_conflict ip=%s", clientIP)
			httpx.Error(w, http.StatusConflict, "email or username already in use")
		default:
			log.Printf("security_event=auth_register_error ip=%s err=%v", clientIP, err)
			log.Printf("auth register failed: %v", err)
			httpx.Error(w, http.StatusInternalServerError, "failed to register")
		}
		return
	}

	log.Printf("security_event=auth_register_success user_id=%s ip=%s", resp.User.ID, clientIP)
	httpx.JSON(w, http.StatusCreated, resp)
}

func (h *Handler) Login(w http.ResponseWriter, r *http.Request) {
	clientIP := middleware.ClientIP(r)

	var req loginRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if errs := validation.ValidateLogin(req.EmailOrUsername, req.Password); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}
	identifier := strings.ToLower(strings.TrimSpace(req.EmailOrUsername))
	if allowed, retryAfter := h.attempts.Allow(clientIP, identifier); !allowed {
		w.Header().Set("Retry-After", strconv.Itoa(maxRetryAfterSeconds(retryAfter)))
		log.Printf("security_event=auth_login_throttled ip=%s identifier=%s retry_after=%s", clientIP, identifier, retryAfter.Round(time.Second))
		httpx.Error(w, http.StatusTooManyRequests, "too many login attempts, please try again later")
		return
	}
	if !h.verifyTurnstile(w, r, req.TurnstileToken, "login", req.DesktopClient) {
		return
	}

	resp, err := h.service.Login(r.Context(), loginInput{
		EmailOrUsername: req.EmailOrUsername,
		Password:        req.Password,
		IP:              clientIP,
		UserAgent:       r.UserAgent(),
	})
	if err != nil {
		switch err {
		case ErrInvalidCredentials:
			h.attempts.Fail(clientIP, identifier)
			log.Printf("security_event=auth_login_invalid ip=%s", clientIP)
			httpx.Error(w, http.StatusUnauthorized, "invalid credentials")
		default:
			log.Printf("security_event=auth_login_error ip=%s err=%v", clientIP, err)
			log.Printf("auth login failed: %v", err)
			httpx.Error(w, http.StatusInternalServerError, "failed to login")
		}
		return
	}

	h.attempts.Success(clientIP, identifier)
	log.Printf("security_event=auth_login_success user_id=%s ip=%s", resp.User.ID, clientIP)
	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handler) Logout(w http.ResponseWriter, r *http.Request) {
	clientIP := middleware.ClientIP(r)

	var req logoutRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.RefreshToken == "" {
		httpx.ValidationError(w, map[string]string{"refreshToken": "required"})
		return
	}

	if err := h.service.Logout(r.Context(), req.RefreshToken); err != nil {
		switch err {
		case ErrTokenInvalid:
			log.Printf("security_event=auth_logout_invalid_token ip=%s", clientIP)
			httpx.Error(w, http.StatusUnauthorized, "invalid refresh token")
		default:
			log.Printf("security_event=auth_logout_error ip=%s err=%v", clientIP, err)
			log.Printf("auth logout failed: %v", err)
			httpx.Error(w, http.StatusInternalServerError, "failed to logout")
		}
		return
	}

	log.Printf("security_event=auth_logout_success ip=%s", clientIP)
	httpx.JSON(w, http.StatusOK, statusResponse{Status: "logged_out"})
}

func (h *Handler) Refresh(w http.ResponseWriter, r *http.Request) {
	clientIP := middleware.ClientIP(r)

	var req refreshRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.RefreshToken == "" {
		httpx.ValidationError(w, map[string]string{"refreshToken": "required"})
		return
	}

	tokens, err := h.service.Refresh(r.Context(), req.RefreshToken, clientIP, r.UserAgent())
	if err != nil {
		switch err {
		case ErrTokenInvalid:
			log.Printf("security_event=auth_refresh_invalid_token ip=%s", clientIP)
			httpx.Error(w, http.StatusUnauthorized, "invalid refresh token")
		default:
			log.Printf("security_event=auth_refresh_error ip=%s err=%v", clientIP, err)
			log.Printf("auth refresh failed: %v", err)
			httpx.Error(w, http.StatusInternalServerError, "failed to refresh token")
		}
		return
	}

	log.Printf("security_event=auth_refresh_success ip=%s", clientIP)
	httpx.JSON(w, http.StatusOK, map[string]tokensDTO{"tokens": tokens})
}

func (h *Handler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req changePasswordRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if strings.TrimSpace(req.CurrentPassword) == "" {
		httpx.ValidationError(w, map[string]string{"currentPassword": "required"})
		return
	}
	if req.CurrentPassword == req.NewPassword {
		httpx.ValidationError(w, map[string]string{"newPassword": "must be different from currentPassword"})
		return
	}
	if !validation.IsStrongPassword(req.NewPassword) {
		httpx.ValidationError(w, map[string]string{"newPassword": "password must be at least 8 chars and include upper, lower and digit"})
		return
	}

	if err := h.service.ChangePassword(r.Context(), userID, req.CurrentPassword, req.NewPassword); err != nil {
		switch err {
		case ErrInvalidCredentials:
			log.Printf("security_event=auth_change_password_invalid_current user_id=%s", userID)
			httpx.Error(w, http.StatusUnauthorized, "current password is invalid")
		case ErrNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			log.Printf("security_event=auth_change_password_error user_id=%s err=%v", userID, err)
			log.Printf("auth change password failed: %v", err)
			httpx.Error(w, http.StatusInternalServerError, "failed to update password")
		}
		return
	}

	log.Printf("security_event=auth_change_password_success user_id=%s", userID)
	httpx.JSON(w, http.StatusOK, statusResponse{Status: "password_updated"})
}

func (h *Handler) verifyTurnstile(w http.ResponseWriter, r *http.Request, token, flow string, desktopClient bool) bool {
	if h.turnstile == nil || !h.turnstile.Enabled() {
		return true
	}
	if h.allowDesktopTurnstileBypass {
		if desktopClient {
			clientIP := middleware.ClientIP(r)
			log.Printf("security_event=turnstile_bypass flow=%s ip=%s reason=desktop_payload", flow, clientIP)
			return true
		}

		allowed, reason := isDesktopTurnstileBypassRequest(r)
		if allowed {
			clientIP := middleware.ClientIP(r)
			log.Printf("security_event=turnstile_bypass flow=%s ip=%s reason=%s", flow, clientIP, reason)
			return true
		}
	}

	clientIP := middleware.ClientIP(r)
	if err := h.turnstile.Verify(r.Context(), token, clientIP); err != nil {
		if errors.Is(err, security.ErrTurnstileRequired) {
			log.Printf("security_event=turnstile_missing flow=%s ip=%s", flow, clientIP)
			httpx.ValidationError(w, map[string]string{"turnstileToken": "required"})
			return false
		}
		log.Printf("security_event=turnstile_failed flow=%s ip=%s err=%v", flow, clientIP, err)
		httpx.Error(w, http.StatusForbidden, "captcha verification failed")
		return false
	}

	return true
}

func isDesktopTurnstileBypassRequest(r *http.Request) (bool, string) {
	headerValue := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Catwa-Desktop")))
	if headerValue != "1" && headerValue != "true" && headerValue != "yes" && headerValue != "on" {
		return false, "missing_header"
	}

	userAgent := strings.ToLower(strings.TrimSpace(r.UserAgent()))
	if strings.Contains(userAgent, "catwa desktop") || strings.Contains(userAgent, "catwadesktop") || strings.Contains(userAgent, "electron") {
		return true, "desktop_header_user_agent"
	}

	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if isTrustedDesktopOrigin(origin) {
		return true, "desktop_header_origin"
	}

	referer := strings.TrimSpace(r.Header.Get("Referer"))
	if isTrustedDesktopOrigin(referer) {
		return true, "desktop_header_referer"
	}

	if origin == "" && referer == "" && userAgent == "" {
		return true, "desktop_header_empty_client_metadata"
	}

	if origin == "" && referer == "" {
		return true, "desktop_header_no_origin"
	}

	return false, "desktop_header_untrusted_origin"
}

func isTrustedDesktopOrigin(rawValue string) bool {
	if strings.TrimSpace(rawValue) == "" {
		return false
	}

	parsed, err := url.Parse(rawValue)
	if err != nil {
		return false
	}

	host := strings.ToLower(strings.TrimSpace(parsed.Hostname()))
	return host == "catwa.chat" || host == "www.catwa.chat"
}

func maxRetryAfterSeconds(value time.Duration) int {
	seconds := int(value.Round(time.Second).Seconds())
	if seconds < 1 {
		return 1
	}
	return seconds
}
