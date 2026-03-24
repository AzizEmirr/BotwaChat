package auth

import "time"

type userDTO struct {
	ID          string    `json:"id"`
	Email       string    `json:"email"`
	Username    string    `json:"username"`
	DisplayName string    `json:"displayName"`
	CreatedAt   time.Time `json:"createdAt"`
}

type tokensDTO struct {
	AccessToken  string `json:"accessToken"`
	RefreshToken string `json:"refreshToken"`
	TokenType    string `json:"tokenType"`
	ExpiresIn    int64  `json:"expiresIn"`
}

type authResponse struct {
	User   userDTO   `json:"user"`
	Tokens tokensDTO `json:"tokens"`
}

type registerRequest struct {
	Email          string `json:"email"`
	Username       string `json:"username"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstileToken,omitempty"`
	DesktopClient  bool   `json:"desktopClient,omitempty"`
}

type loginRequest struct {
	EmailOrUsername string `json:"emailOrUsername"`
	Password        string `json:"password"`
	TurnstileToken  string `json:"turnstileToken,omitempty"`
	DesktopClient   bool   `json:"desktopClient,omitempty"`
}

type refreshRequest struct {
	RefreshToken   string `json:"refreshToken"`
	TurnstileToken string `json:"turnstileToken,omitempty"`
}

type logoutRequest struct {
	RefreshToken string `json:"refreshToken"`
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}

type statusResponse struct {
	Status string `json:"status"`
}
