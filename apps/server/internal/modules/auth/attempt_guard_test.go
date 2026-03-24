package auth

import (
	"testing"
	"time"
)

func TestAttemptGuardBlocksAfterThreshold(t *testing.T) {
	guard := NewAttemptGuard()
	guard.blockBase = time.Second
	guard.maxBlock = 2 * time.Minute
	guard.maxUserFailures = 3
	guard.maxIPFailures = 100

	ip := "203.0.113.10"
	identifier := "kullanici"

	for i := 0; i < 2; i++ {
		allowed, _ := guard.Allow(ip, identifier)
		if !allowed {
			t.Fatalf("expected allowed before threshold at attempt %d", i+1)
		}
		guard.Fail(ip, identifier)
	}

	guard.Fail(ip, identifier)
	allowed, retryAfter := guard.Allow(ip, identifier)
	if allowed {
		t.Fatalf("expected blocked after threshold")
	}
	if retryAfter <= 0 {
		t.Fatalf("expected positive retry-after duration")
	}
}

func TestAttemptGuardSuccessResetsAccountBlock(t *testing.T) {
	guard := NewAttemptGuard()
	guard.blockBase = time.Second
	guard.maxBlock = time.Minute
	guard.maxUserFailures = 1
	guard.maxIPFailures = 100

	ip := "198.51.100.20"
	identifier := "test-user"

	guard.Fail(ip, identifier)
	allowed, _ := guard.Allow(ip, identifier)
	if allowed {
		t.Fatalf("expected blocked after one failure")
	}

	guard.Success(ip, identifier)
	allowed, _ = guard.Allow(ip, identifier)
	if !allowed {
		t.Fatalf("expected block reset after success")
	}
}
