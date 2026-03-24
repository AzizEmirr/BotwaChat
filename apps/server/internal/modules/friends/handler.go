package friends

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
	requestLimiter := middleware.NewIPRateLimiter(1, 8, 5*time.Minute)
	blockLimiter := middleware.NewIPRateLimiter(1, 6, 5*time.Minute)

	r.With(authMiddleware).Get("/friends", h.ListFriends)
	r.With(authMiddleware).Get("/friends/", h.ListFriends)
	r.With(authMiddleware).Delete("/friends/{userId}", h.RemoveFriend)
	r.With(authMiddleware).Get("/friends/privacy", h.GetPrivacySettings)
	r.With(authMiddleware).Patch("/friends/privacy", h.UpdatePrivacySettings)
	r.With(authMiddleware).Get("/friends/blocked", h.ListBlockedUsers)
	r.With(authMiddleware, blockLimiter.Middleware).Post("/friends/blocked", h.BlockUser)
	r.With(authMiddleware).Delete("/friends/blocked/{userId}", h.UnblockUser)
	r.With(authMiddleware).Get("/friends/requests", h.ListRequests)
	r.With(authMiddleware, requestLimiter.Middleware).Post("/friends/requests", h.SendRequest)
	r.With(authMiddleware).Post("/friends/requests/{requestId}/accept", h.AcceptRequest)
	r.With(authMiddleware).Post("/friends/requests/{requestId}/reject", h.RejectRequest)
}

func (h *Handler) ListFriends(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	friends, err := h.service.ListFriends(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list friends")
		return
	}

	httpx.JSON(w, http.StatusOK, listFriendsResponse{Friends: friends})
}

func (h *Handler) RemoveFriend(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	friendUserID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if !validation.IsUUID(friendUserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}

	if err := h.service.RemoveFriend(r.Context(), userID, friendUserID); err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid friend target")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to remove friend")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, actionResponse{Status: "friend_removed"})
}

func (h *Handler) ListRequests(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	incoming, outgoing, err := h.service.ListRequests(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list friend requests")
		return
	}

	httpx.JSON(w, http.StatusOK, listRequestsResponse{
		Incoming: incoming,
		Outgoing: outgoing,
	})
}

func (h *Handler) SendRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req sendRequestBody
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	if !validation.IsUUID(req.UserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}

	resp, err := h.service.SendRequest(r.Context(), userID, req.UserID)
	if err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid friend target")
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		case ErrAlreadyFriends:
			httpx.Error(w, http.StatusConflict, "already friends")
		case ErrRequestBlocked:
			httpx.Error(w, http.StatusForbidden, "friend request blocked")
		case ErrRequestPrivacyRejected:
			httpx.Error(w, http.StatusForbidden, "friend request privacy settings do not allow this request")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create friend request")
		}
		return
	}

	if resp.AutoAccepted {
		httpx.JSON(w, http.StatusOK, resp)
		return
	}
	if resp.Created {
		httpx.JSON(w, http.StatusCreated, resp)
		return
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handler) AcceptRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	requestID := strings.TrimSpace(chi.URLParam(r, "requestId"))
	if !validation.IsUUID(requestID) {
		httpx.ValidationError(w, map[string]string{"requestId": "invalid uuid"})
		return
	}

	friend, err := h.service.AcceptRequest(r.Context(), userID, requestID)
	if err != nil {
		switch err {
		case ErrRequestNotFound:
			httpx.Error(w, http.StatusNotFound, "friend request not found")
		case ErrRequestForbidden:
			httpx.Error(w, http.StatusForbidden, "cannot accept this request")
		case ErrRequestNotPending:
			httpx.Error(w, http.StatusConflict, "friend request is not pending")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to accept friend request")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, map[string]interface{}{
		"status": "accepted",
		"friend": friend,
	})
}

func (h *Handler) RejectRequest(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	requestID := strings.TrimSpace(chi.URLParam(r, "requestId"))
	if !validation.IsUUID(requestID) {
		httpx.ValidationError(w, map[string]string{"requestId": "invalid uuid"})
		return
	}

	if err := h.service.RejectRequest(r.Context(), userID, requestID); err != nil {
		switch err {
		case ErrRequestNotFound:
			httpx.Error(w, http.StatusNotFound, "friend request not found")
		case ErrRequestForbidden:
			httpx.Error(w, http.StatusForbidden, "cannot reject this request")
		case ErrRequestNotPending:
			httpx.Error(w, http.StatusConflict, "friend request is not pending")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to reject friend request")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, actionResponse{Status: "updated"})
}

func (h *Handler) GetPrivacySettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	settings, err := h.service.GetFriendPrivacySettings(r.Context(), userID)
	if err != nil {
		switch err {
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to load privacy settings")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, listFriendPrivacyResponse{Settings: settings})
}

func (h *Handler) UpdatePrivacySettings(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req updateFriendPrivacyBody
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	settings, err := h.service.UpdateFriendPrivacySettings(r.Context(), userID, updateFriendPrivacyInput{
		AllowEveryone:        req.AllowEveryone,
		AllowFriendsOfFriend: req.AllowFriendsOfFriend,
		AllowServerMembers:   req.AllowServerMembers,
	})
	if err != nil {
		switch err {
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update privacy settings")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, listFriendPrivacyResponse{Settings: settings})
}

func (h *Handler) ListBlockedUsers(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blocked, err := h.service.ListBlockedUsers(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list blocked users")
		return
	}

	httpx.JSON(w, http.StatusOK, listBlockedUsersResponse{Blocked: blocked})
}

func (h *Handler) BlockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req blockUserBody
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	if !validation.IsUUID(req.UserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}

	blocked, err := h.service.BlockUser(r.Context(), userID, req.UserID)
	if err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid blocked user target")
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to block user")
		}
		return
	}

	httpx.JSON(w, http.StatusCreated, map[string]interface{}{
		"status":  "blocked",
		"blocked": blocked,
	})
}

func (h *Handler) UnblockUser(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	blockedUserID := strings.TrimSpace(chi.URLParam(r, "userId"))
	if !validation.IsUUID(blockedUserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}

	if err := h.service.UnblockUser(r.Context(), userID, blockedUserID); err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid blocked user target")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to unblock user")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, actionResponse{Status: "unblocked"})
}
