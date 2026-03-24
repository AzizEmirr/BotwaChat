package notifications

import (
	"net/http"
	"strconv"
	"strings"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Routes(r chi.Router, authMiddleware func(http.Handler) http.Handler) {
	r.With(authMiddleware).Get("/notifications", h.List)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	limit := 20
	if value := strings.TrimSpace(r.URL.Query().Get("limit")); value != "" {
		parsed, err := strconv.Atoi(value)
		if err != nil || parsed <= 0 {
			httpx.ValidationError(w, map[string]string{"limit": "must be a positive integer"})
			return
		}
		if parsed > 100 {
			parsed = 100
		}
		limit = parsed
	}

	items, err := h.service.List(r.Context(), userID, limit)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list notifications")
		return
	}

	httpx.JSON(w, http.StatusOK, listResponse{Notifications: items})
}
