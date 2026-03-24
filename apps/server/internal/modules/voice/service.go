package voice

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrVoiceChannelNotFound = errors.New("voice_channel_not_found")
	ErrVoiceForbidden       = errors.New("voice_forbidden")
	ErrVoiceCapacityReached = errors.New("voice_capacity_reached")
	ErrVoiceNotConnected    = errors.New("voice_not_connected")
	ErrVoiceConflict        = errors.New("voice_conflict")
)

type EventPublisher interface {
	Publish(ctx context.Context, event events.Envelope) error
}

type Service struct {
	db                 *database.DB
	publisher          EventPublisher
	liveKit            *LiveKitClient
	defaultMaxCapacity int
	disconnectTTL      time.Duration

	cleanupMu     sync.Mutex
	cleanupTimers map[string]*time.Timer

	speakingMu    sync.Mutex
	speakingUsers map[string]string
}

type channelRecord struct {
	ID              string
	WorkspaceID     string
	WorkspaceName   string
	Name            string
	MaxParticipants int
	CreatedAt       time.Time
}

type userRecord struct {
	ID          string
	Username    string
	DisplayName string
}

type participantRecord struct {
	UserID      string
	Username    string
	DisplayName string
	Muted       bool
	Deafened    bool
	JoinedAt    time.Time
}

func NewService(
	db *database.DB,
	publisher EventPublisher,
	liveKit *LiveKitClient,
	defaultMaxCapacity int,
	disconnectTTL time.Duration,
) *Service {
	return &Service{
		db:                 db,
		publisher:          publisher,
		liveKit:            liveKit,
		defaultMaxCapacity: defaultMaxCapacity,
		disconnectTTL:      disconnectTTL,
		cleanupTimers:      make(map[string]*time.Timer),
		speakingUsers:      make(map[string]string),
	}
}

func (s *Service) UserConnected(userID string) {
	s.cleanupMu.Lock()
	defer s.cleanupMu.Unlock()

	timer, ok := s.cleanupTimers[userID]
	if !ok {
		return
	}
	timer.Stop()
	delete(s.cleanupTimers, userID)
}

func (s *Service) UserDisconnected(userID string) {
	if s.disconnectTTL <= 0 {
		return
	}

	s.cleanupMu.Lock()
	if existing, ok := s.cleanupTimers[userID]; ok {
		existing.Stop()
		delete(s.cleanupTimers, userID)
	}

	timer := time.AfterFunc(s.disconnectTTL, func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_, _ = s.Leave(ctx, userID)

		s.cleanupMu.Lock()
		delete(s.cleanupTimers, userID)
		s.cleanupMu.Unlock()
	})
	s.cleanupTimers[userID] = timer
	s.cleanupMu.Unlock()
}

func (s *Service) ListChannels(ctx context.Context, userID, workspaceID string) (listChannelsResponse, error) {
	filter := strings.TrimSpace(workspaceID)
	var workspaceFilter interface{}
	if filter != "" {
		workspaceFilter = filter
	}

	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			vc.id,
			vc.workspace_id,
			s.name,
			vc.name,
			vc.max_participants,
			vc.created_at,
			COUNT(vs.user_id)::int AS participant_count
		FROM voice_channels vc
		JOIN servers s ON s.id = vc.workspace_id
		JOIN server_members sm ON sm.server_id = vc.workspace_id AND sm.user_id = $1
		LEFT JOIN voice_states vs ON vs.channel_id = vc.id
		WHERE ($2::uuid IS NULL OR vc.workspace_id = $2::uuid)
		GROUP BY vc.id, vc.workspace_id, s.name, vc.name, vc.max_participants, vc.created_at
		ORDER BY s.name ASC, vc.name ASC
	`, userID, workspaceFilter)
	if err != nil {
		return listChannelsResponse{}, fmt.Errorf("list voice channels: %w", err)
	}
	defer rows.Close()

	channels := make([]voiceChannelDTO, 0)
	channelIndex := make(map[string]int)
	for rows.Next() {
		var item voiceChannelDTO
		if err := rows.Scan(
			&item.ID,
			&item.WorkspaceID,
			&item.WorkspaceName,
			&item.Name,
			&item.MaxParticipants,
			&item.CreatedAt,
			&item.ParticipantCount,
		); err != nil {
			return listChannelsResponse{}, fmt.Errorf("scan voice channel: %w", err)
		}
		item.Participants = []voiceParticipantDTO{}
		channelIndex[item.ID] = len(channels)
		channels = append(channels, item)
	}
	if err := rows.Err(); err != nil {
		return listChannelsResponse{}, fmt.Errorf("iterate voice channels: %w", err)
	}

	memberRows, err := s.db.Pool.Query(ctx, `
		SELECT
			vs.channel_id,
			u.id,
			u.username,
			u.display_name,
			u.avatar_path,
			vs.muted,
			vs.deafened,
			vs.joined_at
		FROM voice_states vs
		JOIN voice_channels vc ON vc.id = vs.channel_id
		JOIN server_members sm ON sm.server_id = vc.workspace_id AND sm.user_id = $1
		JOIN users u ON u.id = vs.user_id
		WHERE ($2::uuid IS NULL OR vc.workspace_id = $2::uuid)
		ORDER BY vs.joined_at ASC
	`, userID, workspaceFilter)
	if err != nil {
		return listChannelsResponse{}, fmt.Errorf("list voice participants: %w", err)
	}
	defer memberRows.Close()

	speakingSnapshot := s.snapshotSpeaking()
	for memberRows.Next() {
		var channelID string
		var member voiceParticipantDTO
		if err := memberRows.Scan(
			&channelID,
			&member.UserID,
			&member.Username,
			&member.DisplayName,
			&member.AvatarPath,
			&member.Muted,
			&member.Deafened,
			&member.JoinedAt,
		); err != nil {
			return listChannelsResponse{}, fmt.Errorf("scan voice participant: %w", err)
		}

		member.Speaking = speakingSnapshot[member.UserID] == channelID

		idx, ok := channelIndex[channelID]
		if !ok {
			continue
		}
		channels[idx].Participants = append(channels[idx].Participants, member)
	}
	if err := memberRows.Err(); err != nil {
		return listChannelsResponse{}, fmt.Errorf("iterate voice participants: %w", err)
	}

	for index := range channels {
		channels[index].ParticipantCount = len(channels[index].Participants)
	}

	var currentState *voiceStateDTO
	var current voiceStateDTO
	err = s.db.Pool.QueryRow(ctx, `
		SELECT channel_id, muted, deafened, joined_at
		FROM voice_states
		WHERE user_id = $1
	`, userID).Scan(&current.ChannelID, &current.Muted, &current.Deafened, &current.JoinedAt)
	if err == nil {
		currentState = &current
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return listChannelsResponse{}, fmt.Errorf("load current voice state: %w", err)
	}

	return listChannelsResponse{
		Channels:     channels,
		CurrentState: currentState,
	}, nil
}

func (s *Service) CreateChannel(ctx context.Context, userID string, req createChannelRequest) (voiceChannelDTO, error) {
	maxParticipants := s.defaultMaxCapacity
	if req.MaxParticipants != nil {
		maxParticipants = *req.MaxParticipants
	}

	if maxParticipants <= 0 || maxParticipants > 100 {
		return voiceChannelDTO{}, fmt.Errorf("invalid max participants")
	}

	var role string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, req.WorkspaceID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return voiceChannelDTO{}, ErrVoiceForbidden
		}
		return voiceChannelDTO{}, fmt.Errorf("load workspace membership: %w", err)
	}

	if role != "owner" && role != "admin" {
		return voiceChannelDTO{}, ErrVoiceForbidden
	}

	workspaceName := ""
	if err := s.db.Pool.QueryRow(ctx, `
		SELECT name
		FROM servers
		WHERE id = $1
	`, req.WorkspaceID).Scan(&workspaceName); err != nil {
		return voiceChannelDTO{}, fmt.Errorf("load workspace: %w", err)
	}

	var created voiceChannelDTO
	err = s.db.Pool.QueryRow(ctx, `
		INSERT INTO voice_channels (workspace_id, name, max_participants)
		VALUES ($1, $2, $3)
		RETURNING id, created_at
	`, req.WorkspaceID, strings.TrimSpace(req.Name), maxParticipants).Scan(&created.ID, &created.CreatedAt)
	if err != nil {
		if isUniqueViolation(err) {
			return voiceChannelDTO{}, ErrVoiceConflict
		}
		return voiceChannelDTO{}, fmt.Errorf("insert voice channel: %w", err)
	}

	created.WorkspaceID = req.WorkspaceID
	created.WorkspaceName = workspaceName
	created.Name = strings.TrimSpace(req.Name)
	created.MaxParticipants = maxParticipants
	created.ParticipantCount = 0
	created.Participants = []voiceParticipantDTO{}

	payload := events.VoiceChannelPayload{
		ID:              created.ID,
		WorkspaceID:     created.WorkspaceID,
		Name:            created.Name,
		MaxParticipants: created.MaxParticipants,
		CreatedAt:       created.CreatedAt,
	}
	if err := s.publishEvent(ctx, events.EventVoiceChannelCreated, events.ServerRoom(created.WorkspaceID), userID, payload); err != nil {
		return voiceChannelDTO{}, err
	}

	return created, nil
}

func (s *Service) UpdateChannel(ctx context.Context, userID, channelID string, req updateChannelRequest) (voiceChannelDTO, error) {
	current, err := s.loadChannelForUser(ctx, userID, channelID)
	if err != nil {
		return voiceChannelDTO{}, err
	}

	role, err := s.memberRole(ctx, current.WorkspaceID, userID)
	if err != nil {
		return voiceChannelDTO{}, err
	}
	if role != "owner" && role != "admin" {
		return voiceChannelDTO{}, ErrVoiceForbidden
	}

	nextName := current.Name
	nextMax := current.MaxParticipants

	if req.Name != nil {
		nextName = strings.TrimSpace(*req.Name)
	}
	if req.MaxParticipants != nil {
		nextMax = *req.MaxParticipants
	}

	participantCount, err := s.countParticipants(ctx, current.ID)
	if err != nil {
		return voiceChannelDTO{}, err
	}
	if participantCount > nextMax {
		return voiceChannelDTO{}, ErrVoiceCapacityReached
	}

	var updated voiceChannelDTO
	err = s.db.Pool.QueryRow(ctx, `
		UPDATE voice_channels
		SET name = $2, max_participants = $3
		WHERE id = $1
		RETURNING id, workspace_id, name, max_participants, created_at
	`, current.ID, nextName, nextMax).Scan(
		&updated.ID,
		&updated.WorkspaceID,
		&updated.Name,
		&updated.MaxParticipants,
		&updated.CreatedAt,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return voiceChannelDTO{}, ErrVoiceConflict
		}
		if errors.Is(err, pgx.ErrNoRows) {
			return voiceChannelDTO{}, ErrVoiceChannelNotFound
		}
		return voiceChannelDTO{}, fmt.Errorf("update voice channel: %w", err)
	}

	updated.WorkspaceName = current.WorkspaceName
	updated.ParticipantCount = participantCount
	updated.Participants = []voiceParticipantDTO{}

	payload := events.VoiceChannelPayload{
		ID:              updated.ID,
		WorkspaceID:     updated.WorkspaceID,
		Name:            updated.Name,
		MaxParticipants: updated.MaxParticipants,
		CreatedAt:       updated.CreatedAt,
	}
	if err := s.publishEvent(ctx, events.EventVoiceChannelUpdated, events.ServerRoom(updated.WorkspaceID), userID, payload); err != nil {
		return voiceChannelDTO{}, err
	}

	return updated, nil
}

func (s *Service) DeleteChannel(ctx context.Context, userID, channelID string) (deleteChannelResponse, error) {
	current, err := s.loadChannelForUser(ctx, userID, channelID)
	if err != nil {
		return deleteChannelResponse{}, err
	}

	role, err := s.memberRole(ctx, current.WorkspaceID, userID)
	if err != nil {
		return deleteChannelResponse{}, err
	}
	if role != "owner" && role != "admin" {
		return deleteChannelResponse{}, ErrVoiceForbidden
	}

	participants, err := s.listParticipants(ctx, current.ID)
	if err != nil {
		return deleteChannelResponse{}, err
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return deleteChannelResponse{}, fmt.Errorf("begin delete voice channel tx: %w", err)
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		DELETE FROM voice_states
		WHERE channel_id = $1
	`, current.ID); err != nil {
		return deleteChannelResponse{}, fmt.Errorf("delete voice states: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM voice_channels
		WHERE id = $1
	`, current.ID); err != nil {
		return deleteChannelResponse{}, fmt.Errorf("delete voice channel: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return deleteChannelResponse{}, fmt.Errorf("commit delete voice channel tx: %w", err)
	}

	for _, participant := range participants {
		if s.clearSpeaking(participant.UserID, current.ID) {
			_ = s.publishEvent(ctx, events.EventVoiceSpeakingStop, events.VoiceRoom(current.ID), participant.UserID, events.VoiceSpeakingPayload{
				UserID:    participant.UserID,
				ChannelID: current.ID,
			})
		}

		_ = s.publishVoiceStateEvent(ctx, events.EventVoiceLeave, participant.UserID, current.WorkspaceID, events.VoiceStatePayload{
			UserID:      participant.UserID,
			ChannelID:   current.ID,
			Username:    participant.Username,
			DisplayName: participant.DisplayName,
			Muted:       participant.Muted,
			Deafened:    participant.Deafened,
			JoinedAt:    participant.JoinedAt,
		})
	}

	deleted := deleteChannelResponse{
		ID:          current.ID,
		WorkspaceID: current.WorkspaceID,
	}

	if err := s.publishEvent(ctx, events.EventVoiceChannelDeleted, events.ServerRoom(current.WorkspaceID), userID, deleted); err != nil {
		return deleteChannelResponse{}, err
	}

	return deleted, nil
}

func (s *Service) Join(ctx context.Context, userID, channelID string) (joinResult, error) {
	s.UserConnected(userID)

	channel, err := s.loadChannelForUser(ctx, userID, channelID)
	if err != nil {
		return joinResult{}, err
	}

	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return joinResult{}, err
	}

	roomName, err := s.liveKit.RoomName(channel.ID)
	if err != nil {
		return joinResult{}, err
	}
	if err := s.liveKit.EnsureRoom(ctx, roomName, channel.MaxParticipants); err != nil {
		return joinResult{}, err
	}

	token, err := s.liveKit.IssueToken(identity{
		UserID:      user.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
	}, roomName)
	if err != nil {
		return joinResult{}, err
	}

	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return joinResult{}, fmt.Errorf("begin join voice tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var previous voiceStateDTO
	hasPrevious := false
	err = tx.QueryRow(ctx, `
		SELECT channel_id, muted, deafened, joined_at
		FROM voice_states
		WHERE user_id = $1
		FOR UPDATE
	`, userID).Scan(&previous.ChannelID, &previous.Muted, &previous.Deafened, &previous.JoinedAt)
	if err == nil {
		hasPrevious = true
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return joinResult{}, fmt.Errorf("load current voice state: %w", err)
	}

	if !hasPrevious || previous.ChannelID != channel.ID {
		currentCount, err := s.countParticipantsTx(ctx, tx, channel.ID)
		if err != nil {
			return joinResult{}, err
		}
		if currentCount >= channel.MaxParticipants {
			return joinResult{}, ErrVoiceCapacityReached
		}
	}

	var state voiceStateDTO
	err = tx.QueryRow(ctx, `
		INSERT INTO voice_states (user_id, channel_id, muted, deafened, joined_at, updated_at)
		VALUES ($1, $2, FALSE, FALSE, NOW(), NOW())
		ON CONFLICT (user_id) DO UPDATE SET
			channel_id = EXCLUDED.channel_id,
			muted = CASE WHEN voice_states.channel_id = EXCLUDED.channel_id THEN voice_states.muted ELSE FALSE END,
			deafened = CASE WHEN voice_states.channel_id = EXCLUDED.channel_id THEN voice_states.deafened ELSE FALSE END,
			joined_at = CASE WHEN voice_states.channel_id = EXCLUDED.channel_id THEN voice_states.joined_at ELSE NOW() END,
			updated_at = NOW()
		RETURNING channel_id, muted, deafened, joined_at
	`, userID, channel.ID).Scan(&state.ChannelID, &state.Muted, &state.Deafened, &state.JoinedAt)
	if err != nil {
		return joinResult{}, fmt.Errorf("upsert voice state: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return joinResult{}, fmt.Errorf("commit join voice tx: %w", err)
	}

	var previousChannelID *string
	if hasPrevious && previous.ChannelID != channel.ID {
		previousChannelID = &previous.ChannelID

		if s.clearSpeaking(userID, previous.ChannelID) {
			_ = s.publishEvent(ctx, events.EventVoiceSpeakingStop, events.VoiceRoom(previous.ChannelID), userID, events.VoiceSpeakingPayload{
				UserID:    user.ID,
				ChannelID: previous.ChannelID,
			})
		}

		previousWorkspaceID, _ := s.workspaceIDForChannel(ctx, previous.ChannelID)
		_ = s.publishVoiceStateEvent(ctx, events.EventVoiceLeave, userID, previousWorkspaceID, events.VoiceStatePayload{
			UserID:      user.ID,
			ChannelID:   previous.ChannelID,
			Username:    user.Username,
			DisplayName: user.DisplayName,
			Muted:       previous.Muted,
			Deafened:    previous.Deafened,
			JoinedAt:    previous.JoinedAt,
		})
	}

	if err := s.publishVoiceStateEvent(ctx, events.EventVoiceJoin, userID, channel.WorkspaceID, events.VoiceStatePayload{
		UserID:      user.ID,
		ChannelID:   channel.ID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Muted:       state.Muted,
		Deafened:    state.Deafened,
		JoinedAt:    state.JoinedAt,
	}); err != nil {
		return joinResult{}, err
	}

	participantCount, err := s.countParticipants(ctx, channel.ID)
	if err != nil {
		return joinResult{}, err
	}

	return joinResult{
		Channel: voiceChannelDTO{
			ID:               channel.ID,
			WorkspaceID:      channel.WorkspaceID,
			WorkspaceName:    channel.WorkspaceName,
			Name:             channel.Name,
			MaxParticipants:  channel.MaxParticipants,
			ParticipantCount: participantCount,
			CreatedAt:        channel.CreatedAt,
			Participants:     []voiceParticipantDTO{},
		},
		State: state,
		LiveKit: liveKitConnectDTO{
			URL:      s.liveKit.URL(),
			RoomName: roomName,
			Token:    token,
		},
		PreviousChannelID: previousChannelID,
	}, nil
}

func (s *Service) Leave(ctx context.Context, userID string) (leaveResult, error) {
	tx, err := s.db.BeginTx(ctx)
	if err != nil {
		return leaveResult{}, fmt.Errorf("begin leave voice tx: %w", err)
	}
	defer tx.Rollback(ctx)

	var current voiceStateDTO
	err = tx.QueryRow(ctx, `
		SELECT channel_id, muted, deafened, joined_at
		FROM voice_states
		WHERE user_id = $1
		FOR UPDATE
	`, userID).Scan(&current.ChannelID, &current.Muted, &current.Deafened, &current.JoinedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return leaveResult{}, nil
		}
		return leaveResult{}, fmt.Errorf("load voice state for leave: %w", err)
	}

	if _, err := tx.Exec(ctx, `
		DELETE FROM voice_states
		WHERE user_id = $1
	`, userID); err != nil {
		return leaveResult{}, fmt.Errorf("delete voice state: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return leaveResult{}, fmt.Errorf("commit leave voice tx: %w", err)
	}

	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return leaveResult{}, err
	}

	if s.clearSpeaking(userID, current.ChannelID) {
		_ = s.publishEvent(ctx, events.EventVoiceSpeakingStop, events.VoiceRoom(current.ChannelID), userID, events.VoiceSpeakingPayload{
			UserID:    user.ID,
			ChannelID: current.ChannelID,
		})
	}

	workspaceID, err := s.workspaceIDForChannel(ctx, current.ChannelID)
	if err != nil {
		return leaveResult{}, err
	}

	if err := s.publishVoiceStateEvent(ctx, events.EventVoiceLeave, userID, workspaceID, events.VoiceStatePayload{
		UserID:      user.ID,
		ChannelID:   current.ChannelID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Muted:       current.Muted,
		Deafened:    current.Deafened,
		JoinedAt:    current.JoinedAt,
	}); err != nil {
		return leaveResult{}, err
	}

	return leaveResult{ChannelID: current.ChannelID}, nil
}

func (s *Service) SetMuted(ctx context.Context, userID string, muted bool) (voiceStateDTO, error) {
	var state voiceStateDTO
	err := s.db.Pool.QueryRow(ctx, `
		UPDATE voice_states
		SET muted = $2, updated_at = NOW()
		WHERE user_id = $1
		RETURNING channel_id, muted, deafened, joined_at
	`, userID, muted).Scan(&state.ChannelID, &state.Muted, &state.Deafened, &state.JoinedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return voiceStateDTO{}, ErrVoiceNotConnected
		}
		return voiceStateDTO{}, fmt.Errorf("update mute state: %w", err)
	}

	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return voiceStateDTO{}, err
	}

	eventType := events.EventVoiceMute
	if !muted {
		eventType = events.EventVoiceUnmute
	}

	workspaceID, err := s.workspaceIDForChannel(ctx, state.ChannelID)
	if err != nil {
		return voiceStateDTO{}, err
	}

	if err := s.publishVoiceStateEvent(ctx, eventType, userID, workspaceID, events.VoiceStatePayload{
		UserID:      user.ID,
		ChannelID:   state.ChannelID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Muted:       state.Muted,
		Deafened:    state.Deafened,
		JoinedAt:    state.JoinedAt,
	}); err != nil {
		return voiceStateDTO{}, err
	}

	return state, nil
}

func (s *Service) SetDeafened(ctx context.Context, userID string, deafened bool) (voiceStateDTO, error) {
	var state voiceStateDTO
	err := s.db.Pool.QueryRow(ctx, `
		UPDATE voice_states
		SET deafened = $2,
			muted = CASE WHEN $2 THEN TRUE ELSE FALSE END,
			updated_at = NOW()
		WHERE user_id = $1
		RETURNING channel_id, muted, deafened, joined_at
	`, userID, deafened).Scan(&state.ChannelID, &state.Muted, &state.Deafened, &state.JoinedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return voiceStateDTO{}, ErrVoiceNotConnected
		}
		return voiceStateDTO{}, fmt.Errorf("update deafen state: %w", err)
	}

	user, err := s.loadUser(ctx, userID)
	if err != nil {
		return voiceStateDTO{}, err
	}

	eventType := events.EventVoiceMute
	if !state.Muted {
		eventType = events.EventVoiceUnmute
	}

	workspaceID, err := s.workspaceIDForChannel(ctx, state.ChannelID)
	if err != nil {
		return voiceStateDTO{}, err
	}

	if err := s.publishVoiceStateEvent(ctx, eventType, userID, workspaceID, events.VoiceStatePayload{
		UserID:      user.ID,
		ChannelID:   state.ChannelID,
		Username:    user.Username,
		DisplayName: user.DisplayName,
		Muted:       state.Muted,
		Deafened:    state.Deafened,
		JoinedAt:    state.JoinedAt,
	}); err != nil {
		return voiceStateDTO{}, err
	}

	return state, nil
}

func (s *Service) SetSpeaking(ctx context.Context, userID, channelID string, speaking bool) error {
	channelID = strings.TrimSpace(channelID)
	if channelID == "" {
		return ErrVoiceNotConnected
	}

	var currentChannelID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT channel_id
		FROM voice_states
		WHERE user_id = $1
	`, userID).Scan(&currentChannelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrVoiceNotConnected
		}
		return fmt.Errorf("load voice state for speaking: %w", err)
	}
	if currentChannelID != channelID {
		return ErrVoiceNotConnected
	}

	changed := s.markSpeaking(userID, channelID, speaking)
	if !changed {
		return nil
	}

	eventType := events.EventVoiceSpeakingStop
	if speaking {
		eventType = events.EventVoiceSpeakingStart
	}

	return s.publishEvent(ctx, eventType, events.VoiceRoom(channelID), userID, events.VoiceSpeakingPayload{
		UserID:    userID,
		ChannelID: channelID,
	})
}

func (s *Service) loadChannelForUser(ctx context.Context, userID, channelID string) (channelRecord, error) {
	var item channelRecord
	err := s.db.Pool.QueryRow(ctx, `
		SELECT
			vc.id,
			vc.workspace_id,
			s.name,
			vc.name,
			vc.max_participants,
			vc.created_at
		FROM voice_channels vc
		JOIN servers s ON s.id = vc.workspace_id
		JOIN server_members sm ON sm.server_id = vc.workspace_id AND sm.user_id = $2
		WHERE vc.id = $1
	`, channelID, userID).Scan(
		&item.ID,
		&item.WorkspaceID,
		&item.WorkspaceName,
		&item.Name,
		&item.MaxParticipants,
		&item.CreatedAt,
	)
	if err == nil {
		return item, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return channelRecord{}, fmt.Errorf("load voice channel: %w", err)
	}

	var exists bool
	if err := s.db.Pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM voice_channels
			WHERE id = $1
		)
	`, channelID).Scan(&exists); err != nil {
		return channelRecord{}, fmt.Errorf("check voice channel exists: %w", err)
	}
	if !exists {
		return channelRecord{}, ErrVoiceChannelNotFound
	}

	return channelRecord{}, ErrVoiceForbidden
}

func (s *Service) memberRole(ctx context.Context, workspaceID, userID string) (string, error) {
	var role string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT role
		FROM server_members
		WHERE server_id = $1 AND user_id = $2
	`, workspaceID, userID).Scan(&role)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrVoiceForbidden
		}
		return "", fmt.Errorf("load workspace role: %w", err)
	}
	return role, nil
}

func (s *Service) listParticipants(ctx context.Context, channelID string) ([]participantRecord, error) {
	rows, err := s.db.Pool.Query(ctx, `
		SELECT
			vs.user_id,
			u.username,
			u.display_name,
			vs.muted,
			vs.deafened,
			vs.joined_at
		FROM voice_states vs
		JOIN users u ON u.id = vs.user_id
		WHERE vs.channel_id = $1
	`, channelID)
	if err != nil {
		return nil, fmt.Errorf("list voice participants for delete: %w", err)
	}
	defer rows.Close()

	items := make([]participantRecord, 0)
	for rows.Next() {
		var item participantRecord
		if err := rows.Scan(
			&item.UserID,
			&item.Username,
			&item.DisplayName,
			&item.Muted,
			&item.Deafened,
			&item.JoinedAt,
		); err != nil {
			return nil, fmt.Errorf("scan voice participant for delete: %w", err)
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate voice participants for delete: %w", err)
	}
	return items, nil
}

func (s *Service) loadUser(ctx context.Context, userID string) (userRecord, error) {
	var user userRecord
	err := s.db.Pool.QueryRow(ctx, `
		SELECT id, username, display_name
		FROM users
		WHERE id = $1
	`, userID).Scan(&user.ID, &user.Username, &user.DisplayName)
	if err != nil {
		return userRecord{}, fmt.Errorf("load user for voice: %w", err)
	}
	return user, nil
}

func (s *Service) countParticipants(ctx context.Context, channelID string) (int, error) {
	var count int
	err := s.db.Pool.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM voice_states
		WHERE channel_id = $1
	`, channelID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count voice participants: %w", err)
	}
	return count, nil
}

func (s *Service) countParticipantsTx(ctx context.Context, tx pgx.Tx, channelID string) (int, error) {
	var count int
	err := tx.QueryRow(ctx, `
		SELECT COUNT(*)::int
		FROM voice_states
		WHERE channel_id = $1
	`, channelID).Scan(&count)
	if err != nil {
		return 0, fmt.Errorf("count voice participants: %w", err)
	}
	return count, nil
}

func (s *Service) workspaceIDForChannel(ctx context.Context, channelID string) (string, error) {
	var workspaceID string
	err := s.db.Pool.QueryRow(ctx, `
		SELECT workspace_id
		FROM voice_channels
		WHERE id = $1
	`, channelID).Scan(&workspaceID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", nil
		}
		return "", fmt.Errorf("load workspace for voice channel: %w", err)
	}
	return workspaceID, nil
}

func (s *Service) publishVoiceStateEvent(
	ctx context.Context,
	eventType string,
	senderID string,
	workspaceID string,
	payload events.VoiceStatePayload,
) error {
	if err := s.publishEvent(ctx, eventType, events.VoiceRoom(payload.ChannelID), senderID, payload); err != nil {
		return err
	}

	workspaceID = strings.TrimSpace(workspaceID)
	if workspaceID == "" {
		return nil
	}

	if err := s.publishEvent(ctx, eventType, events.ServerRoom(workspaceID), senderID, payload); err != nil {
		return err
	}

	return nil
}

func (s *Service) publishEvent(ctx context.Context, eventType, room, senderID string, payload interface{}) error {
	if s.publisher == nil {
		return nil
	}

	event, err := events.NewEnvelope(eventType, room, senderID, payload)
	if err != nil {
		return fmt.Errorf("create voice event: %w", err)
	}

	if err := s.publisher.Publish(ctx, event); err != nil {
		return fmt.Errorf("publish voice event: %w", err)
	}

	return nil
}

func (s *Service) markSpeaking(userID, channelID string, speaking bool) bool {
	s.speakingMu.Lock()
	defer s.speakingMu.Unlock()

	current, ok := s.speakingUsers[userID]
	if speaking {
		if ok && current == channelID {
			return false
		}
		s.speakingUsers[userID] = channelID
		return true
	}

	if !ok || current != channelID {
		return false
	}
	delete(s.speakingUsers, userID)
	return true
}

func (s *Service) clearSpeaking(userID, channelID string) bool {
	s.speakingMu.Lock()
	defer s.speakingMu.Unlock()

	current, ok := s.speakingUsers[userID]
	if !ok || current != channelID {
		return false
	}
	delete(s.speakingUsers, userID)
	return true
}

func (s *Service) snapshotSpeaking() map[string]string {
	s.speakingMu.Lock()
	defer s.speakingMu.Unlock()

	out := make(map[string]string, len(s.speakingUsers))
	for userID, channelID := range s.speakingUsers {
		out[userID] = channelID
	}
	return out
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) {
		return pgErr.Code == "23505"
	}
	return false
}
