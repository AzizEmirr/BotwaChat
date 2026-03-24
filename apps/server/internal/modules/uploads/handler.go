package uploads

import (
	"log"
	"net/http"
	"strings"
	"time"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/middleware"
	"github.com/AzizEmirr/catwa/apps/server/internal/common/validation"
	"github.com/go-chi/chi/v5"
)

type Handler struct {
	service        *Service
	maxUploadBytes int64
}

func NewHandler(service *Service, maxUploadBytes int64) *Handler {
	return &Handler{service: service, maxUploadBytes: maxUploadBytes}
}

func (h *Handler) Routes(r chi.Router, authMiddleware func(http.Handler) http.Handler) {
	uploadLimiter := middleware.NewIPRateLimiter(1, 6, 5*time.Minute)
	accessLimiter := middleware.NewIPRateLimiter(4, 30, 5*time.Minute)
	r.With(authMiddleware, uploadLimiter.Middleware).Post("/uploads", h.Upload)
	r.With(authMiddleware, accessLimiter.Middleware).Get("/uploads/stream", h.StreamAuthorized)
}

func (h *Handler) ServePublic(w http.ResponseWriter, r *http.Request) {
	relativePath := strings.TrimPrefix(r.URL.Path, "/uploads/")
	if err := h.service.ServeFile(w, r, relativePath); err != nil {
		switch err {
		case ErrInvalidUploadPath, ErrAttachmentNotFound, ErrUploadAccessDenied:
			http.NotFound(w, r)
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to serve upload")
		}
	}
}

func (h *Handler) AccessURL(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		httpx.ValidationError(w, map[string]string{"path": "path is required"})
		return
	}

	accessURL, err := h.service.CreateAccessURL(r.Context(), userID, path)
	if err != nil {
		switch err {
		case ErrInvalidUploadPath:
			httpx.ValidationError(w, map[string]string{"path": "invalid upload path"})
		case ErrAttachmentNotFound:
			http.NotFound(w, r)
		case ErrForbidden:
			// Hide attachment existence from non-members to reduce path enumeration signal.
			http.NotFound(w, r)
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to generate upload access url")
		}
		return
	}

	httpx.JSON(w, http.StatusOK, accessURL)
}

func (h *Handler) StreamAuthorized(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	path := strings.TrimSpace(r.URL.Query().Get("path"))
	if path == "" {
		httpx.ValidationError(w, map[string]string{"path": "path is required"})
		return
	}

	if err := h.service.ServeAuthorized(w, r, userID, path); err != nil {
		switch err {
		case ErrInvalidUploadPath:
			httpx.ValidationError(w, map[string]string{"path": "invalid upload path"})
		case ErrAttachmentNotFound, ErrForbidden, ErrUploadAccessDenied:
			http.NotFound(w, r)
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to serve upload")
		}
	}
}

func (h *Handler) Upload(w http.ResponseWriter, r *http.Request) {
	userID, ok := middleware.UserIDFromContext(r.Context())
	if !ok {
		httpx.Error(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, h.maxUploadBytes+(1<<20))
	if err := ParseMultipart(r, h.maxUploadBytes); err != nil {
		httpx.Error(w, http.StatusBadRequest, "invalid multipart form")
		return
	}

	file, header, err := r.FormFile("file")
	if err != nil {
		httpx.ValidationError(w, map[string]string{"file": "file is required"})
		return
	}
	defer file.Close()

	messageIDValue := strings.TrimSpace(r.FormValue("messageId"))
	var messageID *string
	if messageIDValue != "" {
		if !validation.IsUUID(messageIDValue) {
			httpx.ValidationError(w, map[string]string{"messageId": "invalid uuid"})
			return
		}
		messageID = &messageIDValue
	}

	attachment, err := h.service.Save(r.Context(), userID, file, header, messageID)
	if err != nil {
		switch err {
		case ErrFileTooLarge:
			httpx.Error(w, http.StatusRequestEntityTooLarge, "file too large")
		case ErrForbidden:
			httpx.Error(w, http.StatusForbidden, "cannot attach to this message")
		case ErrDangerousFileType:
			httpx.Error(w, http.StatusUnsupportedMediaType, "blocked file type")
		case ErrInvalidFileType:
			httpx.Error(w, http.StatusUnsupportedMediaType, "unsupported file type")
		default:
			httpx.Error(w, http.StatusInternalServerError, "failed to upload file")
		}
		return
	}

	log.Printf(
		"security_event=upload_created user_id=%s attachment_id=%s file_path=%s file_size=%d",
		userID,
		attachment.ID,
		attachment.FilePath,
		attachment.FileSize,
	)
	httpx.JSON(w, http.StatusCreated, attachment)
}
