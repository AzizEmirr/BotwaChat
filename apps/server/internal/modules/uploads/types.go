package uploads

import "time"

type attachmentDTO struct {
	ID           string    `json:"id"`
	MessageID    *string   `json:"messageId,omitempty"`
	FilePath     string    `json:"filePath"`
	MimeType     string    `json:"mimeType"`
	FileSize     int64     `json:"fileSize"`
	OriginalName string    `json:"originalName"`
	UploadedAt   time.Time `json:"uploadedAt"`
}

type accessURLDTO struct {
	SignedPath string    `json:"signedPath"`
	ExpiresAt  time.Time `json:"expiresAt"`
}
