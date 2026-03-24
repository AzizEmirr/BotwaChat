package router

import (
	"net/http"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/config"
	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
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
	"github.com/AzizEmirr/catwa/apps/server/internal/realtime/gateway"
	"github.com/go-chi/chi/v5"
	chimw "github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Handlers struct {
	Auth          *auth.Handler
	Users         *users.Handler
	Servers       *servers.Handler
	Channels      *channels.Handler
	Messages      *messages.Handler
	DMs           *dms.Handler
	Friends       *friends.Handler
	Voice         *voice.Handler
	Uploads       *uploads.Handler
	Notifications *notifications.Handler
	WebSocket     *gateway.Gateway
}

func New(cfg config.Config, tokenManager *security.TokenManager, handlers Handlers) http.Handler {
	r := chi.NewRouter()

	r.Use(chimw.RequestID)
	r.Use(chimw.RealIP)
	r.Use(appmw.RedactQueryParams("access_token", "refresh_token", "token"))
	r.Use(chimw.Logger)
	r.Use(appmw.SecurityHeaders())
	r.Use(chimw.Recoverer)
	r.Use(chimw.Timeout(30 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.CORSAllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	globalLimiter := appmw.NewIPRateLimiter(cfg.RateLimitRPS, cfg.RateLimitBurst, 5*time.Minute)
	r.Use(globalLimiter.Middleware)

	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		httpx.JSON(w, http.StatusOK, map[string]string{
			"status": "ok",
		})
	})
	r.Get("/uploads/*", handlers.Uploads.ServePublic)

	websocketLimiter := appmw.NewIPRateLimiter(2, 10, 5*time.Minute)
	r.With(websocketLimiter.Middleware).Get("/ws", handlers.WebSocket.HandleWS)

	authMiddleware := appmw.RequireJWT(tokenManager)
	authRateLimiter := appmw.NewIPRateLimiter(1, 5, 5*time.Minute)

	r.Route("/api/v1", func(api chi.Router) {
		api.Use(appmw.APINoStore())

		api.Group(func(authGroup chi.Router) {
			authGroup.Use(authRateLimiter.Middleware)
			handlers.Auth.Routes(authGroup, authMiddleware)
		})

		handlers.Users.Routes(api, authMiddleware)
		handlers.Servers.Routes(api, authMiddleware)
		handlers.Channels.Routes(api, authMiddleware)
		handlers.Messages.Routes(api, authMiddleware)
		handlers.DMs.Routes(api, authMiddleware)
		handlers.Friends.Routes(api, authMiddleware)
		handlers.Voice.Routes(api, authMiddleware)
		handlers.Uploads.Routes(api, authMiddleware)
		handlers.Notifications.Routes(api, authMiddleware)
	})

	return r
}
