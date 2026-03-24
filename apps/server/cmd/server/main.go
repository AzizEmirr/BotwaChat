package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/config"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	appmw "github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/security"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/auth"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/channels"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/dms"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/friends"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/messages"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/notifications"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/servers"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/uploads"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/users"
	"github.com/AzizEmirr/catwa/apps/server/internal/modules/voice"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/events"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/gateway"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/notifier"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/presence"
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/typing"
	socket "github.com/AzizEmirr/catwa/apps/server/internal/realtime/websocket"
	"github.com/AzizEmirr/catwa/apps/server/internal/router"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("failed to load configuration: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	if err := os.MkdirAll(cfg.StoragePath, 0o750); err != nil {
		log.Fatalf("failed to create storage path: %v", err)
	}
	if err := os.MkdirAll(cfg.UploadsPath, 0o750); err != nil {
		log.Fatalf("failed to create uploads path: %v", err)
	}

	db, err := database.New(ctx, cfg.PostgresURL)
	if err != nil {
		log.Fatalf("failed to initialize database: %v", err)
	}
	defer db.Close()

	if err := appmw.SetTrustedProxyCIDRs(cfg.TrustedProxyCIDRs); err != nil {
		log.Fatalf("failed to configure trusted proxy cidrs: %v", err)
	}

	tokenManager := security.NewTokenManager(
		cfg.JWTIssuer,
		cfg.JWTAudience,
		cfg.JWTAccessSecret,
		cfg.JWTRefreshSecret,
		cfg.AccessTokenTTL,
		cfg.RefreshTokenTTL,
	)

	realtimeNotifier, err := notifier.NewPostgresNotifier(db.Pool, cfg.WSNotifyChannel)
	if err != nil {
		log.Fatalf("failed to initialize postgres notifier: %v", err)
	}

	connectionManager := socket.NewConnectionManager()
	presenceService := presence.NewService(db, realtimeNotifier)
	liveKitClient, err := voice.NewLiveKitClient(
		cfg.LiveKitURL,
		cfg.LiveKitPublicURL,
		cfg.LiveKitAPIKey,
		cfg.LiveKitAPISecret,
		cfg.VoiceRoomPrefix,
		cfg.VoiceTokenTTL,
	)
	if err != nil {
		log.Fatalf("failed to initialize livekit client: %v", err)
	}
	voiceService := voice.NewService(db, realtimeNotifier, liveKitClient, cfg.VoiceMaxCapacity, cfg.VoiceDisconnectTTL)
	connectionManager.SetConnectionHooks(
		func(_ context.Context, userID string) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			presenceService.UserConnected(ctx, userID)
			voiceService.UserConnected(userID)
		},
		func(_ context.Context, userID string) {
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
			defer cancel()
			presenceService.UserDisconnected(ctx, userID)
			voiceService.UserDisconnected(userID)
		},
	)

	roomAuthorizer := socket.NewDBRoomAuthorizer(db)
	typingManager := typing.NewManager(cfg.WSTypingTimeout, realtimeNotifier)
	websocketGateway := gateway.New(gateway.Config{
		AllowedOrigins:    cfg.WSAllowedOrigins,
		AllowEmptyOrigin:  cfg.WSAllowEmptyOrigin,
		HeartbeatInterval: cfg.WSHeartbeat,
		ReconnectAfter:    cfg.WSReconnectAfter,
		MaxMessageBytes:   cfg.WSMaxMessageSize,
		QueueSize:         cfg.WSQueueSize,
		ActionRPS:         20,
		ActionBurst:       60,
	}, connectionManager, socket.NewSocketAuthenticator(tokenManager), roomAuthorizer, typingManager, voiceService)

	subscriber := notifier.NewSubscriber(realtimeNotifier, func(_ context.Context, event events.Envelope) error {
		connectionManager.PublishRoom(event)
		return nil
	})
	go func() {
		if err := subscriber.Run(ctx); err != nil && !errors.Is(err, context.Canceled) {
			log.Printf("realtime subscriber stopped: %v", err)
		}
	}()

	authService := auth.NewService(db, tokenManager)
	turnstileVerifier := security.NewTurnstileVerifier(cfg.TurnstileSecretKey, cfg.TurnstileVerifyURL)
	usersService := users.NewService(db, presenceService)
	serversService := servers.NewService(db, realtimeNotifier)
	channelsService := channels.NewService(db, realtimeNotifier)
	messagesService := messages.NewService(db, realtimeNotifier)
	dmsService := dms.NewService(db, realtimeNotifier)
	friendsService := friends.NewService(db, realtimeNotifier)
	voiceModuleHandler := voice.NewHandler(voiceService)
	notificationsService := notifications.NewService(db)
	uploadsService, err := uploads.NewService(
		db,
		cfg.UploadsPath,
		cfg.MaxUploadBytes,
		cfg.UploadAccessSecret,
		cfg.UploadAccessTTL,
	)
	if err != nil {
		log.Fatalf("failed to initialize upload service: %v", err)
	}

	r := router.New(cfg, tokenManager, router.Handlers{
		Auth:          auth.NewHandler(authService, turnstileVerifier, cfg.TurnstileAllowDesktopBypass),
		Users:         users.NewHandler(usersService),
		Servers:       servers.NewHandler(serversService, turnstileVerifier, cfg.TurnstileEnforceServerInvite),
		Channels:      channels.NewHandler(channelsService),
		Messages:      messages.NewHandler(messagesService),
		DMs:           dms.NewHandler(dmsService),
		Friends:       friends.NewHandler(friendsService),
		Voice:         voiceModuleHandler,
		Uploads:       uploads.NewHandler(uploadsService, cfg.MaxUploadBytes),
		Notifications: notifications.NewHandler(notificationsService),
		WebSocket:     websocketGateway,
	})

	srv := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           r,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,
		IdleTimeout:       90 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	go func() {
		log.Printf("server listening on %s", cfg.HTTPAddr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server failed: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}

	log.Println("server stopped")
}
