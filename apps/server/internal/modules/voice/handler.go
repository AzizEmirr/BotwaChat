package voice

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
	r.Route("/voice", func(r chi.Router) {
		r.With(authMiddleware).Get("/channels", h.ListChannels)
		r.With(authMiddleware).Post("/channels", h.CreateChannel)
		r.With(authMiddleware).Patch("/channels/{channelId}", h.UpdateChannel)
		r.With(authMiddleware).Delete("/channels/{channelId}", h.DeleteChannel)
	})
}

func (h *Handler) ListChannels(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	if workspaceID != "" && !validation.IsUUID(workspaceID) {
		httpx.ValidationError(w, map[string]string{"workspace_id": "invalid uuid"})
		return
	}

	resp, err := h.service.ListChannels(r.Context(), userID, workspaceID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list voice channels")
		return
	}

	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handler) CreateChannel(w http.ResponseWriter, r *http.Request) {
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

	req.WorkspaceID = strings.TrimSpace(req.WorkspaceID)
	req.Name = strings.TrimSpace(req.Name)

	validationErrors := map[string]string{}
	if !validation.IsUUID(req.WorkspaceID) {
		validationErrors["workspaceId"] = "invalid uuid"
	}
	if len(req.Name) < 2 || len(req.Name) > 64 {
		validationErrors["name"] = "name must be between 2 and 64 characters"
	}
	if req.MaxParticipants != nil {
		if *req.MaxParticipants <= 0 || *req.MaxParticipants > 100 {
			validationErrors["maxParticipants"] = "maxParticipants must be between 1 and 100"
		}
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	created, err := h.service.CreateChannel(r.Context(), userID, req)
	if err != nil {
		switch err {
		case ErrVoiceForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrVoiceConflict:
			httpx.Error(w, http.StatusConflict, "voice channel name already exists in workspace")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create voice channel")
		}
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

func (h *Handler) UpdateChannel(w http.ResponseWriter, r *http.Request) {
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
		if len(name) < 2 || len(name) > 64 {
			validationErrors["name"] = "name must be between 2 and 64 characters"
		}
	}
	if req.MaxParticipants != nil {
		if *req.MaxParticipants <= 0 || *req.MaxParticipants > 100 {
			validationErrors["maxParticipants"] = "maxParticipants must be between 1 and 100"
		}
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	updated, err := h.service.UpdateChannel(r.Context(), userID, channelID, req)
	if err != nil {
		switch err {
		case ErrVoiceForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrVoiceChannelNotFound:
			httpx.Error(w, http.StatusNotFound, "voice channel not found")
		case ErrVoiceConflict:
			httpx.Error(w, http.StatusConflict, "voice channel name already exists in workspace")
		case ErrVoiceCapacityReached:
			httpx.Error(w, http.StatusBadRequest, "maxParticipants cannot be lower than active participants")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update voice channel")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, updated)
}

func (h *Handler) DeleteChannel(w http.ResponseWriter, r *http.Request) {
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

	deleted, err := h.service.DeleteChannel(r.Context(), userID, channelID)
	if err != nil {
		switch err {
		case ErrVoiceForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrVoiceChannelNotFound:
			httpx.Error(w, http.StatusNotFound, "voice channel not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to delete voice channel")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, deleted)
}
