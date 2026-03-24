package uploads

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	mimestd "mime"
	"mime/multipart"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/AzizEmirr/catwa/apps/server/internal/common/database"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
)

var (
	ErrFileTooLarge       = errors.New("file_too_large")
	ErrForbidden          = errors.New("forbidden")
	ErrInvalidFileType    = errors.New("invalid_file_type")
	ErrDangerousFileType  = errors.New("dangerous_file_type")
	ErrInvalidUploadPath  = errors.New("invalid_upload_path")
	ErrAttachmentNotFound = errors.New("attachment_not_found")
	ErrUploadAccessDenied = errors.New("upload_access_denied")
)

type uploadTypeRule struct {
	CanonicalMIME string
	AllowedMIMEs  map[string]struct{}
	Inline        bool
}

var uploadRules = map[string]uploadTypeRule{
	".png": {
		CanonicalMIME: "image/png",
		AllowedMIMEs: map[string]struct{}{
			"image/png": {},
		},
		Inline: true,
	},
	".jpg": {
		CanonicalMIME: "image/jpeg",
		AllowedMIMEs: map[string]struct{}{
			"image/jpeg": {},
		},
		Inline: true,
	},
	".jpeg": {
		CanonicalMIME: "image/jpeg",
		AllowedMIMEs: map[string]struct{}{
			"image/jpeg": {},
		},
		Inline: true,
	},
	".gif": {
		CanonicalMIME: "image/gif",
		AllowedMIMEs: map[string]struct{}{
			"image/gif": {},
		},
		Inline: true,
	},
	".webp": {
		CanonicalMIME: "image/webp",
		AllowedMIMEs: map[string]struct{}{
			"image/webp": {},
		},
		Inline: true,
	},
	".bmp": {
		CanonicalMIME: "image/bmp",
		AllowedMIMEs: map[string]struct{}{
			"image/bmp": {},
		},
		Inline: true,
	},
	".pdf": {
		CanonicalMIME: "application/pdf",
		AllowedMIMEs: map[string]struct{}{
			"application/pdf": {},
		},
		Inline: false,
	},
	".txt": {
		CanonicalMIME: "text/plain; charset=utf-8",
		AllowedMIMEs: map[string]struct{}{
			"text/plain": {},
		},
		Inline: false,
	},
	".md": {
		CanonicalMIME: "text/plain; charset=utf-8",
		AllowedMIMEs: map[string]struct{}{
			"text/plain": {},
		},
		Inline: false,
	},
	".csv": {
		CanonicalMIME: "text/csv; charset=utf-8",
		AllowedMIMEs: map[string]struct{}{
			"text/plain": {},
			"text/csv":   {},
		},
		Inline: false,
	},
	".zip": {
		CanonicalMIME: "application/zip",
		AllowedMIMEs: map[string]struct{}{
			"application/zip":              {},
			"application/x-zip-compressed": {},
		},
		Inline: false,
	},
	".mp4": {
		CanonicalMIME: "video/mp4",
		AllowedMIMEs: map[string]struct{}{
			"video/mp4": {},
		},
		Inline: true,
	},
	".mp3": {
		CanonicalMIME: "audio/mpeg",
		AllowedMIMEs: map[string]struct{}{
			"audio/mpeg": {},
		},
		Inline: true,
	},
	".wav": {
		CanonicalMIME: "audio/wav",
		AllowedMIMEs: map[string]struct{}{
			"audio/wav":   {},
			"audio/x-wav": {},
		},
		Inline: true,
	},
}

var dangerousExtensions = map[string]struct{}{
	".html":  {},
	".htm":   {},
	".svg":   {},
	".js":    {},
	".mjs":   {},
	".cjs":   {},
	".exe":   {},
	".dll":   {},
	".bat":   {},
	".cmd":   {},
	".ps1":   {},
	".php":   {},
	".phtml": {},
	".sh":    {},
	".jar":   {},
	".msi":   {},
	".com":   {},
	".scr":   {},
}

type Service struct {
	db                 *database.DB
	uploadsPath        string
	maxUploadBytes     int64
	uploadAccessSecret []byte
	uploadAccessTTL    time.Duration
}

func NewService(
	db *database.DB,
	uploadsPath string,
	maxUploadBytes int64,
	uploadAccessSecret string,
	uploadAccessTTL time.Duration,
) (*Service, error) {
	if err := os.MkdirAll(uploadsPath, 0o750); err != nil {
		return nil, fmt.Errorf("create uploads path: %w", err)
	}
	if strings.TrimSpace(uploadAccessSecret) == "" {
		return nil, fmt.Errorf("upload access secret is required")
	}
	if uploadAccessTTL <= 0 {
		return nil, fmt.Errorf("upload access ttl must be positive")
	}

	return &Service{
		db:                 db,
		uploadsPath:        uploadsPath,
		maxUploadBytes:     maxUploadBytes,
		uploadAccessSecret: []byte(uploadAccessSecret),
		uploadAccessTTL:    uploadAccessTTL,
	}, nil
}

func (s *Service) Save(ctx context.Context, userID string, file multipart.File, header *multipart.FileHeader, messageID *string) (attachmentDTO, error) {
	if messageID != nil {
		var exists bool
		err := s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM messages
				WHERE id = $1 AND sender_id = $2
			)
		`, *messageID, userID).Scan(&exists)
		if err != nil {
			return attachmentDTO{}, fmt.Errorf("validate message ownership: %w", err)
		}
		if !exists {
			return attachmentDTO{}, ErrForbidden
		}
	}

	originalName := sanitizeOriginalName(header.Filename)
	ext := strings.ToLower(filepath.Ext(originalName))
	if _, blocked := dangerousExtensions[ext]; blocked {
		return attachmentDTO{}, ErrDangerousFileType
	}

	rule, ok := uploadRules[ext]
	if !ok {
		return attachmentDTO{}, ErrInvalidFileType
	}

	detectedMIME, sniffBuffer, err := detectUploadedMIME(file)
	if err != nil {
		return attachmentDTO{}, fmt.Errorf("detect upload mime: %w", err)
	}
	if _, allowed := rule.AllowedMIMEs[detectedMIME]; !allowed {
		return attachmentDTO{}, ErrInvalidFileType
	}
	if !validateFileSignature(ext, sniffBuffer, detectedMIME) {
		return attachmentDTO{}, ErrInvalidFileType
	}

	relativeDir := time.Now().UTC().Format("2006/01/02")
	targetDir := filepath.Join(s.uploadsPath, relativeDir)
	if err := os.MkdirAll(targetDir, 0o750); err != nil {
		return attachmentDTO{}, fmt.Errorf("create target dir: %w", err)
	}

	storedName := uuid.NewString() + ext
	relativePath := filepath.ToSlash(filepath.Join(relativeDir, storedName))
	root, err := os.OpenRoot(s.uploadsPath)
	if err != nil {
		return attachmentDTO{}, fmt.Errorf("open uploads root: %w", err)
	}
	defer root.Close()

	dst, err := root.OpenFile(filepath.FromSlash(relativePath), os.O_CREATE|os.O_WRONLY|os.O_EXCL, 0o600)
	if err != nil {
		return attachmentDTO{}, fmt.Errorf("create file: %w", err)
	}
	defer dst.Close()

	limitedReader := io.LimitReader(file, s.maxUploadBytes+1)
	n, err := io.Copy(dst, limitedReader)
	if err != nil {
		_ = root.Remove(filepath.FromSlash(relativePath))
		return attachmentDTO{}, fmt.Errorf("write file: %w", err)
	}
	if n > s.maxUploadBytes {
		_ = root.Remove(filepath.FromSlash(relativePath))
		return attachmentDTO{}, ErrFileTooLarge
	}
	if n <= 0 {
		_ = root.Remove(filepath.FromSlash(relativePath))
		return attachmentDTO{}, ErrInvalidFileType
	}

	var created attachmentDTO
	err = s.db.Pool.QueryRow(ctx, `
		INSERT INTO attachments (message_id, uploaded_by, file_path, mime_type, file_size, original_name)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, message_id, file_path, mime_type, file_size, original_name, uploaded_at
	`, messageID, userID, relativePath, rule.CanonicalMIME, n, originalName).Scan(
		&created.ID,
		&created.MessageID,
		&created.FilePath,
		&created.MimeType,
		&created.FileSize,
		&created.OriginalName,
		&created.UploadedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_ = root.Remove(filepath.FromSlash(relativePath))
			return attachmentDTO{}, fmt.Errorf("attachment insert failed")
		}
		_ = root.Remove(filepath.FromSlash(relativePath))
		return attachmentDTO{}, fmt.Errorf("insert attachment: %w", err)
	}

	return created, nil
}

func (s *Service) CreateAccessURL(ctx context.Context, userID, rawPath string) (accessURLDTO, error) {
	normalizedRelative, err := normalizeRequestedPath(rawPath)
	if err != nil {
		return accessURLDTO{}, err
	}

	allowed, err := s.canUserAccessPath(ctx, userID, normalizedRelative)
	if err != nil {
		return accessURLDTO{}, err
	}
	if !allowed {
		return accessURLDTO{}, ErrForbidden
	}

	expiresAt := time.Now().UTC().Add(s.uploadAccessTTL)
	return accessURLDTO{
		SignedPath: s.buildSignedPath(normalizedRelative, expiresAt.Unix()),
		ExpiresAt:  expiresAt,
	}, nil
}

func (s *Service) canUserAccessPath(ctx context.Context, userID, normalizedRelative string) (bool, error) {
	var (
		uploadedBy       string
		conversationType sql.NullString
		conversationID   sql.NullString
	)

	err := s.db.Pool.QueryRow(ctx, `
		SELECT a.uploaded_by::text, m.conversation_type, m.conversation_id::text
		FROM attachments a
		LEFT JOIN messages m ON m.id = a.message_id
		WHERE a.file_path = $1
		ORDER BY a.uploaded_at DESC
		LIMIT 1
	`, normalizedRelative).Scan(&uploadedBy, &conversationType, &conversationID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, ErrAttachmentNotFound
		}
		return false, fmt.Errorf("load attachment access scope: %w", err)
	}

	if conversationType.Valid && conversationID.Valid {
		return s.isConversationParticipant(ctx, userID, conversationType.String, conversationID.String)
	}

	return uploadedBy == userID, nil
}

func (s *Service) isConversationParticipant(ctx context.Context, userID, conversationType, conversationID string) (bool, error) {
	switch strings.TrimSpace(conversationType) {
	case "channel":
		var isMember bool
		err := s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM channels c
				JOIN server_members sm ON sm.server_id = c.server_id
				WHERE c.id = $1
				  AND sm.user_id = $2
			)
		`, conversationID, userID).Scan(&isMember)
		if err != nil {
			return false, fmt.Errorf("check channel access: %w", err)
		}
		return isMember, nil
	case "dm":
		var isMember bool
		err := s.db.Pool.QueryRow(ctx, `
			SELECT EXISTS (
				SELECT 1
				FROM direct_conversation_members
				WHERE conversation_id = $1
				  AND user_id = $2
			)
		`, conversationID, userID).Scan(&isMember)
		if err != nil {
			return false, fmt.Errorf("check dm access: %w", err)
		}
		return isMember, nil
	default:
		return false, nil
	}
}

func (s *Service) buildSignedPath(normalizedRelative string, expiresUnix int64) string {
	signature := s.signUploadPath(normalizedRelative, expiresUnix)
	return fmt.Sprintf("/uploads/%s?exp=%d&sig=%s", normalizedRelative, expiresUnix, signature)
}

func (s *Service) signUploadPath(normalizedRelative string, expiresUnix int64) string {
	mac := hmac.New(sha256.New, s.uploadAccessSecret)
	mac.Write([]byte(normalizedRelative))
	mac.Write([]byte{'\n'})
	mac.Write([]byte(strconv.FormatInt(expiresUnix, 10)))
	return hex.EncodeToString(mac.Sum(nil))
}

func (s *Service) verifySignedAccess(normalizedRelative, expRaw, sigRaw string) error {
	if strings.TrimSpace(expRaw) == "" || strings.TrimSpace(sigRaw) == "" {
		return ErrUploadAccessDenied
	}

	expiresUnix, err := strconv.ParseInt(strings.TrimSpace(expRaw), 10, 64)
	if err != nil || expiresUnix <= 0 {
		return ErrUploadAccessDenied
	}
	if time.Now().UTC().Unix() > expiresUnix {
		return ErrUploadAccessDenied
	}

	providedSig := strings.ToLower(strings.TrimSpace(sigRaw))
	expectedSig := s.signUploadPath(normalizedRelative, expiresUnix)
	if subtle.ConstantTimeCompare([]byte(providedSig), []byte(expectedSig)) != 1 {
		return ErrUploadAccessDenied
	}

	return nil
}

func (s *Service) ServeFile(w http.ResponseWriter, r *http.Request, relativePath string) error {
	normalizedRelative, err := normalizeRelativePath(relativePath)
	if err != nil {
		return err
	}
	if err := s.verifySignedAccess(normalizedRelative, r.URL.Query().Get("exp"), r.URL.Query().Get("sig")); err != nil {
		return err
	}

	return s.serveNormalizedFile(w, r, normalizedRelative)
}

func (s *Service) ServeAuthorized(w http.ResponseWriter, r *http.Request, userID, rawPath string) error {
	normalizedRelative, err := normalizeRequestedPath(rawPath)
	if err != nil {
		return err
	}

	allowed, err := s.canUserAccessPath(r.Context(), userID, normalizedRelative)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrForbidden
	}

	return s.serveNormalizedFile(w, r, normalizedRelative)
}

func (s *Service) serveNormalizedFile(w http.ResponseWriter, r *http.Request, normalizedRelative string) error {

	fullPath := filepath.Join(s.uploadsPath, filepath.FromSlash(normalizedRelative))
	cleanBase := filepath.Clean(s.uploadsPath)
	cleanFile := filepath.Clean(fullPath)
	if cleanFile != cleanBase && !strings.HasPrefix(cleanFile, cleanBase+string(filepath.Separator)) {
		return ErrInvalidUploadPath
	}

	file, err := os.Open(cleanFile)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return ErrAttachmentNotFound
		}
		return fmt.Errorf("open upload file: %w", err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		return fmt.Errorf("stat upload file: %w", err)
	}
	if stat.IsDir() {
		return ErrAttachmentNotFound
	}

	sniffBuffer := make([]byte, 512)
	sniffBytes, readErr := file.Read(sniffBuffer)
	if readErr != nil && !errors.Is(readErr, io.EOF) {
		return fmt.Errorf("read upload file: %w", readErr)
	}
	sniffBuffer = sniffBuffer[:sniffBytes]
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return fmt.Errorf("seek upload file: %w", err)
	}

	contentType := normalizeDetectedMIME(http.DetectContentType(sniffBuffer))
	ext := strings.ToLower(filepath.Ext(normalizedRelative))
	rule, hasRule := uploadRules[ext]
	if hasRule {
		if !validateFileSignature(ext, sniffBuffer, contentType) {
			return ErrAttachmentNotFound
		}
		if _, allowed := rule.AllowedMIMEs[contentType]; allowed {
			contentType = rule.CanonicalMIME
		}
	}

	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Cache-Control", "private, no-store")
	w.Header().Set("Cross-Origin-Resource-Policy", "cross-origin")
	w.Header().Set("Content-Security-Policy", "sandbox")
	w.Header().Set("Content-Type", contentType)

	disposition := "attachment"
	if hasRule && rule.Inline {
		disposition = "inline"
	}
	if mediaType := mimestd.FormatMediaType(disposition, map[string]string{"filename": filepath.Base(normalizedRelative)}); mediaType != "" {
		w.Header().Set("Content-Disposition", mediaType)
	}

	http.ServeContent(w, r, filepath.Base(normalizedRelative), stat.ModTime(), file)
	return nil
}

func detectUploadedMIME(file multipart.File) (string, []byte, error) {
	sniffBuffer := make([]byte, 512)
	sniffBytes, err := file.Read(sniffBuffer)
	if err != nil && !errors.Is(err, io.EOF) {
		return "", nil, err
	}
	sniffBuffer = sniffBuffer[:sniffBytes]

	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return "", nil, err
	}

	return normalizeDetectedMIME(http.DetectContentType(sniffBuffer)), sniffBuffer, nil
}

func normalizeDetectedMIME(value string) string {
	mediaType, _, err := mimestd.ParseMediaType(value)
	if err == nil {
		return strings.ToLower(strings.TrimSpace(mediaType))
	}
	return strings.ToLower(strings.TrimSpace(value))
}

func validateFileSignature(ext string, sniffBuffer []byte, detectedMIME string) bool {
	switch ext {
	case ".png":
		return detectedMIME == "image/png" && bytes.HasPrefix(sniffBuffer, []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'})
	case ".jpg", ".jpeg":
		return detectedMIME == "image/jpeg" && len(sniffBuffer) >= 3 && sniffBuffer[0] == 0xff && sniffBuffer[1] == 0xd8 && sniffBuffer[2] == 0xff
	case ".gif":
		return detectedMIME == "image/gif" && (bytes.HasPrefix(sniffBuffer, []byte("GIF87a")) || bytes.HasPrefix(sniffBuffer, []byte("GIF89a")))
	case ".webp":
		return detectedMIME == "image/webp" && len(sniffBuffer) >= 12 && bytes.HasPrefix(sniffBuffer, []byte("RIFF")) && bytes.Equal(sniffBuffer[8:12], []byte("WEBP"))
	case ".bmp":
		return detectedMIME == "image/bmp" && bytes.HasPrefix(sniffBuffer, []byte("BM"))
	case ".pdf":
		return detectedMIME == "application/pdf" && bytes.HasPrefix(sniffBuffer, []byte("%PDF-"))
	case ".zip":
		return (detectedMIME == "application/zip" || detectedMIME == "application/x-zip-compressed") &&
			(bytes.HasPrefix(sniffBuffer, []byte("PK\x03\x04")) || bytes.HasPrefix(sniffBuffer, []byte("PK\x05\x06")) || bytes.HasPrefix(sniffBuffer, []byte("PK\x07\x08")))
	case ".mp4":
		return detectedMIME == "video/mp4" && len(sniffBuffer) >= 12 && bytes.Equal(sniffBuffer[4:8], []byte("ftyp"))
	case ".mp3":
		return detectedMIME == "audio/mpeg" && (bytes.HasPrefix(sniffBuffer, []byte("ID3")) || (len(sniffBuffer) >= 2 && sniffBuffer[0] == 0xff && sniffBuffer[1]&0xe0 == 0xe0))
	case ".wav":
		return (detectedMIME == "audio/wav" || detectedMIME == "audio/x-wav") &&
			len(sniffBuffer) >= 12 &&
			bytes.HasPrefix(sniffBuffer, []byte("RIFF")) &&
			bytes.Equal(sniffBuffer[8:12], []byte("WAVE"))
	case ".txt", ".md", ".csv":
		return (detectedMIME == "text/plain" || detectedMIME == "text/csv") && !bytes.Contains(sniffBuffer, []byte{0x00})
	default:
		return false
	}
}

func sanitizeOriginalName(name string) string {
	base := filepath.Base(strings.TrimSpace(name))
	if base == "" || base == "." || base == string(filepath.Separator) {
		return "file.bin"
	}

	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z':
			return r
		case r >= 'A' && r <= 'Z':
			return r
		case r >= '0' && r <= '9':
			return r
		case r == '.', r == '-', r == '_', r == ' ':
			return r
		default:
			return '-'
		}
	}, base)

	if len(base) > 180 {
		base = base[:180]
	}

	trimmed := strings.TrimSpace(base)
	if trimmed == "" {
		return "file.bin"
	}
	return trimmed
}

func normalizeRelativePath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	trimmed = strings.TrimPrefix(trimmed, "/")
	if trimmed == "" {
		return "", ErrInvalidUploadPath
	}

	cleaned := filepath.ToSlash(filepath.Clean(trimmed))
	if cleaned == "." || strings.HasPrefix(cleaned, "../") || strings.Contains(cleaned, "/../") {
		return "", ErrInvalidUploadPath
	}

	return cleaned, nil
}

func normalizeRequestedPath(value string) (string, error) {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", ErrInvalidUploadPath
	}

	if strings.HasPrefix(trimmed, "http://") || strings.HasPrefix(trimmed, "https://") {
		parsed, err := url.Parse(trimmed)
		if err != nil {
			return "", ErrInvalidUploadPath
		}
		trimmed = parsed.Path
	}

	trimmed = strings.TrimPrefix(trimmed, "/uploads/")
	trimmed = strings.TrimPrefix(trimmed, "uploads/")
	trimmed = strings.TrimPrefix(trimmed, "/")

	return normalizeRelativePath(trimmed)
}

func ParseMultipart(r *http.Request, maxUploadBytes int64) error {
	// #nosec G120 -- MAX_UPLOAD_BYTES + small metadata budget is enforced by caller and service configuration.
	if err := r.ParseMultipartForm(maxUploadBytes + (1 << 20)); err != nil {
		return err
	}
	return nil
}

func removeWithinRoot(rootPath, candidatePath string) {
	cleanRoot := filepath.Clean(strings.TrimSpace(rootPath))
	cleanCandidate := filepath.Clean(strings.TrimSpace(candidatePath))
	if cleanRoot == "" || cleanCandidate == "" {
		return
	}
	if cleanCandidate != cleanRoot && !strings.HasPrefix(cleanCandidate, cleanRoot+string(filepath.Separator)) {
		return
	}
	_ = os.Remove(cleanCandidate)
}
