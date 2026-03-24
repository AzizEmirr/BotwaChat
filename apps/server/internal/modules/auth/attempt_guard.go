package auth

import (
	"strings"
	"sync"
	"time"
)

type attemptRecord struct {
	count        int
	windowStart  time.Time
	blockedUntil time.Time
	lastSeen     time.Time
}

type AttemptGuard struct {
	mu sync.Mutex

	perIP      map[string]*attemptRecord
	perAccount map[string]*attemptRecord

	window          time.Duration
	cleanupAfter    time.Duration
	maxIPFailures   int
	maxUserFailures int
	blockBase       time.Duration
	maxBlock        time.Duration
}

func NewAttemptGuard() *AttemptGuard {
	guard := &AttemptGuard{
		perIP:           make(map[string]*attemptRecord),
		perAccount:      make(map[string]*attemptRecord),
		window:          15 * time.Minute,
		cleanupAfter:    2 * time.Hour,
		maxIPFailures:   40,
		maxUserFailures: 8,
		blockBase:       30 * time.Second,
		maxBlock:        30 * time.Minute,
	}
	go guard.cleanupLoop()
	return guard
}

func (g *AttemptGuard) Allow(ip, identifier string) (bool, time.Duration) {
	now := time.Now().UTC()
	userKey := accountKey(ip, identifier)

	g.mu.Lock()
	defer g.mu.Unlock()

	ipBlocked := blockedFor(g.perIP[ip], now)
	userBlocked := blockedFor(g.perAccount[userKey], now)
	if ipBlocked <= 0 && userBlocked <= 0 {
		return true, 0
	}
	if userBlocked > ipBlocked {
		return false, userBlocked
	}
	return false, ipBlocked
}

func (g *AttemptGuard) Fail(ip, identifier string) {
	now := time.Now().UTC()
	userKey := accountKey(ip, identifier)

	g.mu.Lock()
	defer g.mu.Unlock()

	g.applyFailure(g.perIP, ip, g.maxIPFailures, now)
	g.applyFailure(g.perAccount, userKey, g.maxUserFailures, now)
}

func (g *AttemptGuard) Success(ip, identifier string) {
	userKey := accountKey(ip, identifier)

	g.mu.Lock()
	defer g.mu.Unlock()

	delete(g.perAccount, userKey)
}

func (g *AttemptGuard) applyFailure(store map[string]*attemptRecord, key string, maxFailures int, now time.Time) {
	if strings.TrimSpace(key) == "" {
		return
	}

	record, ok := store[key]
	if !ok {
		record = &attemptRecord{
			windowStart: now,
		}
		store[key] = record
	}

	if record.windowStart.IsZero() || now.Sub(record.windowStart) > g.window {
		record.count = 0
		record.windowStart = now
	}

	record.count++
	record.lastSeen = now
	if record.count < maxFailures {
		return
	}

	overflow := record.count - maxFailures
	backoff := g.blockBase << overflow
	if backoff > g.maxBlock {
		backoff = g.maxBlock
	}

	blockUntil := now.Add(backoff)
	if blockUntil.After(record.blockedUntil) {
		record.blockedUntil = blockUntil
	}
}

func (g *AttemptGuard) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().UTC().Add(-g.cleanupAfter)

		g.mu.Lock()
		for key, record := range g.perIP {
			if record.lastSeen.Before(cutoff) && record.blockedUntil.Before(time.Now().UTC()) {
				delete(g.perIP, key)
			}
		}
		for key, record := range g.perAccount {
			if record.lastSeen.Before(cutoff) && record.blockedUntil.Before(time.Now().UTC()) {
				delete(g.perAccount, key)
			}
		}
		g.mu.Unlock()
	}
}

func blockedFor(record *attemptRecord, now time.Time) time.Duration {
	if record == nil || record.blockedUntil.IsZero() {
		return 0
	}
	remaining := time.Until(record.blockedUntil)
	if remaining < 0 {
		return 0
	}
	return remaining
}

func accountKey(ip, identifier string) string {
	trimmedIP := strings.TrimSpace(ip)
	trimmedIdentifier := strings.ToLower(strings.TrimSpace(identifier))
	if trimmedIP == "" || trimmedIdentifier == "" {
		return ""
	}
	return trimmedIP + "|" + trimmedIdentifier
}
