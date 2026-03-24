package security

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/netip"
	"net/url"
	"strings"
	"time"
)

var (
	ErrTurnstileRequired = errors.New("turnstile_token_required")
	ErrTurnstileInvalid  = errors.New("turnstile_verification_failed")
)

type TurnstileVerifier struct {
	secret    string
	verifyURL string
	client    *http.Client
}

func NewTurnstileVerifier(secret, verifyURL string) *TurnstileVerifier {
	return &TurnstileVerifier{
		secret:    strings.TrimSpace(secret),
		verifyURL: strings.TrimSpace(verifyURL),
		client: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

func (v *TurnstileVerifier) Enabled() bool {
	return v != nil && v.secret != ""
}

func (v *TurnstileVerifier) Verify(ctx context.Context, token, remoteIP string) error {
	if !v.Enabled() {
		return nil
	}

	cleanToken := strings.TrimSpace(token)
	if cleanToken == "" {
		return ErrTurnstileRequired
	}

	form := url.Values{}
	form.Set("secret", v.secret)
	form.Set("response", cleanToken)
	if parsed, err := netip.ParseAddr(strings.TrimSpace(remoteIP)); err == nil {
		form.Set("remoteip", parsed.String())
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, v.verifyURL, strings.NewReader(form.Encode()))
	if err != nil {
		return fmt.Errorf("build turnstile verify request: %w", err)
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")

	resp, err := v.client.Do(req)
	if err != nil {
		return fmt.Errorf("%w: request failed", ErrTurnstileInvalid)
	}
	defer resp.Body.Close()

	var payload struct {
		Success    bool     `json:"success"`
		ErrorCodes []string `json:"error-codes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return fmt.Errorf("%w: invalid response", ErrTurnstileInvalid)
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("%w: status=%d", ErrTurnstileInvalid, resp.StatusCode)
	}
	if !payload.Success {
		codes := strings.Join(payload.ErrorCodes, ",")
		if codes == "" {
			return ErrTurnstileInvalid
		}
		return fmt.Errorf("%w: %s", ErrTurnstileInvalid, codes)
	}

	return nil
}

