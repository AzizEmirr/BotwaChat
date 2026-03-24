package channels

import (
	"net/http"
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
	r.With(authMiddleware).Post("/channels", h.Create)
	r.With(authMiddleware).Get("/channels", h.List)
	r.With(authMiddleware).Patch("/channels/{channelId}", h.Update)
	r.With(authMiddleware).Delete("/channels/{channelId}", h.Delete)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createChannelRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.ServerID = strings.TrimSpace(req.ServerID)
	req.Name = strings.TrimSpace(req.Name)
	req.Kind = strings.TrimSpace(req.Kind)

	if !validation.IsUUID(req.ServerID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	if errs := validation.ValidateChannel(req.Name, req.Kind); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}

	channel, err := h.service.Create(r.Context(), userID, req)
	if err != nil {
		switch err {
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrConflict:
			httpx.Error(w, http.StatusConflict, "channel name already exists in server")
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create channel")
		}
		return
	}

	httpx.JSON(w, http.StatusCreated, channel)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(r.URL.Query().Get("server_id"))
	kind := strings.TrimSpace(r.URL.Query().Get("kind"))
	validationErrors := map[string]string{}

	if !validation.IsUUID(serverID) {
		validationErrors["server_id"] = "invalid uuid"
	}
	if kind != "" {
		switch kind {
		case "text", "announcement":
		default:
			validationErrors["kind"] = "kind must be text or announcement"
		}
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	items, err := h.service.ListByServer(r.Context(), userID, serverID, kind)
	if err != nil {
		switch err {
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a server member")
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to list channels")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, listChannelsResponse{Channels: items})
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID := strings.TrimSpace(chi.URLParam(r, "channelId"))
	if !validation.IsUUID(channelID) {
		httpx.ValidationError(w, map[string]string{"channelId": "invalid uuid"})
		return
	}

	var req updateChannelRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	validationErrors := map[string]string{}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if errs := validation.ValidateChannel(name, "text"); len(errs) > 0 {
			if message, ok := errs["name"]; ok {
				validationErrors["name"] = message
			}
		}
	}
	if req.Kind != nil {
		kind := strings.TrimSpace(*req.Kind)
		if errs := validation.ValidateChannel("ab", kind); len(errs) > 0 {
			if message, ok := errs["kind"]; ok {
				validationErrors["kind"] = message
			}
		}
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	updated, err := h.service.Update(r.Context(), userID, channelID, req)
	if err != nil {
		switch err {
		case ErrChannelNotFound:
			httpx.Error(w, http.StatusNotFound, "channel not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrConflict:
			httpx.Error(w, http.StatusConflict, "channel name already exists in server")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update channel")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	channelID := strings.TrimSpace(chi.URLParam(r, "channelId"))
	if !validation.IsUUID(channelID) {
		httpx.ValidationError(w, map[string]string{"channelId": "invalid uuid"})
		return
	}

	deleted, err := h.service.Delete(r.Context(), userID, channelID)
	if err != nil {
		switch err {
		case ErrChannelNotFound:
			httpx.Error(w, http.StatusNotFound, "channel not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to delete channel")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, deleted)
}
