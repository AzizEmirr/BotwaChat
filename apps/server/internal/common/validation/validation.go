package validation

import (
	"net/mail"
	"regexp"
	"strings"
	"unicode"

	"github.com/google/uuid"
)

var (
	usernameRegex = regexp.MustCompile(`^[a-zA-Z0-9_]{3,32}$`)
	channelRegex  = regexp.MustCompile(`^[a-z0-9-]{2,50}$`)
)

func ValidateRegister(email, username, password string) map[string]string {
	errs := make(map[string]string)

	if !IsValidEmail(email) {
		errs["email"] = "invalid email"
	}
	if !IsValidUsername(username) {
		errs["username"] = "username must be 3-32 chars and only alphanumeric or underscore"
	}
	if !IsStrongPassword(password) {
		errs["password"] = "password must be at least 8 chars and include upper, lower and digit"
	}

	return errs
}

func ValidateLogin(identifier, password string) map[string]string {
	errs := make(map[string]string)
	identifier = strings.TrimSpace(identifier)
	password = strings.TrimSpace(password)

	if identifier == "" {
		errs["emailOrUsername"] = "required"
	} else if len(identifier) > 255 {
		errs["emailOrUsername"] = "too long"
	}
	if password == "" {
		errs["password"] = "required"
	} else if len(password) > 128 {
		errs["password"] = "too long"
	}
	return errs
}

func ValidateServerName(name string) map[string]string {
	errs := make(map[string]string)
	trimmed := strings.TrimSpace(name)
	if len(trimmed) < 2 || len(trimmed) > 64 {
		errs["name"] = "server name must be between 2 and 64 chars"
	}
	return errs
}

func ValidateChannel(name, kind string) map[string]string {
	errs := make(map[string]string)
	if !channelRegex.MatchString(strings.TrimSpace(name)) {
		errs["name"] = "channel name must match ^[a-z0-9-]{2,50}$"
	}
	switch strings.TrimSpace(kind) {
	case "text", "announcement":
	default:
		errs["kind"] = "kind must be text or announcement"
	}
	return errs
}

func ValidateMessageContent(content string) map[string]string {
	errs := make(map[string]string)
	trimmed := strings.TrimSpace(content)
	if trimmed == "" {
		errs["content"] = "content is required"
	}
	if len(trimmed) > 4000 {
		errs["content"] = "content must be 4000 chars or less"
	}
	return errs
}

func ValidateProfile(username, displayName string) map[string]string {
	errs := make(map[string]string)
	if username != "" && !IsValidUsername(username) {
		errs["username"] = "username must be 3-32 chars and only alphanumeric or underscore"
	}
	if len(strings.TrimSpace(displayName)) > 64 {
		errs["displayName"] = "displayName must be 64 chars or less"
	}
	return errs
}

func IsValidEmail(email string) bool {
	trimmed := strings.TrimSpace(email)
	if len(trimmed) < 6 || len(trimmed) > 255 {
		return false
	}
	_, err := mail.ParseAddress(trimmed)
	return err == nil
}

func IsValidUsername(username string) bool {
	return usernameRegex.MatchString(strings.TrimSpace(username))
}

func IsStrongPassword(password string) bool {
	if len(password) < 8 || len(password) > 128 {
		return false
	}

	var hasUpper, hasLower, hasDigit bool
	for _, r := range password {
		switch {
		case unicode.IsUpper(r):
			hasUpper = true
		case unicode.IsLower(r):
			hasLower = true
		case unicode.IsDigit(r):
			hasDigit = true
		}
	}
	return hasUpper && hasLower && hasDigit
}

func IsUUID(value string) bool {
	_, err := uuid.Parse(strings.TrimSpace(value))
	return err == nil
}
