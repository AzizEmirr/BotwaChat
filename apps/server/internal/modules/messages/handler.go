package messages

import (
	"net/http"
	"strconv"
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
	sendLimiter := middleware.NewIPRateLimiter(5, 20, 5*time.Minute)
	r.With(authMiddleware, sendLimiter.Middleware).Post("/messages", h.Send)
	r.With(authMiddleware).Get("/messages", h.List)
	r.With(authMiddleware).Get("/messages/state", h.ListState)
	r.With(authMiddleware).Patch("/messages/{messageId}", h.Update)
	r.With(authMiddleware).Delete("/messages/{messageId}", h.Delete)
	r.With(authMiddleware).Post("/messages/{messageId}/pin/toggle", h.TogglePin)
	r.With(authMiddleware).Post("/messages/{messageId}/reactions/toggle", h.ToggleReaction)
}

func (h *Handler) Send(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req sendMessageRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.ConversationType != "channel" && req.ConversationType != "dm" {
		httpx.ValidationError(w, map[string]string{"conversationType": "must be channel or dm"})
		return
	}
	if !validation.IsUUID(req.ConversationID) {
		httpx.ValidationError(w, map[string]string{"conversationId": "invalid uuid"})
		return
	}
	if errs := validation.ValidateMessageContent(req.Content); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}

	message, err := h.service.Create(r.Context(), userID, req)
	if err != nil {
		switch err {
		case ErrConversationNotFound:
			httpx.Error(w, http.StatusNotFound, "conversation not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a conversation participant")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to send message")
		}
		return
	}

	httpx.JSON(w, http.StatusCreated, message)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	conversationType := strings.TrimSpace(r.URL.Query().Get("conversation_type"))
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	if conversationType != "channel" && conversationType != "dm" {
		httpx.ValidationError(w, map[string]string{"conversation_type": "must be channel or dm"})
		return
	}
	if !validation.IsUUID(conversationID) {
		httpx.ValidationError(w, map[string]string{"conversation_id": "invalid uuid"})
		return
	}

	limit := 50
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

	var before *time.Time
	if value := strings.TrimSpace(r.URL.Query().Get("before")); value != "" {
		parsed, err := time.Parse(time.RFC3339, value)
		if err != nil {
			httpx.ValidationError(w, map[string]string{"before": "must be RFC3339 timestamp"})
			return
		}
		before = &parsed
	}

	items, err := h.service.List(r.Context(), userID, conversationType, conversationID, before, limit)
	if err != nil {
		switch err {
		case ErrConversationNotFound:
			httpx.Error(w, http.StatusNotFound, "conversation not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a conversation participant")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to get messages")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, listMessagesResponse{Messages: items})
}

func (h *Handler) ListState(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	conversationType := strings.TrimSpace(r.URL.Query().Get("conversation_type"))
	conversationID := strings.TrimSpace(r.URL.Query().Get("conversation_id"))
	if conversationType != "channel" && conversationType != "dm" {
		httpx.ValidationError(w, map[string]string{"conversation_type": "must be channel or dm"})
		return
	}
	if !validation.IsUUID(conversationID) {
		httpx.ValidationError(w, map[string]string{"conversation_id": "invalid uuid"})
		return
	}

	state, err := h.service.ListState(r.Context(), userID, conversationType, conversationID)
	if err != nil {
		switch err {
		case ErrConversationNotFound:
			httpx.Error(w, http.StatusNotFound, "conversation not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a conversation participant")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to get message state")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, state)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	messageID := strings.TrimSpace(chi.URLParam(r, "messageId"))
	if !validation.IsUUID(messageID) {
		httpx.ValidationError(w, map[string]string{"messageId": "invalid uuid"})
		return
	}

	var req updateMessageRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if errs := validation.ValidateMessageContent(req.Content); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}

	message, err := h.service.Update(r.Context(), userID, messageID, req)
	if err != nil {
		switch err {
		case ErrMessageNotFound:
			httpx.Error(w, http.StatusNotFound, "message not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not allowed to edit message")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update message")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, message)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	messageID := strings.TrimSpace(chi.URLParam(r, "messageId"))
	if !validation.IsUUID(messageID) {
		httpx.ValidationError(w, map[string]string{"messageId": "invalid uuid"})
		return
	}

	message, err := h.service.Delete(r.Context(), userID, messageID)
	if err != nil {
		switch err {
		case ErrMessageNotFound:
			httpx.Error(w, http.StatusNotFound, "message not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not allowed to delete message")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to delete message")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, message)
}

func (h *Handler) TogglePin(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	messageID := strings.TrimSpace(chi.URLParam(r, "messageId"))
	if !validation.IsUUID(messageID) {
		httpx.ValidationError(w, map[string]string{"messageId": "invalid uuid"})
		return
	}

	state, err := h.service.TogglePin(r.Context(), userID, messageID)
	if err != nil {
		switch err {
		case ErrMessageNotFound:
			httpx.Error(w, http.StatusNotFound, "message not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a conversation participant")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to toggle pin")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, state)
}

func (h *Handler) ToggleReaction(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	messageID := strings.TrimSpace(chi.URLParam(r, "messageId"))
	if !validation.IsUUID(messageID) {
		httpx.ValidationError(w, map[string]string{"messageId": "invalid uuid"})
		return
	}

	var req toggleMessageReactionRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	if strings.TrimSpace(req.Emoji) == "" {
		httpx.ValidationError(w, map[string]string{"emoji": "required"})
		return
	}

	state, err := h.service.ToggleReaction(r.Context(), userID, messageID, req.Emoji)
	if err != nil {
		switch err {
		case ErrMessageNotFound:
			httpx.Error(w, http.StatusNotFound, "message not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a conversation participant")
		case ErrInvalidEmoji:
			httpx.ValidationError(w, map[string]string{"emoji": "invalid emoji"})
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to toggle reaction")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, state)
}
