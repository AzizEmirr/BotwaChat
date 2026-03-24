package uploads

import (
	"errors"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestNormalizeRequestedPathFromAbsoluteURL(t *testing.T) {
	value, err := normalizeRequestedPath("https://cdn.catwa.chat/uploads/2026/03/16/file.png")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if value != "2026/03/16/file.png" {
		t.Fatalf("unexpected normalized value %q", value)
	}
}

func TestVerifySignedAccess(t *testing.T) {
	service := &Service{
		uploadAccessSecret: []byte("12345678901234567890123456789012"),
	}

	relativePath := "2026/03/16/file.png"
	expiresUnix := time.Now().UTC().Add(2 * time.Minute).Unix()
	signature := service.signUploadPath(relativePath, expiresUnix)
	if err := service.verifySignedAccess(relativePath, strconv.FormatInt(expiresUnix, 10), signature); err != nil {
		t.Fatalf("expected signed url to be valid, got %v", err)
	}
}

func TestVerifySignedAccessRejectsExpired(t *testing.T) {
	service := &Service{
		uploadAccessSecret: []byte("12345678901234567890123456789012"),
	}

	relativePath := "2026/03/16/file.png"
	expiresUnix := time.Now().UTC().Add(-1 * time.Minute).Unix()
	signature := service.signUploadPath(relativePath, expiresUnix)
	err := service.verifySignedAccess(relativePath, strconv.FormatInt(expiresUnix, 10), signature)
	if !errors.Is(err, ErrUploadAccessDenied) {
		t.Fatalf("expected ErrUploadAccessDenied, got %v", err)
	}
}

func TestVerifySignedAccessRejectsTamperedSignature(t *testing.T) {
	service := &Service{
		uploadAccessSecret: []byte("12345678901234567890123456789012"),
	}

	relativePath := "2026/03/16/file.png"
	expiresUnix := time.Now().UTC().Add(2 * time.Minute).Unix()
	signature := service.signUploadPath(relativePath, expiresUnix)
	if len(signature) < 4 {
		t.Fatalf("unexpected short signature %q", signature)
	}
	last := signature[len(signature)-1]
	replacement := byte('0')
	if last == '0' {
		replacement = '1'
	}
	tampered := signature[:len(signature)-1] + string(replacement)

	err := service.verifySignedAccess(relativePath, strconv.FormatInt(expiresUnix, 10), tampered)
	if !errors.Is(err, ErrUploadAccessDenied) {
		t.Fatalf("expected ErrUploadAccessDenied, got %v", err)
	}
}

func TestBuildSignedPathIncludesParameters(t *testing.T) {
	service := &Service{
		uploadAccessSecret: []byte("12345678901234567890123456789012"),
	}

	relativePath := "2026/03/16/file.png"
	signedPath := service.buildSignedPath(relativePath, 1_900_000_000)
	if !strings.Contains(signedPath, "/uploads/2026/03/16/file.png?") {
		t.Fatalf("unexpected signed path %q", signedPath)
	}
	if !strings.Contains(signedPath, "exp=1900000000") {
		t.Fatalf("expected exp query in %q", signedPath)
	}
	if !strings.Contains(signedPath, "sig=") {
		t.Fatalf("expected sig query in %q", signedPath)
	}
}
