package dms

import (
	"net/http"
	"strings"
	"time"

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
	createLimiter := middleware.NewIPRateLimiter(1, 8, 5*time.Minute)
	r.With(authMiddleware, createLimiter.Middleware).Post("/dms", h.Create)
	r.With(authMiddleware).Get("/dms", h.List)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	items, err := h.service.List(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to fetch dm list")
		return
	}

	httpx.JSON(w, http.StatusOK, listResponse{Conversations: items})
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createConversationRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	if !validation.IsUUID(req.UserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}

	resp, err := h.service.Create(r.Context(), userID, req.UserID)
	if err != nil {
		switch err {
		case ErrInvalidParticipant:
			httpx.Error(w, http.StatusBadRequest, "cannot create dm with self")
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create dm")
		}
		return
	}

	if resp.Created {
		httpx.JSON(w, http.StatusCreated, resp)
		return
	}
	httpx.JSON(w, http.StatusOK, resp)
}
