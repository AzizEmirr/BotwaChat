package servers

import (
	"errors"
	"log"
	"net/http"
	"strings"
	"time"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/validation"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service                *Service
	turnstile              *security.TurnstileVerifier
	enforceInviteTurnstile bool
}

func NewHandler(service *Service, turnstile *security.TurnstileVerifier, enforceInviteTurnstile bool) *Handler {
	return &Handler{
		service:                service,
		turnstile:              turnstile,
		enforceInviteTurnstile: enforceInviteTurnstile,
	}
}

func (h *Handler) Routes(r chi.Router, authMiddleware func(http.Handler) http.Handler) {
	inviteLimiter := middleware.NewIPRateLimiter(1, 6, 5*time.Minute)
	moderationLimiter := middleware.NewIPRateLimiter(1, 8, 5*time.Minute)

	r.With(authMiddleware).Get("/servers", h.List)
	r.With(authMiddleware).Post("/servers", h.Create)
	r.With(authMiddleware).Get("/servers/invites", h.ListInvites)
	r.With(authMiddleware).Post("/servers/invites/{inviteId}/accept", h.AcceptInvite)
	r.With(authMiddleware).Post("/servers/invites/{inviteId}/reject", h.RejectInvite)
	r.With(authMiddleware).Get("/servers/{serverId}", h.GetByID)
	r.With(authMiddleware).Patch("/servers/{serverId}", h.Update)
	r.With(authMiddleware).Delete("/servers/{serverId}", h.Delete)
	r.With(authMiddleware).Get("/servers/{serverId}/members", h.ListMembers)
	r.With(authMiddleware, inviteLimiter.Middleware).Post("/servers/{serverId}/members", h.InviteMember)
	r.With(authMiddleware, moderationLimiter.Middleware).Patch("/servers/{serverId}/members/{memberId}", h.UpdateMemberRole)
	r.With(authMiddleware, moderationLimiter.Middleware).Delete("/servers/{serverId}/members/{memberId}", h.RemoveMember)
	r.With(authMiddleware).Post("/servers/{serverId}/leave", h.Leave)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	items, err := h.service.ListByMember(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list servers")
		return
	}

	httpx.JSON(w, http.StatusOK, listServersResponse{Servers: items})
}

func (h *Handler) GetByID(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	server, err := h.service.GetByMember(r.Context(), userID, serverID)
	if err != nil {
		switch err {
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a server member")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to get server")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, server)
}

func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var req createServerRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if errs := validation.ValidateServerName(req.Name); len(errs) > 0 {
		httpx.ValidationError(w, errs)
		return
	}

	created, err := h.service.Create(r.Context(), userID, req.Name)
	if err != nil {
		switch err {
		case ErrConflict:
			httpx.Error(w, http.StatusConflict, "server name already exists for owner")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to create server")
		}
		return
	}

	httpx.JSON(w, http.StatusCreated, created)
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	var req updateServerRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	if req.Name != nil {
		if errs := validation.ValidateServerName(*req.Name); len(errs) > 0 {
			httpx.ValidationError(w, errs)
			return
		}
	}

	updated, err := h.service.Update(r.Context(), userID, serverID, req)
	if err != nil {
		switch err {
		case ErrConflict:
			httpx.Error(w, http.StatusConflict, "server name already exists for owner")
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update server")
		}
		return
	}

	log.Printf("security_event=server_update actor_user_id=%s server_id=%s", userID, serverID)
	httpx.JSON(w, http.StatusOK, updated)
}

func (h *Handler) ListMembers(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	members, err := h.service.ListMembers(r.Context(), userID, serverID)
	if err != nil {
		switch err {
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a server member")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to list members")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, listMembersResponse{Members: members})
}

func (h *Handler) InviteMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	var req inviteMemberRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	req.UserID = strings.TrimSpace(req.UserID)
	if !validation.IsUUID(req.UserID) {
		httpx.ValidationError(w, map[string]string{"userId": "invalid uuid"})
		return
	}
	if !h.verifyTurnstile(w, r, req.TurnstileToken, "server_invite", h.enforceInviteTurnstile) {
		return
	}

	resp, err := h.service.InviteMember(r.Context(), userID, serverID, req.UserID)
	if err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid invite target")
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrUserNotFound:
			httpx.Error(w, http.StatusNotFound, "user not found")
		case ErrAlreadyMember:
			httpx.Error(w, http.StatusConflict, "user already a server member")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to invite member")
		}
		return
	}

	log.Printf(
		"security_event=server_invite actor_user_id=%s server_id=%s target_user_id=%s created=%t",
		userID,
		serverID,
		req.UserID,
		resp.Created,
	)

	if resp.Created {
		httpx.JSON(w, http.StatusCreated, resp)
		return
	}
	httpx.JSON(w, http.StatusOK, resp)
}

func (h *Handler) ListInvites(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	invites, err := h.service.ListInvites(r.Context(), userID)
	if err != nil {
		httpx.Error(w, http.StatusInternalServerError, "failed to list server invites")
		return
	}

	httpx.JSON(w, http.StatusOK, listInvitesResponse{Invites: invites})
}

func (h *Handler) AcceptInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	inviteID := strings.TrimSpace(chi.URLParam(r, "inviteId"))
	if !validation.IsUUID(inviteID) {
		httpx.ValidationError(w, map[string]string{"inviteId": "invalid uuid"})
		return
	}

	server, err := h.service.AcceptInvite(r.Context(), userID, inviteID)
	if err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid invite target")
		case ErrInviteNotFound:
			httpx.Error(w, http.StatusNotFound, "invite not found")
		case ErrInviteForbidden:
			httpx.Error(w, http.StatusForbidden, "cannot accept this invite")
		case ErrInviteNotPending:
			httpx.Error(w, http.StatusConflict, "invite is not pending")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to accept invite")
		}
		return
	}

	log.Printf("security_event=server_invite_accept actor_user_id=%s invite_id=%s", userID, inviteID)
	httpx.JSON(w, http.StatusOK, acceptInviteResponse{
		Status: "accepted",
		Server: server,
	})
}

func (h *Handler) RejectInvite(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	inviteID := strings.TrimSpace(chi.URLParam(r, "inviteId"))
	if !validation.IsUUID(inviteID) {
		httpx.ValidationError(w, map[string]string{"inviteId": "invalid uuid"})
		return
	}

	if err := h.service.RejectInvite(r.Context(), userID, inviteID); err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid invite target")
		case ErrInviteNotFound:
			httpx.Error(w, http.StatusNotFound, "invite not found")
		case ErrInviteForbidden:
			httpx.Error(w, http.StatusForbidden, "cannot reject this invite")
		case ErrInviteNotPending:
			httpx.Error(w, http.StatusConflict, "invite is not pending")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to reject invite")
		}
		return
	}

	log.Printf("security_event=server_invite_reject actor_user_id=%s invite_id=%s", userID, inviteID)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "rejected"})
}

func (h *Handler) verifyTurnstile(w http.ResponseWriter, r *http.Request, token, flow string, required bool) bool {
	if h.turnstile == nil || !h.turnstile.Enabled() {
		return true
	}

	token = strings.TrimSpace(token)
	if token == "" && !required {
		return true
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

func (h *Handler) RemoveMember(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	memberID := strings.TrimSpace(chi.URLParam(r, "memberId"))
	validationErrors := map[string]string{}
	if !validation.IsUUID(serverID) {
		validationErrors["serverId"] = "invalid uuid"
	}
	if !validation.IsUUID(memberID) {
		validationErrors["memberId"] = "invalid uuid"
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	if err := h.service.RemoveMember(r.Context(), userID, serverID, memberID); err != nil {
		switch err {
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrMemberNotFound:
			httpx.Error(w, http.StatusNotFound, "member not found")
		case ErrOwnerCannotKick:
			httpx.Error(w, http.StatusBadRequest, "owner cannot be removed")
		case ErrCannotKickSelf:
			httpx.Error(w, http.StatusBadRequest, "cannot remove yourself from this endpoint")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to remove member")
		}
		return
	}

	log.Printf("security_event=server_remove_member actor_user_id=%s server_id=%s target_user_id=%s", userID, serverID, memberID)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) UpdateMemberRole(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	memberID := strings.TrimSpace(chi.URLParam(r, "memberId"))
	validationErrors := map[string]string{}
	if !validation.IsUUID(serverID) {
		validationErrors["serverId"] = "invalid uuid"
	}
	if !validation.IsUUID(memberID) {
		validationErrors["memberId"] = "invalid uuid"
	}
	if len(validationErrors) > 0 {
		httpx.ValidationError(w, validationErrors)
		return
	}

	var req updateMemberRoleRequest
	if err := httpx.DecodeJSON(r, &req, 1<<20); err != nil {
		httpx.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	req.Role = strings.TrimSpace(strings.ToLower(req.Role))
	if req.Role != "admin" && req.Role != "member" {
		httpx.ValidationError(w, map[string]string{"role": "role must be admin or member"})
		return
	}

	updated, err := h.service.UpdateMemberRole(r.Context(), userID, serverID, memberID, req.Role)
	if err != nil {
		switch err {
		case ErrInvalidTarget:
			httpx.Error(w, http.StatusBadRequest, "invalid target")
		case ErrInvalidRole:
			httpx.Error(w, http.StatusBadRequest, "invalid role")
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "insufficient permissions")
		case ErrMemberNotFound:
			httpx.Error(w, http.StatusNotFound, "member not found")
		case ErrOwnerRoleLocked:
			httpx.Error(w, http.StatusBadRequest, "owner role cannot be changed")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to update member role")
		}
		return
	}

	log.Printf(
		"security_event=server_update_member_role actor_user_id=%s server_id=%s target_user_id=%s role=%s",
		userID,
		serverID,
		memberID,
		updated.Role,
	)
	httpx.JSON(w, http.StatusOK, updated)
}

func (h *Handler) Leave(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	if err := h.service.Leave(r.Context(), userID, serverID); err != nil {
		switch err {
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "not a server member")
		case ErrOwnerCannotLeave:
			httpx.Error(w, http.StatusBadRequest, "owner cannot leave server, delete it instead")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to leave server")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, leaveServerResponse{Left: true})
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	serverID := strings.TrimSpace(chi.URLParam(r, "serverId"))
	if !validation.IsUUID(serverID) {
		httpx.ValidationError(w, map[string]string{"serverId": "invalid uuid"})
		return
	}

	if err := h.service.Delete(r.Context(), userID, serverID); err != nil {
		switch err {
		case ErrServerNotFound:
			httpx.Error(w, http.StatusNotFound, "server not found")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "only server owner can delete server")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to delete server")
		}
		return
	}

	log.Printf("security_event=server_delete actor_user_id=%s server_id=%s", userID, serverID)
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
