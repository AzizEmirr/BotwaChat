package websocket

import (
	"context"
	"fmt"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/google/uuid"
)

type RoomAuthorizer interface {
	CanJoinRoom(ctx context.Context, userID, room string) (bool, error)
	CanUseConversation(ctx context.Context, userID, conversationType, conversationID string) (bool, error)
}

type DBRoomAuthorizer struct {
	db *database.DB
}

func NewDBRoomAuthorizer(db *database.DB) *DBRoomAuthorizer {
	return &DBRoomAuthorizer{db: db}
}

func (a *DBRoomAuthorizer) CanJoinRoom(ctx context.Context, userID, room string) (bool, error) {
	roomType, roomID, err := events.ParseRoom(room)
	if err != nil {
		return false, err
	}

	if _, err := uuid.Parse(roomID); err != nil {
		return false, fmt.Errorf("invalid room id")
	}

	switch roomType {
	case events.RoomPrefixUser:
		return roomID == userID, nil
	case events.RoomPrefixChannel:
		return a.isChannelMember(ctx, userID, roomID)
	case events.RoomPrefixDM:
		return a.isDMMember(ctx, userID, roomID)
	case events.RoomPrefixServer:
		return a.isServerMember(ctx, userID, roomID)
	case events.RoomPrefixVoice:
		return a.isVoiceChannelMember(ctx, userID, roomID)
	default:
		return false, fmt.Errorf("unsupported room type")
	}
}

func (a *DBRoomAuthorizer) CanUseConversation(ctx context.Context, userID, conversationType, conversationID string) (bool, error) {
	switch conversationType {
	case events.RoomPrefixChannel:
		return a.isChannelMember(ctx, userID, conversationID)
	case events.RoomPrefixDM:
		return a.isDMMember(ctx, userID, conversationID)
	default:
		return false, fmt.Errorf("unsupported conversation type")
	}
}

func (a *DBRoomAuthorizer) isServerMember(ctx context.Context, userID, serverID string) (bool, error) {
	var exists bool
	err := a.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM server_members
			WHERE server_id = $1 AND user_id = $2
		)
	`, serverID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check server membership: %w", err)
	}
	return exists, nil
}

func (a *DBRoomAuthorizer) isChannelMember(ctx context.Context, userID, channelID string) (bool, error) {
	var exists bool
	err := a.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM channels c
			JOIN server_members sm ON sm.server_id = c.server_id
			WHERE c.id = $1 AND sm.user_id = $2
		)
	`, channelID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check channel membership: %w", err)
	}
	return exists, nil
}

func (a *DBRoomAuthorizer) isDMMember(ctx context.Context, userID, conversationID string) (bool, error) {
	var exists bool
	err := a.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM direct_conversation_members
			WHERE conversation_id = $1 AND user_id = $2
		)
	`, conversationID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check dm membership: %w", err)
	}
	return exists, nil
}

func (a *DBRoomAuthorizer) isVoiceChannelMember(ctx context.Context, userID, channelID string) (bool, error) {
	var exists bool
	err := a.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM voice_channels vc
			JOIN server_members sm ON sm.server_id = vc.workspace_id
			WHERE vc.id = $1 AND sm.user_id = $2
		)
	`, channelID, userID).Scan(&exists)
	if err != nil {
		return false, fmt.Errorf("check voice channel membership: %w", err)
	}
	return exists, nil
}
