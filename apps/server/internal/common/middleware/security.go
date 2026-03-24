package middleware

import (
	"net/http"
	"net/url"
	"strings"
)

func SecurityHeaders() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			headers := w.Header()
			headers.Set("X-Content-Type-Options", "nosniff")
			headers.Set("X-Permitted-Cross-Domain-Policies", "none")
			headers.Set("X-Frame-Options", "DENY")
			headers.Set("Referrer-Policy", "no-referrer")
			headers.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
			headers.Set("Cross-Origin-Opener-Policy", "same-origin")
			if isHTTPSRequest(r) {
				headers.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

func APINoStore() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			headers := w.Header()
			headers.Set("Cache-Control", "no-store")
			headers.Set("Pragma", "no-cache")
			headers.Set("Expires", "0")
			next.ServeHTTP(w, r)
		})
	}
}

func RedactQueryParams(paramNames ...string) func(http.Handler) http.Handler {
	if len(paramNames) == 0 {
		return func(next http.Handler) http.Handler {
			return next
		}
	}

	keySet := make(map[string]struct{}, len(paramNames))
	for _, rawKey := range paramNames {
		key := strings.ToLower(strings.TrimSpace(rawKey))
		if key == "" {
			continue
		}
		keySet[key] = struct{}{}
	}

	if len(keySet) == 0 {
		return func(next http.Handler) http.Handler {
			return next
		}
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.URL != nil && r.URL.RawQuery != "" {
				query, err := url.ParseQuery(r.URL.RawQuery)
				if err == nil {
					updated := false
					for key := range query {
						if _, ok := keySet[strings.ToLower(strings.TrimSpace(key))]; ok {
							query.Set(key, "REDACTED")
							updated = true
						}
					}
					if updated {
						r.URL.RawQuery = query.Encode()
						r.RequestURI = r.URL.RequestURI()
					}
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isHTTPSRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}

	forwardedProto := strings.ToLower(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")))
	if forwardedProto == "https" {
		return true
	}

	cfVisitor := strings.ToLower(strings.TrimSpace(r.Header.Get("CF-Visitor")))
	return strings.Contains(cfVisitor, "\"scheme\":\"https\"")
}
