package users

import (
	"net/http"
	"strconv"
	"strings"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/validation"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Routes(r chi.Router, authMiddleware func(http.Handler) http.Handler) {
	r.Route("/users", func(r chi.Router) {
		r.With(authMiddleware).Get("/me", h.GetMe)
		r.With(authMiddleware).Patch("/me", h.UpdateProfile)
		r.With(authMiddleware).Patch("/me/presence", h.UpdatePresence)
		r.With(authMiddleware).Get("/search", h.Search)
	})
}

func (h *Handler) GetMe(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	profile, err := h.service.GetMe(r.Context(), userID)
	if err != nil {
		switch err {
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to fetch profile")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, profile)
}

func (h *Handler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req updateProfileRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	username := ""
	displayName := ""
	if req.Username != nil {
		username = *req.Username
		if strings.TrimSpace(username) == "" {
			httpx.ValidationError(w, map[string]string{"username": "username cannot be empty"})
			return
		}
	}
	if req.DisplayName != nil {
		displayName = *req.DisplayName
		if strings.TrimSpace(displayName) == "" {
			httpx.ValidationError(w, map[string]string{"displayName": "displayName cannot be empty"})
			return
		}
	}

	if errs := validation.ValidateProfile(username, displayName); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}
	if req.Bio != nil && len(strings.TrimSpace(*req.Bio)) > 500 {
		httpx.ValidationError(w, map[string]string{"bio": "bio must be 500 chars or less"})
		return
	}

	profile, err := h.service.UpdateProfile(r.Context(), userID, req)
	if err != nil {
		switch err {
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		case ErrUserConflict:
			httpx.Error(w, http.StatusConflict, "username already in use")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update profile")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, profile)
}

func (h *Handler) UpdatePresence(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req updatePresenceRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := h.service.UpdatePresence(r.Context(), userID, req.Status); err != nil {
		switch err {
		case ErrInvalidPresenceState:
			httpx.ValidationError(w, map[string]string{"status": "status must be one of online, idle, dnd, invisible or offline"})
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update presence")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, updatePresenceResponse{
		Status: normalizePresenceStatus(req.Status),
	})
}

func (h *Handler) Search(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(query) < 2 {
		httpx.ValidationError(w, map[string]string{"q": "q must be at least 2 characters"})
		return
	}

	limit := 20
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		parsed, err := strconv.Atoi(raw)
		if err != nil || parsed <= 0 {
			httpx.ValidationError(w, map[string]string{"limit": "limit must be a positive integer"})
			return
		}
		if parsed > 50 {
			parsed = 50
		}
		limit = parsed
	}

	items, err := h.service.Search(r.Context(), userID, query, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to search users")
		return
	}

	httpx.JSON(w, http.StatusOK, userSearchResponse{Users: items})
}
