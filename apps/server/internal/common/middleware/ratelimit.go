package middleware

import (
	"net"
	"net/http"
	"net/netip"
	"strings"
	"sync"
	"time"

	httpx "github.com/AzizEmirr/catwa/apps/server/internal/common/http"
	"golang.org/x/time/rate"
)

type visitor struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

type IPRateLimiter struct {
	mu       sync.Mutex
	visitors map[string]*visitor
	rps      rate.Limit
	burst    int
	ttl      time.Duration
}

var (
	trustedProxyMu   sync.RWMutex
	trustedProxyNets []netip.Prefix
)

var defaultTrustedProxyCIDRs = []string{
	"127.0.0.0/8",
	"::1/128",
}

func NewIPRateLimiter(rps float64, burst int, ttl time.Duration) *IPRateLimiter {
	l := &IPRateLimiter{
		visitors: make(map[string]*visitor),
		rps:      rate.Limit(rps),
		burst:    burst,
		ttl:      ttl,
	}
	go l.cleanupLoop()
	return l
}

func SetTrustedProxyCIDRs(cidrs []string) error {
	allCIDRs := make([]string, 0, len(cidrs)+len(defaultTrustedProxyCIDRs))
	allCIDRs = append(allCIDRs, cidrs...)
	allCIDRs = append(allCIDRs, defaultTrustedProxyCIDRs...)

	prefixes := make([]netip.Prefix, 0, len(allCIDRs))
	seen := make(map[netip.Prefix]struct{}, len(allCIDRs))
	for _, value := range allCIDRs {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		prefix, err := netip.ParsePrefix(trimmed)
		if err != nil {
			return err
		}
		masked := prefix.Masked()
		if _, ok := seen[masked]; ok {
			continue
		}
		seen[masked] = struct{}{}
		prefixes = append(prefixes, masked)
	}

	trustedProxyMu.Lock()
	trustedProxyNets = prefixes
	trustedProxyMu.Unlock()
	return nil
}

func (l *IPRateLimiter) Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ip := ClientIP(r)
		limiter := l.getVisitor(ip)
		if !limiter.Allow() {
			httpx.Error(w, http.StatusTooManyRequests, "too many requests")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (l *IPRateLimiter) getVisitor(ip string) *rate.Limiter {
	now := time.Now()

	l.mu.Lock()
	defer l.mu.Unlock()

	v, ok := l.visitors[ip]
	if !ok {
		limiter := rate.NewLimiter(l.rps, l.burst)
		l.visitors[ip] = &visitor{limiter: limiter, lastSeen: now}
		return limiter
	}

	v.lastSeen = now
	return v.limiter
}

func (l *IPRateLimiter) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()

	for range ticker.C {
		cutoff := time.Now().Add(-l.ttl)
		l.mu.Lock()
		for ip, v := range l.visitors {
			if v.lastSeen.Before(cutoff) {
				delete(l.visitors, ip)
			}
		}
		l.mu.Unlock()
	}
}

func ClientIP(r *http.Request) string {
	remoteIP := remoteRequestIP(r)
	if remoteIP != "" && isTrustedProxyIP(remoteIP) {
		cloudflareIP := normalizeIP(strings.TrimSpace(r.Header.Get("CF-Connecting-IP")))
		if cloudflareIP != "" {
			return cloudflareIP
		}

		forwarded := strings.TrimSpace(r.Header.Get("X-Forwarded-For"))
		if forwarded != "" {
			parts := strings.Split(forwarded, ",")
			if len(parts) > 0 {
				ip := normalizeIP(strings.TrimSpace(parts[0]))
				if ip != "" {
					return ip
				}
			}
		}

		realIP := normalizeIP(strings.TrimSpace(r.Header.Get("X-Real-IP")))
		if realIP != "" {
			return realIP
		}
	}

	if remoteIP != "" {
		return remoteIP
	}

	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		normalized := normalizeIP(host)
		if normalized != "" {
			return normalized
		}
	}

	remoteAddr := normalizeIP(strings.TrimSpace(r.RemoteAddr))
	if remoteAddr != "" {
		return remoteAddr
	}

	return "unknown"
}

func remoteRequestIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(strings.TrimSpace(r.RemoteAddr))
	if err == nil {
		return normalizeIP(host)
	}
	return normalizeIP(strings.TrimSpace(r.RemoteAddr))
}

func isTrustedProxyIP(ip string) bool {
	parsed, err := netip.ParseAddr(strings.TrimSpace(ip))
	if err != nil {
		return false
	}

	trustedProxyMu.RLock()
	defer trustedProxyMu.RUnlock()
	for _, prefix := range trustedProxyNets {
		if prefix.Contains(parsed) {
			return true
		}
	}
	return false
}

func normalizeIP(raw string) string {
	value := strings.TrimSpace(raw)
	if value == "" {
		return ""
	}

	value = strings.Trim(value, "[]")
	parsed := net.ParseIP(value)
	if parsed == nil {
		return ""
	}

	return parsed.String()
}
