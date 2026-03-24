package voice

import (
	"context"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/livekit/protocol/auth"
	"github.com/livekit/protocol/livekit"
	lksdk "github.com/livekit/server-sdk-go/v2"
)

type identity struct {
	UserID      string
	Username    string
	DisplayName string
}

type LiveKitClient struct {
	apiURL     string
	publicURL  string
	apiKey     string
	apiSecret  string
	roomPrefix string
	tokenTTL   time.Duration
	roomClient *lksdk.RoomServiceClient
}

var roomNamePattern = regexp.MustCompile(`^[a-zA-Z0-9._:-]{1,128}$`)

func NewLiveKitClient(apiURL, publicURL, apiKey, apiSecret, roomPrefix string, tokenTTL time.Duration) (*LiveKitClient, error) {
	if strings.TrimSpace(apiURL) == "" {
		return nil, fmt.Errorf("livekit url is required")
	}
	if strings.TrimSpace(publicURL) == "" {
		return nil, fmt.Errorf("livekit public url is required")
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("livekit api key is required")
	}
	if strings.TrimSpace(apiSecret) == "" {
		return nil, fmt.Errorf("livekit api secret is required")
	}
	if strings.TrimSpace(roomPrefix) == "" {
		return nil, fmt.Errorf("voice room prefix is required")
	}
	if tokenTTL <= 0 {
		return nil, fmt.Errorf("voice token ttl must be positive")
	}

	return &LiveKitClient{
		apiURL:     strings.TrimSpace(apiURL),
		publicURL:  strings.TrimSpace(publicURL),
		apiKey:     strings.TrimSpace(apiKey),
		apiSecret:  strings.TrimSpace(apiSecret),
		roomPrefix: strings.TrimSpace(roomPrefix),
		tokenTTL:   tokenTTL,
		roomClient: lksdk.NewRoomServiceClient(strings.TrimSpace(apiURL), strings.TrimSpace(apiKey), strings.TrimSpace(apiSecret)),
	}, nil
}

func (c *LiveKitClient) URL() string {
	return c.publicURL
}

func (c *LiveKitClient) RoomName(channelID string) (string, error) {
	trimmedChannelID := strings.TrimSpace(channelID)
	if _, err := uuid.Parse(trimmedChannelID); err != nil {
		return "", fmt.Errorf("invalid voice channel id")
	}

	roomName := c.roomPrefix + trimmedChannelID
	if !roomNamePattern.MatchString(roomName) {
		return "", fmt.Errorf("invalid livekit room name")
	}

	return roomName, nil
}

func (c *LiveKitClient) EnsureRoom(ctx context.Context, roomName string, maxParticipants int) error {
	if maxParticipants <= 0 {
		return fmt.Errorf("max participants must be positive")
	}
	if maxParticipants > math.MaxUint32 {
		return fmt.Errorf("max participants exceeds uint32")
	}

	_, err := c.roomClient.CreateRoom(ctx, &livekit.CreateRoomRequest{
		Name:            roomName,
		MaxParticipants: uint32(maxParticipants),
	})
	if err == nil {
		return nil
	}

	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "already exists") {
		return nil
	}

	return fmt.Errorf("create livekit room: %w", err)
}

func (c *LiveKitClient) IssueToken(subject identity, roomName string) (string, error) {
	accessToken := auth.NewAccessToken(c.apiKey, c.apiSecret)
	accessToken.SetIdentity(strings.TrimSpace(subject.UserID))
	accessToken.SetName(strings.TrimSpace(subject.DisplayName))
	accessToken.SetValidFor(c.tokenTTL)
	accessToken.AddGrant(&auth.VideoGrant{
		RoomJoin:       true,
		Room:           roomName,
		CanPublish:     boolPointer(true),
		CanSubscribe:   boolPointer(true),
		CanPublishData: boolPointer(true),
	})

	token, err := accessToken.ToJWT()
	if err != nil {
		return "", fmt.Errorf("generate livekit token: %w", err)
	}

	return token, nil
}

func boolPointer(value bool) *bool {
	return &value
}
