package friends

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
)

var (
	ErrInvalidTarget          = errors.New("invalid_target")
	ErrUserNotFound           = errors.New("user_not_found")
	ErrAlreadyFriends         = errors.New("already_friends")
	ErrRequestNotFound        = errors.New("request_not_found")
	ErrRequestForbidden       = errors.New("request_forbidden")
	ErrRequestNotPending      = errors.New("request_not_pending")
	ErrRequestBlocked         = errors.New("request_blocked")
	ErrRequestPrivacyRejected = errors.New("request_privacy_rejected")
)

type Service struct {
	db        *database.DB
	publisher EventPublisher
}

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type updateFriendPrivacyInput struct {
	AllowEveryone        *bool
	AllowFriendsOfFriend *bool
	AllowServerMembers   *bool
}

func NewService(db *database.DB, publisher EventPublisher) *Service {
	return &Service{
		db:        db,
		publisher: publisher,
	}
}

func (s *Service) ListFriends(ctx context.Context, userID string) ([]friendDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			f.friend_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			COALESCE(ps.status, 'offline') AS status,
			ps.last_seen_at,
			f.created_at
		FROM friendships f
		JOIN users u ON u.id = f.friend_user_id
		LEFT JOIN presence_states ps ON ps.user_id = f.friend_user_id
		WHERE f.user_id = $1
		ORDER BY LOWER(u.display_name) ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query friends: %w", err)
	}
	defer rows.Close()

	friends := make([]friendDTO, 0)
	for rows.Next() {
		var item friendDTO
		if err := rows.Scan(
			&item.UserID,
			&item.Username,
			&item.DisplayName,
			&item.AvatarPath,
			&item.Status,
			&item.LastSeenAt,
			&item.CreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scan friend: %w", err)
		}
		friends = append(friends, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate friends: %w", err)
	}

	return friends, nil
}

func (s *Service) ListRequests(ctx context.Context, userID string) ([]friendRequestDTO, []friendRequestDTO, error) {
	incoming, err := s.listIncoming(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	outgoing, err := s.listOutgoing(ctx, userID)
	if err != nil {
		return nil, nil, err
	}

	return incoming, outgoing, nil
}

func (s *Service) SendRequest(ctx context.Context, requesterID, targetID string) (sendRequestResponse, error) {
	requesterID = strings.TrimSpace(requesterID)
	targetID = strings.TrimSpace(targetID)
	if requesterID == "" || targetID == "" || requesterID == targetID {
		return sendRequestResponse{}, ErrInvalidTarget
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return sendRequestResponse{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.ensureUserExists(ctx, tx, targetID); err != nil {
		return sendRequestResponse{}, err
	}

	blockedByTarget, blockedByRequester, err := s.blockedStateTx(ctx, tx, requesterID, targetID)
	if err != nil {
		return sendRequestResponse{}, err
	}
	if blockedByTarget || blockedByRequester {
		return sendRequestResponse{}, ErrRequestBlocked
	}

	alreadyFriends, err := s.areFriends(ctx, tx, requesterID, targetID)
	if err != nil {
		return sendRequestResponse{}, err
	}
	if alreadyFriends {
		return sendRequestResponse{}, ErrAlreadyFriends
	}

	var existingID string
	var existingRequesterID string
	var existingAddresseeID string
	var existingStatus string
	var existingCreatedAt time.Time
	err = tx.QueryRow(ctx, `
		SELECT id, requester_id, addressee_id, status, created_at
		FROM friend_requests
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
		LIMIT 1
	`, requesterID, targetID).Scan(&existingID, &existingRequesterID, &existingAddresseeID, &existingStatus, &existingCreatedAt)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return sendRequestResponse{}, fmt.Errorf("load existing friend request: %w", err)
	}

	if err == nil {
		if existingStatus == "pending" {
			if existingRequesterID == requesterID {
				request, mapErr := s.mapRequestItem(ctx, tx, existingID, targetID, existingCreatedAt)
				if mapErr != nil {
					return sendRequestResponse{}, mapErr
				}
				if commitErr := tx.Commit(ctx); commitErr != nil {
					return sendRequestResponse{}, fmt.Errorf("commit tx: %w", commitErr)
				}
				_ = s.publishFriendRequestEvent(ctx, requesterID, existingID, requesterID, targetID, "pending")
				return sendRequestResponse{
					Created: false,
					Request: &request,
				}, nil
			}

			updatedFriend, acceptErr := s.acceptRequestTx(ctx, tx, existingID, requesterID)
			if acceptErr != nil {
				return sendRequestResponse{}, acceptErr
			}
			_ = updatedFriend
			if commitErr := tx.Commit(ctx); commitErr != nil {
				return sendRequestResponse{}, fmt.Errorf("commit tx: %w", commitErr)
			}
			_ = s.publishFriendshipEvent(ctx, requesterID, requesterID, targetID, "accepted")
			return sendRequestResponse{
				Created:      false,
				AutoAccepted: true,
			}, nil
		}

		allowedByPrivacy, err := s.canSendRequestByPrivacyTx(ctx, tx, requesterID, targetID)
		if err != nil {
			return sendRequestResponse{}, err
		}
		if !allowedByPrivacy {
			return sendRequestResponse{}, ErrRequestPrivacyRejected
		}

		var createdAt time.Time
		err = tx.QueryRow(ctx, `
			UPDATE friend_requests
			SET requester_id = $1,
			    addressee_id = $2,
			    status = 'pending',
			    responded_at = NULL,
			    created_at = NOW(),
			    updated_at = NOW()
			WHERE id = $3
			RETURNING created_at
		`, requesterID, targetID, existingID).Scan(&createdAt)
		if err != nil {
			return sendRequestResponse{}, fmt.Errorf("reopen friend request: %w", err)
		}

		request, mapErr := s.mapRequestItem(ctx, tx, existingID, targetID, createdAt)
		if mapErr != nil {
			return sendRequestResponse{}, mapErr
		}

		if commitErr := tx.Commit(ctx); commitErr != nil {
			return sendRequestResponse{}, fmt.Errorf("commit tx: %w", commitErr)
		}
		_ = s.publishFriendRequestEvent(ctx, requesterID, existingID, requesterID, targetID, "pending")
		return sendRequestResponse{
			Created: true,
			Request: &request,
		}, nil
	}

	allowedByPrivacy, err := s.canSendRequestByPrivacyTx(ctx, tx, requesterID, targetID)
	if err != nil {
		return sendRequestResponse{}, err
	}
	if !allowedByPrivacy {
		return sendRequestResponse{}, ErrRequestPrivacyRejected
	}

	var createdID string
	var createdAt time.Time
	err = tx.QueryRow(ctx, `
		INSERT INTO friend_requests (requester_id, addressee_id, status)
		VALUES ($1, $2, 'pending')
		RETURNING id, created_at
	`, requesterID, targetID).Scan(&createdID, &createdAt)
	if err != nil {
		return sendRequestResponse{}, fmt.Errorf("create friend request: %w", err)
	}

	request, mapErr := s.mapRequestItem(ctx, tx, createdID, targetID, createdAt)
	if mapErr != nil {
		return sendRequestResponse{}, mapErr
	}

	if err := tx.Commit(ctx); err != nil {
		return sendRequestResponse{}, fmt.Errorf("commit tx: %w", err)
	}
	_ = s.publishFriendRequestEvent(ctx, requesterID, createdID, requesterID, targetID, "pending")

	return sendRequestResponse{
		Created: true,
		Request: &request,
	}, nil
}

func (s *Service) AcceptRequest(ctx context.Context, userID, requestID string) (friendDTO, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return friendDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	friend, err := s.acceptRequestTx(ctx, tx, requestID, userID)
	if err != nil {
		return friendDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return friendDTO{}, fmt.Errorf("commit tx: %w", err)
	}
	_ = s.publishFriendshipEvent(ctx, userID, userID, friend.UserID, "accepted")

	return friend, nil
}

func (s *Service) RejectRequest(ctx context.Context, userID, requestID string) error {
	var requesterID string
	var addresseeID string
	var status string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT requester_id, addressee_id, status
		FROM friend_requests
		WHERE id = $1
	`, requestID).Scan(&requesterID, &addresseeID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrRequestNotFound
		}
		return fmt.Errorf("load request: %w", err)
	}

	if status != "pending" {
		return ErrRequestNotPending
	}

	nextStatus := ""
	switch userID {
	case addresseeID:
		nextStatus = "rejected"
	case requesterID:
		nextStatus = "canceled"
	default:
		return ErrRequestForbidden
	}

	command, err := s.db.Pool.Exec(ctx, `
		UPDATE friend_requests
		SET status = $2, responded_at = NOW(), updated_at = NOW()
		WHERE id = $1 AND status = 'pending'
	`, requestID, nextStatus)
	if err != nil {
		return fmt.Errorf("reject request: %w", err)
	}
	if command.RowsAffected() == 0 {
		return ErrRequestNotPending
	}
	_ = s.publishFriendRequestEvent(ctx, userID, requestID, requesterID, addresseeID, nextStatus)
	return nil
}

func (s *Service) RemoveFriend(ctx context.Context, userID, friendUserID string) error {
	if strings.TrimSpace(userID) == "" || strings.TrimSpace(friendUserID) == "" || userID == friendUserID {
		return ErrInvalidTarget
	}

	_, err := s.db.Pool.Exec(ctx, `
		DELETE FROM friendships
		WHERE (user_id = $1 AND friend_user_id = $2)
		   OR (user_id = $2 AND friend_user_id = $1)
	`, userID, friendUserID)
	if err != nil {
		return fmt.Errorf("remove friendship: %w", err)
	}
	_ = s.publishFriendshipEvent(ctx, userID, userID, friendUserID, "removed")
	return nil
}

func (s *Service) GetFriendPrivacySettings(ctx context.Context, userID string) (friendPrivacySettingsDTO, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	settings, err := s.getFriendPrivacySettingsTx(ctx, tx, userID)
	if err != nil {
		return friendPrivacySettingsDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("commit tx: %w", err)
	}

	return settings, nil
}

func (s *Service) UpdateFriendPrivacySettings(ctx context.Context, userID string, input updateFriendPrivacyInput) (friendPrivacySettingsDTO, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := s.getFriendPrivacySettingsTx(ctx, tx, userID); err != nil {
		return friendPrivacySettingsDTO{}, err
	}

	if input.AllowEveryone != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE friend_privacy_settings
			SET allow_friend_requests_everyone = $2
			WHERE user_id = $1
		`, userID, *input.AllowEveryone); err != nil {
			return friendPrivacySettingsDTO{}, fmt.Errorf("update allow everyone: %w", err)
		}
	}

	if input.AllowFriendsOfFriend != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE friend_privacy_settings
			SET allow_friend_requests_friends_of_friends = $2
			WHERE user_id = $1
		`, userID, *input.AllowFriendsOfFriend); err != nil {
			return friendPrivacySettingsDTO{}, fmt.Errorf("update allow friends of friends: %w", err)
		}
	}

	if input.AllowServerMembers != nil {
		if _, err := tx.Exec(ctx, `
			UPDATE friend_privacy_settings
			SET allow_friend_requests_server_members = $2
			WHERE user_id = $1
		`, userID, *input.AllowServerMembers); err != nil {
			return friendPrivacySettingsDTO{}, fmt.Errorf("update allow server members: %w", err)
		}
	}

	settings, err := s.getFriendPrivacySettingsTx(ctx, tx, userID)
	if err != nil {
		return friendPrivacySettingsDTO{}, err
	}

	if err := tx.Commit(ctx); err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("commit tx: %w", err)
	}

	return settings, nil
}

func (s *Service) ListBlockedUsers(ctx context.Context, userID string) ([]blockedUserDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			b.blocked_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			b.created_at
		FROM blocked_users b
		JOIN users u ON u.id = b.blocked_user_id
		WHERE b.blocker_user_id = $1
		ORDER BY b.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query blocked users: %w", err)
	}
	defer rows.Close()

	blocked := make([]blockedUserDTO, 0)
	for rows.Next() {
		var item blockedUserDTO
		if err := rows.Scan(
			&item.UserID,
			&item.Username,
			&item.DisplayName,
			&item.AvatarPath,
			&item.BlockedAt,
		); err != nil {
			return nil, fmt.Errorf("scan blocked user: %w", err)
		}
		blocked = append(blocked, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate blocked users: %w", err)
	}

	return blocked, nil
}

func (s *Service) BlockUser(ctx context.Context, userID, blockedUserID string) (blockedUserDTO, error) {
	userID = strings.TrimSpace(userID)
	blockedUserID = strings.TrimSpace(blockedUserID)
	if userID == "" || blockedUserID == "" || userID == blockedUserID {
		return blockedUserDTO{}, ErrInvalidTarget
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return blockedUserDTO{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if err := s.ensureUserExists(ctx, tx, blockedUserID); err != nil {
		return blockedUserDTO{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO blocked_users (blocker_user_id, blocked_user_id)
		VALUES ($1, $2)
		ON CONFLICT DO NOTHING
	`, userID, blockedUserID); err != nil {
		return blockedUserDTO{}, fmt.Errorf("insert blocked user: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM friend_requests
		WHERE (requester_id = $1 AND addressee_id = $2)
		   OR (requester_id = $2 AND addressee_id = $1)
	`, userID, blockedUserID); err != nil {
		return blockedUserDTO{}, fmt.Errorf("cleanup friend requests after block: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM friendships
		WHERE (user_id = $1 AND friend_user_id = $2)
		   OR (user_id = $2 AND friend_user_id = $1)
	`, userID, blockedUserID); err != nil {
		return blockedUserDTO{}, fmt.Errorf("cleanup friendships after block: %w", err)
	}

	var blocked blockedUserDTO
	if err := tx.QueryRow(ctx, `
		SELECT
			b.blocked_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			b.created_at
		FROM blocked_users b
		JOIN users u ON u.id = b.blocked_user_id
		WHERE b.blocker_user_id = $1
		  AND b.blocked_user_id = $2
	`, userID, blockedUserID).Scan(
		&blocked.UserID,
		&blocked.Username,
		&blocked.DisplayName,
		&blocked.AvatarPath,
		&blocked.BlockedAt,
	); err != nil {
		return blockedUserDTO{}, fmt.Errorf("load blocked user: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return blockedUserDTO{}, fmt.Errorf("commit tx: %w", err)
	}
	_ = s.publishFriendshipEvent(ctx, userID, userID, blockedUserID, "blocked")
	_ = s.publishFriendRequestEvent(ctx, userID, "", userID, blockedUserID, "blocked")

	return blocked, nil
}

func (s *Service) UnblockUser(ctx context.Context, userID, blockedUserID string) error {
	userID = strings.TrimSpace(userID)
	blockedUserID = strings.TrimSpace(blockedUserID)
	if userID == "" || blockedUserID == "" || userID == blockedUserID {
		return ErrInvalidTarget
	}

	if _, err := s.db.Pool.Exec(ctx, `
		DELETE FROM blocked_users
		WHERE blocker_user_id = $1
		  AND blocked_user_id = $2
	`, userID, blockedUserID); err != nil {
		return fmt.Errorf("unblock user: %w", err)
	}
	_ = s.publishFriendRequestEvent(ctx, userID, "", userID, blockedUserID, "unblocked")

	return nil
}

func (s *Service) acceptRequestTx(ctx context.Context, tx pgx.Tx, requestID, userID string) (friendDTO, error) {
	var requesterID string
	var addresseeID string
	var status string
	err := tx.QueryRow(ctx, `
		SELECT requester_id, addressee_id, status
		FROM friend_requests
		WHERE id = $1
		FOR UPDATE
	`, requestID).Scan(&requesterID, &addresseeID, &status)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return friendDTO{}, ErrRequestNotFound
		}
		return friendDTO{}, fmt.Errorf("load request for accept: %w", err)
	}

	if status != "pending" {
		return friendDTO{}, ErrRequestNotPending
	}
	if addresseeID != userID {
		return friendDTO{}, ErrRequestForbidden
	}

	_, err = tx.Exec(ctx, `
		UPDATE friend_requests
		SET status = 'accepted', responded_at = NOW(), updated_at = NOW()
		WHERE id = $1
	`, requestID)
	if err != nil {
		return friendDTO{}, fmt.Errorf("mark request accepted: %w", err)
	}

	if err := s.createFriendshipRows(ctx, tx, requesterID, addresseeID); err != nil {
		return friendDTO{}, err
	}

	friend, err := s.loadFriendByUserIDTx(ctx, tx, userID, requesterID)
	if err != nil {
		return friendDTO{}, err
	}
	return friend, nil
}

func (s *Service) ensureUserExists(ctx context.Context, tx pgx.Tx, userID string) error {
	var exists bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM users
			WHERE id = $1
		)
	`, userID).Scan(&exists)
	if err != nil {
		return fmt.Errorf("check user exists: %w", err)
	}
	if !exists {
		return ErrUserNotFound
	}
	return nil
}

func (s *Service) areFriends(ctx context.Context, tx pgx.Tx, userID, friendUserID string) (bool, error) {
	var exists bool
	err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM friendships
			WHERE (user_id = $1 AND friend_user_id = $2)
			   OR (user_id = $2 AND friend_user_id = $1)
		)
	`, userID, friendUserID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check friendships: %w", err)
	}
	return exists, nil
}

func (s *Service) createFriendshipRows(ctx context.Context, tx pgx.Tx, userA, userB string) error {
	_, err := tx.Exec(ctx, `
		INSERT INTO friendships (user_id, friend_user_id)
		VALUES ($1, $2), ($2, $1)
		ON CONFLICT DO NOTHING
	`, userA, userB)
	if err != nil {
		return fmt.Errorf("create friendship rows: %w", err)
	}
	return nil
}

func (s *Service) mapRequestItem(ctx context.Context, tx pgx.Tx, requestID, otherUserID string, createdAt time.Time) (friendRequestDTO, error) {
	var item friendRequestDTO
	err := tx.QueryRow(ctx, `
		SELECT id, username, display_name, avatar_path
		FROM users
		WHERE id = $1
	`, otherUserID).Scan(
		&item.UserID,
		&item.Username,
		&item.DisplayName,
		&item.AvatarPath,
	)
	if err != nil {
		return friendRequestDTO{}, fmt.Errorf("map request user: %w", err)
	}
	item.ID = requestID
	item.CreatedAt = createdAt
	return item, nil
}

func (s *Service) loadFriendByUserIDTx(ctx context.Context, tx pgx.Tx, userID, friendUserID string) (friendDTO, error) {
	var friend friendDTO
	err := tx.QueryRow(ctx, `
		SELECT
			f.friend_user_id,
			u.username,
			u.display_name,
			u.avatar_path,
			COALESCE(ps.status, 'offline') AS status,
			ps.last_seen_at,
			f.created_at
		FROM friendships f
		JOIN users u ON u.id = f.friend_user_id
		LEFT JOIN presence_states ps ON ps.user_id = f.friend_user_id
		WHERE f.user_id = $1
		  AND f.friend_user_id = $2
	`, userID, friendUserID).Scan(
		&friend.UserID,
		&friend.Username,
		&friend.DisplayName,
		&friend.AvatarPath,
		&friend.Status,
		&friend.LastSeenAt,
		&friend.CreatedAt,
	)
	if err != nil {
		return friendDTO{}, fmt.Errorf("load friend: %w", err)
	}
	return friend, nil
}

func (s *Service) getFriendPrivacySettingsTx(ctx context.Context, tx pgx.Tx, userID string) (friendPrivacySettingsDTO, error) {
	if err := s.ensureUserExists(ctx, tx, userID); err != nil {
		return friendPrivacySettingsDTO{}, err
	}

	if _, err := tx.Exec(ctx, `
		INSERT INTO friend_privacy_settings (user_id)
		VALUES ($1)
		ON CONFLICT (user_id) DO NOTHING
	`, userID); err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("ensure friend privacy settings: %w", err)
	}

	var settings friendPrivacySettingsDTO
	if err := tx.QueryRow(ctx, `
		SELECT
			allow_friend_requests_everyone,
			allow_friend_requests_friends_of_friends,
			allow_friend_requests_server_members,
			updated_at
		FROM friend_privacy_settings
		WHERE user_id = $1
	`, userID).Scan(
		&settings.AllowEveryone,
		&settings.AllowFriendsOfFriend,
		&settings.AllowServerMembers,
		&settings.UpdatedAt,
	); err != nil {
		return friendPrivacySettingsDTO{}, fmt.Errorf("load friend privacy settings: %w", err)
	}

	return settings, nil
}

func (s *Service) blockedStateTx(ctx context.Context, tx pgx.Tx, requesterID, targetID string) (blockedByTarget bool, blockedByRequester bool, err error) {
	if err := tx.QueryRow(ctx, `
		SELECT
			EXISTS(
				SELECT 1
				FROM blocked_users
				WHERE blocker_user_id = $2
				  AND blocked_user_id = $1
			) AS blocked_by_target,
			EXISTS(
				SELECT 1
				FROM blocked_users
				WHERE blocker_user_id = $1
				  AND blocked_user_id = $2
			) AS blocked_by_requester
	`, requesterID, targetID).Scan(&blockedByTarget, &blockedByRequester); err != nil {
		return false, false, fmt.Errorf("check blocked state: %w", err)
	}
	return blockedByTarget, blockedByRequester, nil
}

func (s *Service) canSendRequestByPrivacyTx(ctx context.Context, tx pgx.Tx, requesterID, targetID string) (bool, error) {
	settings, err := s.getFriendPrivacySettingsTx(ctx, tx, targetID)
	if err != nil {
		return false, err
	}

	if settings.AllowEveryone {
		return true, nil
	}

	if settings.AllowFriendsOfFriend {
		mutualFriend, err := s.hasMutualFriendTx(ctx, tx, requesterID, targetID)
		if err != nil {
			return false, err
		}
		if mutualFriend {
			return true, nil
		}
	}

	if settings.AllowServerMembers {
		sharedServer, err := s.hasSharedServerTx(ctx, tx, requesterID, targetID)
		if err != nil {
			return false, err
		}
		if sharedServer {
			return true, nil
		}
	}

	return false, nil
}

func (s *Service) hasMutualFriendTx(ctx context.Context, tx pgx.Tx, userA, userB string) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM friendships fa
			JOIN friendships fb ON fb.friend_user_id = fa.friend_user_id
			WHERE fa.user_id = $1
			  AND fb.user_id = $2
		)
	`, userA, userB).Scan(&exists); err != nil {
		return false, fmt.Errorf("check mutual friend: %w", err)
	}
	return exists, nil
}

func (s *Service) hasSharedServerTx(ctx context.Context, tx pgx.Tx, userA, userB string) (bool, error) {
	var exists bool
	if err := tx.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM server_members a
			JOIN server_members b ON b.server_id = a.server_id
			WHERE a.user_id = $1
			  AND b.user_id = $2
		)
	`, userA, userB).Scan(&exists); err != nil {
		return false, fmt.Errorf("check shared server: %w", err)
	}
	return exists, nil
}

func (s *Service) publishFriendRequestEvent(
	ctx context.Context,
	senderID string,
	requestID string,
	requesterID string,
	addresseeID string,
	status string,
) error {
	if s.publisher == nil {
		return nil
	}

	payload := map[string]string{
		"requestId":   strings.TrimSpace(requestID),
		"requesterId": strings.TrimSpace(requesterID),
		"addresseeId": strings.TrimSpace(addresseeID),
		"status":      strings.TrimSpace(status),
	}

	eventType := events.EventFriendRequestUpdated
	if status == "pending" {
		eventType = events.EventFriendRequestCreated
	}

	if err := s.publishToUser(ctx, strings.TrimSpace(requesterID), senderID, eventType, payload); err != nil {
		return err
	}
	if requesterID != addresseeID {
		if err := s.publishToUser(ctx, strings.TrimSpace(addresseeID), senderID, eventType, payload); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) publishFriendshipEvent(ctx context.Context, senderID, userA, userB, status string) error {
	if s.publisher == nil {
		return nil
	}

	payload := map[string]string{
		"userAId": strings.TrimSpace(userA),
		"userBId": strings.TrimSpace(userB),
		"status":  strings.TrimSpace(status),
	}

	eventType := events.EventFriendshipUpdated
	if status == "removed" || status == "blocked" {
		eventType = events.EventFriendshipRemoved
	}

	if err := s.publishToUser(ctx, strings.TrimSpace(userA), senderID, eventType, payload); err != nil {
		return err
	}
	if userA != userB {
		if err := s.publishToUser(ctx, strings.TrimSpace(userB), senderID, eventType, payload); err != nil {
			return err
		}
	}
	return nil
}

func (s *Service) publishToUser(ctx context.Context, userID, senderID, eventType string, payload interface{}) error {
	if s.publisher == nil {
		return nil
	}
	if strings.TrimSpace(userID) == "" {
		return nil
	}

	envelope, err := events.NewEnvelope(eventType, events.UserRoom(userID), senderID, payload)
	if err != nil {
		return fmt.Errorf("create friend event: %w", err)
	}
	if err := s.publisher.Publish(ctx, envelope); err != nil {
		return fmt.Errorf("publish friend event: %w", err)
	}
	return nil
}

func (s *Service) listIncoming(ctx context.Context, userID string) ([]friendRequestDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT fr.id, u.id, u.username, u.display_name, u.avatar_path, fr.created_at
		FROM friend_requests fr
		JOIN users u ON u.id = fr.requester_id
		WHERE fr.addressee_id = $1
		  AND fr.status = 'pending'
		ORDER BY fr.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query incoming requests: %w", err)
	}
	defer rows.Close()

	items := make([]friendRequestDTO, 0)
	for rows.Next() {
		var item friendRequestDTO
		if err := rows.Scan(&item.ID, &item.UserID, &item.Username, &item.DisplayName, &item.AvatarPath, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan incoming request: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate incoming requests: %w", err)
	}
	return items, nil
}

func (s *Service) listOutgoing(ctx context.Context, userID string) ([]friendRequestDTO, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT fr.id, u.id, u.username, u.display_name, u.avatar_path, fr.created_at
		FROM friend_requests fr
		JOIN users u ON u.id = fr.addressee_id
		WHERE fr.requester_id = $1
		  AND fr.status = 'pending'
		ORDER BY fr.created_at DESC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("query outgoing requests: %w", err)
	}
	defer rows.Close()

	items := make([]friendRequestDTO, 0)
	for rows.Next() {
		var item friendRequestDTO
		if err := rows.Scan(&item.ID, &item.UserID, &item.Username, &item.DisplayName, &item.AvatarPath, &item.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan outgoing request: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate outgoing requests: %w", err)
	}
	return items, nil
}
