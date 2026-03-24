package uploads

import (
	"bytes"
	"errors"
	"path/filepath"
	"strings"
	"testing"
)

func TestNormalizeRelativePathRejectsTraversal(t *testing.T) {
	_, err := normalizeRelativePath("../secret.txt")
	if !errors.Is(err, ErrInvalidUploadPath) {
		t.Fatalf("expected ErrInvalidUploadPath, got %v", err)
	}
}

func TestNormalizeRelativePathAllowsNestedFile(t *testing.T) {
	value, err := normalizeRelativePath("2026/03/16/file.png")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if value != "2026/03/16/file.png" {
		t.Fatalf("unexpected normalized value %q", value)
	}
}

func TestSanitizeOriginalName(t *testing.T) {
	value := sanitizeOriginalName("..\\evil<script>.png")
	if value == "" {
		t.Fatalf("expected sanitized file name")
	}
	if value == "..\\evil<script>.png" {
		t.Fatalf("expected sanitized output, got %q", value)
	}
}

func TestValidateFileSignaturePNG(t *testing.T) {
	validPNG := append([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, bytes.Repeat([]byte{0x00}, 32)...)
	if !validateFileSignature(".png", validPNG, "image/png") {
		t.Fatalf("expected png signature to be valid")
	}

	invalidPNG := []byte("not-a-real-png")
	if validateFileSignature(".png", invalidPNG, "image/png") {
		t.Fatalf("expected png signature validation to fail")
	}
}

func TestValidateFileSignatureTextRejectsBinary(t *testing.T) {
	binaryAsText := []byte{0x41, 0x00, 0x42}
	if validateFileSignature(".txt", binaryAsText, "text/plain") {
		t.Fatalf("expected .txt binary payload to be rejected")
	}
}

func TestDangerousExtensionBlocklistCoverage(t *testing.T) {
	required := []string{".html", ".svg", ".js", ".exe", ".dll", ".bat", ".cmd", ".ps1", ".php", ".sh", ".jar"}
	for _, ext := range required {
		if _, ok := dangerousExtensions[ext]; !ok {
			t.Fatalf("required dangerous extension missing from blocklist: %s", ext)
		}
	}
}

func TestUploadRulesRejectCommonBypassExtensions(t *testing.T) {
	disallowed := []string{"file.SVG", "file.HTML", "file.Js", "file.jpg.php", "file.png.exe"}
	for _, name := range disallowed {
		ext := strings.ToLower(filepath.Ext(sanitizeOriginalName(name)))
		if _, blocked := dangerousExtensions[ext]; !blocked {
			t.Fatalf("expected extension to be blocked: name=%s ext=%s", name, ext)
		}
	}
}
