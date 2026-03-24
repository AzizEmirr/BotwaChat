package servers

import (
	"context"
	"errors"
	"fmt"
	"log"
	"strings"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrConflict         = errors.New("server_conflict")
	ErrServerNotFound   = errors.New("server_not_found")
	ErrForbidden        = errors.New("server_forbidden")
	ErrAlreadyMember    = errors.New("server_already_member")
	ErrMemberNotFound   = errors.New("server_member_not_found")
	ErrOwnerCannotLeave = errors.New("owner_cannot_leave")
	ErrOwnerCannotKick  = errors.New("owner_cannot_kick")
	ErrOwnerRoleLocked  = errors.New("owner_role_locked")
	ErrCannotKickSelf   = errors.New("cannot_kick_self")
	ErrUserNotFound     = errors.New("user_not_found")
	ErrInvalidTarget    = errors.New("invalid_target")
	ErrInvalidRole      = errors.New("invalid_role")
	ErrInviteNotFound   = errors.New("server_invite_not_found")
	ErrInviteForbidden  = errors.New("server_invite_forbidden")
	ErrInviteNotPending = errors.New("server_invite_not_pending")
)

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type Service struct {
	db        *database.DB
	publisher EventPublisher
}

func NewService(db *database.DB, publisher EventPublisher) *Service {
	return &Service{
		db:        db,
		publisher: publisher,
	}
}

func (s *Service) ListByMember(ctx context.Context, userID string) ([]serverDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT s.id, s.name, s.owner_id, sm.role, s.created_at, COUNT(sm2.user_id) AS member_count
		FROM servers s
		JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
		JOIN server_members sm2 ON sm2.server_id = s.id
		GROUP BY s.id, s.name, s.owner_id, sm.role, s.created_at
		ORDER BY s.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query servers: %w", err)
	}
	defer rows.Close()

	servers := make([]serverDTO, 0)
	for rows.Next() {
		var item serverDTO
		if err := rows.Scan(&item.ID, &item.Name, &item.OwnerID, &item.Role, &item.CreatedAt, &item.MemberCount); err != nil {
			return nil, fmt.Errorf("scan server: %w", err)
		}
		servers = append(servers, item)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate servers: %w", err)
	}

	return servers, nil
}

func (s *Service) GetByMember(ctx context.Context, userID, serverID string) (serverDTO, error) {
	var item serverDTO
	err := s.db.Pool.QueryRow(ctx, `
		SELECT s.id, s.name, s.owner_id, sm.role, s.created_at, COUNT(sm2.user_id) AS member_count
		FROM servers s
		JOIN server_members sm ON sm.server_id = s.id AND sm.user_id = $1
		JOIN server_members sm2 ON sm2.server_id = s.id
		WHERE s.id = $2
		GROUP BY s.id, s.name, s.owner_id, sm.role, s.created_at
	`, userID, serverID).Scan(&item.ID, &item.Name, &item.OwnerID, &item.Role, &item.CreatedAt, &item.MemberCount)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			exists, checkErr := s.serverExists(ctx, serverID)
			if checkErr != nil {
				return serverDTO{}, checkErr
			}
			if !exists {
				return serverDTO{}, ErrServerNotFound
			}
			return serverDTO{}, ErrForbidden
		}
		return serverDTO{}, fmt.Errorf("get server by member: %w", err)
	}

	return item, nil
}

func (s *Service) Create(ctx context.Context, userID, name string) (serverDTO, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return serverDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var created serverDTO
	err = tx.QueryRow(ctx, `
		INSERT INTO servers (name, owner_id)
		VALUES ($1, $2)
		RETURNING id, name, owner_id, created_at
	`, strings.TrimSpace(name), userID).Scan(
		&created.ID,
		&created.Name,
		&created.OwnerID,
		&created.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return serverDTO{}, ErrConflict
		}
		return serverDTO{}, fmt.Errorf("insert server: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO server_members (server_id, user_id, role)
		VALUES ($1, $2, 'owner')
	`, created.ID, userID); err != nil {
		return serverDTO{}, fmt.Errorf("insert server member: %w", err)
	}

	// Yeni sunucuda yazılı sohbeti direkt kullanılabilir yapmak için varsayılan metin kanalı.
	if _, err := tx.Exec(ctx, `
		INSERT INTO channels (server_id, name, kind, created_by)
		VALUES ($1, 'general', 'text', $2)
		ON CONFLICT (server_id, name) DO NOTHING
	`, created.ID, userID); err != nil {
		return serverDTO{}, fmt.Errorf("insert default text channel: %w", err)
	}

	// Sesli sohbet başlangıcı için varsayılan bir ses kanalı.
	if _, err := tx.Exec(ctx, `
		INSERT INTO voice_channels (workspace_id, name, max_participants)
		VALUES ($1, 'Genel Ses', 10)
		ON CONFLICT (workspace_id, name) DO NOTHING
	`, created.ID); err != nil {
		return serverDTO{}, fmt.Errorf("insert default voice channel: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return serverDTO{}, fmt.Errorf("commit create server tx: %w", err)
	}

	created.Role = "owner"
	created.MemberCount = 1
	return created, nil
}

func (s *Service) Update(ctx context.Context, userID, serverID string, req updateServerRequest) (serverDTO, error) {
	role, err := s.memberRole(ctx, userID, serverID)
	if err != nil {
		return serverDTO{}, err
	}
	if role != "owner" && role != "admin" {
		return serverDTO{}, ErrForbidden
	}

	if req.Name != nil {
		if _, err := s.db.Pool.Exec(ctx, `
			UPDATE servers
			SET name = $2, updated_at = NOW()
			WHERE id = $1
		`, serverID, strings.TrimSpace(*req.Name)); err != nil {
			if isUniqueViolation(err) {
				return serverDTO{}, ErrConflict
			}
			return serverDTO{}, fmt.Errorf("update server: %w", err)
		}
	}

	updated, err := s.GetByMember(ctx, userID, serverID)
	if err != nil {
		return serverDTO{}, err
	}

	_ = s.publishServerUpdatedEvent(ctx, serverID, userID)
	return updated, nil
}

func (s *Service) ListMembers(ctx context.Context, userID, serverID string) ([]serverMemberDTO, error) {
	if _, err := s.memberRole(ctx, userID, serverID); err != nil {
		return nil, err
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			sm.user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			sm.role,
			sm.joined_at,
			COALESCE(ps.status, 'offline') AS status,
			ps.last_seen_at
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		LEFT JOIN presence_states ps ON ps.user_id = sm.user_id
		WHERE sm.server_id = $1
		ORDER BY
			CASE sm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
			sm.joined_at ASC
	`, serverID)
	if err != nil {
		return nil, fmt.Errorf("list server members: %w", err)
	}
	defer rows.Close()

	items := make([]serverMemberDTO, 0)
	for rows.Next() {
		var item serverMemberDTO
		if err := rows.Scan(
			&item.UserID,
			&item.Username,
			&item.DisplayName,
			&item.AvatarPath,
			&item.Role,
			&item.JoinedAt,
			&item.Status,
			&item.LastSeenAt,
		); err != nil {
			return nil, fmt.Errorf("scan server member: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate server members: %w", err)
	}

	return items, nil
}

func (s *Service) InviteMember(ctx context.Context, inviterUserID, serverID, targetUserID string) (inviteMemberResponse, error) {
	inviterUserID = strings.TrimSpace(inviterUserID)
	serverID = strings.TrimSpace(serverID)
	targetUserID = strings.TrimSpace(targetUserID)
	if inviterUserID == "" || serverID == "" || targetUserID == "" || inviterUserID == targetUserID {
		return inviteMemberResponse{}, ErrInvalidTarget
	}

	inviterRole, err := s.memberRole(ctx, inviterUserID, serverID)
	if err != nil {
		return inviteMemberResponse{}, err
	}
	if inviterRole != "owner" && inviterRole != "admin" {
		return inviteMemberResponse{}, ErrForbidden
	}

	var targetExists bool
	if err := s.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE id = $1
		)
	`, targetUserID).Scan(&targetExists); err != nil {
		return inviteMemberResponse{}, fmt.Errorf("check target user: %w", err)
	}
	if !targetExists {
		return inviteMemberResponse{}, ErrUserNotFound
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return inviteMemberResponse{}, fmt.Errorf("begin invite tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var alreadyMember bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM server_members
			WHERE server_id = $1
			  AND user_id = $2
		)
	`, serverID, targetUserID).Scan(&alreadyMember); err != nil {
		return inviteMemberResponse{}, fmt.Errorf("check existing member: %w", err)
	}
	if alreadyMember {
		return inviteMemberResponse{}, ErrAlreadyMember
	}

	var existingID string
	var existingStatus string
	err = tx.QueryRow(ctx, `
		SELECT id, status
		FROM server_invites
		WHERE server_id = $1
		  AND invited_user_id = $2
		FOR UPDATE
	`, serverID, targetUserID).Scan(&existingID, &existingStatus)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return inviteMemberResponse{}, fmt.Errorf("load existing server invite: %w", err)
	}

	created := false
	var inviteID string
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		err = tx.QueryRow(ctx, `
			INSERT INTO server_invites (server_id, invited_user_id, invited_by_user_id, status)
			VALUES ($1, $2, $3, 'pending')
			RETURNING id
		`, serverID, targetUserID, inviterUserID).Scan(&inviteID)
		if err != nil {
			return inviteMemberResponse{}, fmt.Errorf("insert server invite: %w", err)
		}
		created = true
	case existingStatus == "pending":
		inviteID = existingID
	default:
		_, err = tx.Exec(ctx, `
			UPDATE server_invites
			SET invited_by_user_id = $2,
			    status = 'pending',
			    responded_at = NULL,
			    created_at = NOW(),
			    updated_at = NOW()
			WHERE id = $1
		`, existingID, inviterUserID)
		if err != nil {
			return inviteMemberResponse{}, fmt.Errorf("reopen server invite: %w", err)
		}
		inviteID = existingID
		created = true
	}

	invite, err := s.getInviteTx(ctx, tx, inviteID)
	if err != nil {
		return inviteMemberResponse{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return inviteMemberResponse{}, fmt.Errorf("commit invite tx: %w", err)
	}

	if created {
		// Invite persistence is already committed; realtime fanout should not fail the API response.
		if err := s.publishInviteEvent(ctx, events.EventServerInviteCreated, targetUserID, inviterUserID, invite); err != nil {
			log.Printf(
				"realtime_event=server_invite_created_publish_failed server_id=%s invite_id=%s inviter_user_id=%s target_user_id=%s err=%v",
				serverID,
				invite.ID,
				inviterUserID,
				targetUserID,
				err,
			)
		}
	}

	return inviteMemberResponse{
		Invite:  invite,
		Created: created,
	}, nil
}

func (s *Service) ListInvites(ctx context.Context, userID string) ([]serverInviteDTO, error) {
	userID = strings.TrimSpace(userID)
	if userID == "" {
		return []serverInviteDTO{}, nil
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			si.id,
			si.server_id,
			s.name,
			si.invited_user_id,
			si.invited_by_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			si.status,
			si.created_at,
			si.updated_at,
			si.responded_at
		FROM server_invites si
		JOIN servers s ON s.id = si.server_id
		JOIN users u ON u.id = si.invited_by_user_id
		WHERE si.invited_user_id = $1
		  AND si.status = 'pending'
		ORDER BY si.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("list server invites: %w", err)
	}
	defer rows.Close()

	invites := make([]serverInviteDTO, 0)
	for rows.Next() {
		var item serverInviteDTO
		if err := rows.Scan(
			&item.ID,
			&item.ServerID,
			&item.ServerName,
			&item.InvitedUserID,
			&item.InvitedByUserID,
			&item.InvitedByUsername,
			&item.InvitedByDisplayName,
			&item.InvitedByAvatarPath,
			&item.Status,
			&item.CreatedAt,
			&item.UpdatedAt,
			&item.RespondedAt,
		); err != nil {
			return nil, fmt.Errorf("scan server invite: %w", err)
		}
		invites = append(invites, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate server invites: %w", err)
	}

	return invites, nil
}

func (s *Service) AcceptInvite(ctx context.Context, userID, inviteID string) (serverDTO, error) {
	userID = strings.TrimSpace(userID)
	inviteID = strings.TrimSpace(inviteID)
	if userID == "" || inviteID == "" {
		return serverDTO{}, ErrInvalidTarget
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return serverDTO{}, fmt.Errorf("begin accept server invite tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var serverID string
	var invitedUserID string
	var status string
	err = tx.QueryRow(ctx, `
		SELECT server_id, invited_user_id, status
		FROM server_invites
		WHERE id = $1
		FOR UPDATE
	`, inviteID).Scan(&serverID, &invitedUserID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return serverDTO{}, ErrInviteNotFound
		}
		return serverDTO{}, fmt.Errorf("load server invite: %w", err)
	}

	if invitedUserID != userID {
		return serverDTO{}, ErrInviteForbidden
	}
	if status != "pending" {
		return serverDTO{}, ErrInviteNotPending
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO server_members (server_id, user_id, role)
		VALUES ($1, $2, 'member')
		ON CONFLICT (server_id, user_id) DO NOTHING
	`, serverID, userID); err != nil {
		return serverDTO{}, fmt.Errorf("insert accepted server member: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		UPDATE server_invites
		SET status = 'accepted',
		    responded_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1
	`, inviteID); err != nil {
		return serverDTO{}, fmt.Errorf("mark server invite accepted: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return serverDTO{}, fmt.Errorf("commit accept server invite tx: %w", err)
	}

	server, err := s.GetByMember(ctx, userID, serverID)
	if err != nil {
		return serverDTO{}, err
	}

	_ = s.publishServerMemberEvent(ctx, serverID, userID, userID, "accepted")

	return server, nil
}

func (s *Service) RejectInvite(ctx context.Context, userID, inviteID string) error {
	userID = strings.TrimSpace(userID)
	inviteID = strings.TrimSpace(inviteID)
	if userID == "" || inviteID == "" {
		return ErrInvalidTarget
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return fmt.Errorf("begin reject server invite tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var invitedUserID string
	var status string
	err = tx.QueryRow(ctx, `
		SELECT invited_user_id, status
		FROM server_invites
		WHERE id = $1
		FOR UPDATE
	`, inviteID).Scan(&invitedUserID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInviteNotFound
		}
		return fmt.Errorf("load server invite for reject: %w", err)
	}

	if invitedUserID != userID {
		return ErrInviteForbidden
	}
	if status != "pending" {
		return ErrInviteNotPending
	}

	if _, err := tx.Exec(ctx, `
		UPDATE server_invites
		SET status = 'rejected',
		    responded_at = NOW(),
		    updated_at = NOW()
		WHERE id = $1
	`, inviteID); err != nil {
		return fmt.Errorf("mark server invite rejected: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit reject server invite tx: %w", err)
	}

	return nil
}

func (s *Service) RemoveMember(ctx context.Context, requesterUserID, serverID, memberUserID string) error {
	requesterRole, err := s.memberRole(ctx, requesterUserID, serverID)
	if err != nil {
		return err
	}
	if requesterRole != "owner" && requesterRole != "admin" {
		return ErrForbidden
	}
	if requesterUserID == memberUserID {
		return ErrCannotKickSelf
	}

	var targetRole string
	err = s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, memberUserID).Scan(&targetRole)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrMemberNotFound
		}
		return fmt.Errorf("load target role: %w", err)
	}

	if targetRole == "owner" {
		return ErrOwnerCannotKick
	}
	if requesterRole != "owner" && targetRole == "admin" {
		return ErrForbidden
	}

	if _, err := s.db.Pool.Exec(ctx, `
		DELETE FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, memberUserID); err != nil {
		return fmt.Errorf("remove member: %w", err)
	}

	_ = s.publishServerMemberEvent(ctx, serverID, requesterUserID, memberUserID, "removed")

	return nil
}

func (s *Service) UpdateMemberRole(ctx context.Context, requesterUserID, serverID, memberUserID, role string) (serverMemberDTO, error) {
	requesterUserID = strings.TrimSpace(requesterUserID)
	serverID = strings.TrimSpace(serverID)
	memberUserID = strings.TrimSpace(memberUserID)
	nextRole := strings.TrimSpace(strings.ToLower(role))

	if requesterUserID == "" || serverID == "" || memberUserID == "" {
		return serverMemberDTO{}, ErrInvalidTarget
	}
	if nextRole != "admin" && nextRole != "member" {
		return serverMemberDTO{}, ErrInvalidRole
	}

	requesterRole, err := s.memberRole(ctx, requesterUserID, serverID)
	if err != nil {
		return serverMemberDTO{}, err
	}
	if requesterRole != "owner" {
		return serverMemberDTO{}, ErrForbidden
	}

	var currentRole string
	err = s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, memberUserID).Scan(&currentRole)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return serverMemberDTO{}, ErrMemberNotFound
		}
		return serverMemberDTO{}, fmt.Errorf("load target role: %w", err)
	}

	if currentRole == "owner" {
		return serverMemberDTO{}, ErrOwnerRoleLocked
	}

	if currentRole != nextRole {
		if _, err := s.db.Pool.Exec(ctx, `
			UPDATE server_members
			SET role = $3
			WHERE server_id = $1 AND user_id = $2
		`, serverID, memberUserID, nextRole); err != nil {
			return serverMemberDTO{}, fmt.Errorf("update member role: %w", err)
		}
	}

	updated, err := s.getMember(ctx, serverID, memberUserID)
	if err != nil {
		return serverMemberDTO{}, err
	}

	_ = s.publishServerMemberEvent(ctx, serverID, requesterUserID, memberUserID, "role_updated")

	return updated, nil
}

func (s *Service) Leave(ctx context.Context, userID, serverID string) error {
	role, err := s.memberRole(ctx, userID, serverID)
	if err != nil {
		return err
	}

	if role == "owner" {
		return ErrOwnerCannotLeave
	}

	if _, err := s.db.Pool.Exec(ctx, `
		DELETE FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, userID); err != nil {
		return fmt.Errorf("leave server: %w", err)
	}

	_ = s.publishServerMemberEvent(ctx, serverID, userID, userID, "left")

	return nil
}

func (s *Service) Delete(ctx context.Context, userID, serverID string) error {
	var ownerID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT owner_id
		FROM servers
		WHERE id = $1
	`, serverID).Scan(&ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrServerNotFound
		}
		return fmt.Errorf("load server owner: %w", err)
	}

	if ownerID != userID {
		return ErrForbidden
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT user_id
		FROM server_members
		WHERE server_id = $1
	`, serverID)
	if err != nil {
		return fmt.Errorf("list server members for delete: %w", err)
	}
	memberIDs := make([]string, 0)
	for rows.Next() {
		var memberID string
		if err := rows.Scan(&memberID); err != nil {
			rows.Close()
			return fmt.Errorf("scan server member for delete: %w", err)
		}
		memberIDs = append(memberIDs, memberID)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return fmt.Errorf("iterate server members for delete: %w", err)
	}
	rows.Close()

	if _, err := s.db.Pool.Exec(ctx, `
		DELETE FROM servers
		WHERE id = $1
	`, serverID); err != nil {
		return fmt.Errorf("delete server: %w", err)
	}

	_ = s.publishServerDeletedEvent(ctx, serverID, userID, memberIDs)

	return nil
}

func (s *Service) memberRole(ctx context.Context, userID, serverID string) (string, error) {
	var role string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, serverID, userID).Scan(&role)
	if err == nil {
		return role, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", fmt.Errorf("load member role: %w", err)
	}

	exists, checkErr := s.serverExists(ctx, serverID)
	if checkErr != nil {
		return "", checkErr
	}
	if !exists {
		return "", ErrServerNotFound
	}

	return "", ErrForbidden
}

func (s *Service) serverExists(ctx context.Context, serverID string) (bool, error) {
	var exists bool
	if err := s.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM servers
			WHERE id = $1
		)
	`, serverID).Scan(&exists); err != nil {
		return false, fmt.Errorf("check server exists: %w", err)
	}
	return exists, nil
}

func (s *Service) getMember(ctx context.Context, serverID, userID string) (serverMemberDTO, error) {
	var item serverMemberDTO
	err := s.db.Pool.QueryRow(ctx, `
		SELECT
			sm.user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			sm.role,
			sm.joined_at,
			COALESCE(ps.status, 'offline') AS status,
			ps.last_seen_at
		FROM server_members sm
		JOIN users u ON u.id = sm.user_id
		LEFT JOIN presence_states ps ON ps.user_id = sm.user_id
		WHERE sm.server_id = $1 AND sm.user_id = $2
	`, serverID, userID).Scan(
		&item.UserID,
		&item.Username,
		&item.DisplayName,
		&item.AvatarPath,
		&item.Role,
		&item.JoinedAt,
		&item.Status,
		&item.LastSeenAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return serverMemberDTO{}, ErrMemberNotFound
		}
		return serverMemberDTO{}, fmt.Errorf("load server member: %w", err)
	}
	return item, nil
}

func (s *Service) getInviteTx(ctx context.Context, tx pgx.Tx, inviteID string) (serverInviteDTO, error) {
	var item serverInviteDTO
	err := tx.QueryRow(ctx, `
		SELECT
			si.id,
			si.server_id,
			s.name,
			si.invited_user_id,
			si.invited_by_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			si.status,
			si.created_at,
			si.updated_at,
			si.responded_at
		FROM server_invites si
		JOIN servers s ON s.id = si.server_id
		JOIN users u ON u.id = si.invited_by_user_id
		WHERE si.id = $1
	`, inviteID).Scan(
		&item.ID,
		&item.ServerID,
		&item.ServerName,
		&item.InvitedUserID,
		&item.InvitedByUserID,
		&item.InvitedByUsername,
		&item.InvitedByDisplayName,
		&item.InvitedByAvatarPath,
		&item.Status,
		&item.CreatedAt,
		&item.UpdatedAt,
		&item.RespondedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return serverInviteDTO{}, ErrInviteNotFound
		}
		return serverInviteDTO{}, fmt.Errorf("load server invite: %w", err)
	}
	return item, nil
}

func (s *Service) publishInviteEvent(ctx context.Context, eventType, targetUserID, senderID string, payload serverInviteDTO) error {
	if s.publisher == nil {
		return nil
	}

	event, err := events.NewEnvelope(eventType, events.UserRoom(targetUserID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create server invite event: %w", err)
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish server invite event: %w", err)
	}
	return nil
}

func (s *Service) publishServerMemberEvent(ctx context.Context, serverID, senderID, targetUserID, action string) error {
	if s.publisher == nil {
		return nil
	}

	payload := map[string]string{
		"serverId":     strings.TrimSpace(serverID),
		"targetUserId": strings.TrimSpace(targetUserID),
		"action":       strings.TrimSpace(action),
	}

	event, err := events.NewEnvelope(events.EventServerMemberUpdated, events.ServerRoom(serverID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create server member event: %w", err)
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish server member event: %w", err)
	}
	return nil
}

func (s *Service) publishServerUpdatedEvent(ctx context.Context, serverID, senderID string) error {
	if s.publisher == nil {
		return nil
	}

	payload := map[string]string{
		"serverId": strings.TrimSpace(serverID),
	}

	event, err := events.NewEnvelope(events.EventServerUpdated, events.ServerRoom(serverID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create server updated event: %w", err)
	}
	if err := s.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish server updated event: %w", err)
	}
	return nil
}

func (s *Service) publishServerDeletedEvent(ctx context.Context, serverID, senderID string, memberUserIDs []string) error {
	if s.publisher == nil {
		return nil
	}

	payload := map[string]string{
		"serverId": strings.TrimSpace(serverID),
	}

	for _, memberUserID := range memberUserIDs {
		memberUserID = strings.TrimSpace(memberUserID)
		if memberUserID == "" {
			continue
		}
		event, err := events.NewEnvelope(events.EventServerDeleted, events.UserRoom(memberUserID), senderID, payload)
		if err != nil {
			return fmt.Errorf("create server deleted event: %w", err)
		}
		if err := s.publisher.Publish(ctx, event); err != nil {
			return fmt.Errorf("publish server deleted event: %w", err)
		}
	}
	return nil
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
