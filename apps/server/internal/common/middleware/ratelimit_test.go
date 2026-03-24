package middleware

import (
	"net/http/httptest"
	"testing"
)

func TestClientIPIgnoresForwardedHeadersFromUntrustedRemote(t *testing.T) {
	if err := SetTrustedProxyCIDRs([]string{"127.0.0.0/8", "::1/128"}); err != nil {
		t.Fatalf("set trusted proxies: %v", err)
	}
	t.Cleanup(func() {
		_ = SetTrustedProxyCIDRs(nil)
	})

	req := httptest.NewRequest("GET", "http://example.test/health", nil)
	req.RemoteAddr = "203.0.113.10:12345"
	req.Header.Set("CF-Connecting-IP", "1.2.3.4")
	req.Header.Set("X-Forwarded-For", "5.6.7.8")

	if got := ClientIP(req); got != "203.0.113.10" {
		t.Fatalf("expected remote ip, got %q", got)
	}
}

func TestClientIPUsesForwardedHeadersFromTrustedProxy(t *testing.T) {
	if err := SetTrustedProxyCIDRs([]string{"127.0.0.0/8", "::1/128"}); err != nil {
		t.Fatalf("set trusted proxies: %v", err)
	}
	t.Cleanup(func() {
		_ = SetTrustedProxyCIDRs(nil)
	})

	req := httptest.NewRequest("GET", "http://example.test/health", nil)
	req.RemoteAddr = "127.0.0.1:54321"
	req.Header.Set("CF-Connecting-IP", "1.2.3.4")

	if got := ClientIP(req); got != "1.2.3.4" {
		t.Fatalf("expected forwarded client ip, got %q", got)
	}
}

func TestClientIPUsesForwardedHeadersFromLoopbackByDefault(t *testing.T) {
	if err := SetTrustedProxyCIDRs(nil); err != nil {
		t.Fatalf("set trusted proxies: %v", err)
	}

	req := httptest.NewRequest("GET", "http://example.test/health", nil)
	req.RemoteAddr = "127.0.0.1:32100"
	req.Header.Set("X-Forwarded-For", "5.6.7.8")

	if got := ClientIP(req); got != "5.6.7.8" {
		t.Fatalf("expected forwarded client ip, got %q", got)
	}
}
