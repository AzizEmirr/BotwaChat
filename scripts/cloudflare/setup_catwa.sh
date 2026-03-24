#!/usr/bin/env bash
set -euo pipefail

# Catwa Cloudflare production bootstrap (idempotent)
# Requirements: bash, curl, jq
# Usage:
#   CF_API_TOKEN='cf_scoped_token' \
#   CF_ZONE_ID='9d9ca849ddea509d9ee3aa3e42a1941f' \
#   ORIGIN_IP='109.236.48.161' \
#   bash scripts/cloudflare/setup_catwa.sh

: "${CF_ZONE_ID:?CF_ZONE_ID is required}"
: "${ORIGIN_IP:?ORIGIN_IP is required}"

auth_headers=()
if [[ -n "${CF_API_TOKEN:-}" ]]; then
  auth_headers=(-H "Authorization: Bearer ${CF_API_TOKEN}")
  echo "[INFO] Cloudflare auth: scoped API token"
elif [[ -n "${CF_API_EMAIL:-}" && -n "${CF_API_KEY:-}" ]]; then
  auth_headers=(-H "X-Auth-Email: ${CF_API_EMAIL}" -H "X-Auth-Key: ${CF_API_KEY}")
  echo "[INFO] Cloudflare auth: global API key + email"
else
  echo "[ERROR] Provide CF_API_TOKEN or both CF_API_EMAIL and CF_API_KEY" >&2
  exit 1
fi

api_base="https://api.cloudflare.com/client/v4"

cf() {
  local method="$1"
  local path="$2"
  local body="${3:-}"

  if [[ -n "$body" ]]; then
    curl -sS -X "$method" "${api_base}${path}" \
      "${auth_headers[@]}" \
      -H "Content-Type: application/json" \
      --data "$body"
  else
    curl -sS -X "$method" "${api_base}${path}" \
      "${auth_headers[@]}" \
      -H "Content-Type: application/json"
  fi
}

assert_success() {
  local json="$1"
  local context="$2"
  local ok
  ok="$(jq -r '.success' <<<"$json")"
  if [[ "$ok" != "true" ]]; then
    echo "[ERROR] ${context}"
    jq -r '.errors' <<<"$json"
    exit 1
  fi
}

upsert_dns() {
  local type="$1"
  local name="$2"
  local content="$3"
  local proxied="$4"

  local list
  list="$(cf GET "/zones/${CF_ZONE_ID}/dns_records?type=${type}&name=${name}")"
  assert_success "$list" "list dns ${name}"

  local id
  id="$(jq -r '.result[0].id // empty' <<<"$list")"

  local payload
  payload="$(jq -nc \
    --arg type "$type" \
    --arg name "$name" \
    --arg content "$content" \
    --argjson proxied "$proxied" \
    '{type:$type,name:$name,content:$content,ttl:1,proxied:$proxied}')"

  if [[ -n "$id" ]]; then
    local current_content current_proxied
    current_content="$(jq -r '.result[0].content' <<<"$list")"
    current_proxied="$(jq -r '.result[0].proxied' <<<"$list")"
    if [[ "$current_content" == "$content" && "$current_proxied" == "$proxied" ]]; then
      echo "[OK] DNS unchanged: ${type} ${name} -> ${content} proxied=${proxied}"
      return
    fi

    local updated
    updated="$(cf PUT "/zones/${CF_ZONE_ID}/dns_records/${id}" "$payload")"
    assert_success "$updated" "update dns ${name}"
    echo "[OK] DNS updated: ${type} ${name} -> ${content} proxied=${proxied}"
  else
    local created
    created="$(cf POST "/zones/${CF_ZONE_ID}/dns_records" "$payload")"
    assert_success "$created" "create dns ${name}"
    echo "[OK] DNS created: ${type} ${name} -> ${content} proxied=${proxied}"
  fi
}

set_setting() {
  local key="$1"
  local raw_json="$2"
  local resp
  resp="$(cf PATCH "/zones/${CF_ZONE_ID}/settings/${key}" "{\"value\":${raw_json}}")"
  assert_success "$resp" "set setting ${key}"
  echo "[OK] setting ${key}"
}

set_setting_optional() {
  local key="$1"
  local raw_json="$2"
  local resp
  resp="$(cf PATCH "/zones/${CF_ZONE_ID}/settings/${key}" "{\"value\":${raw_json}}")"
  if [[ "$(jq -r '.success' <<<"$resp")" == "true" ]]; then
    echo "[OK] setting ${key}"
    return
  fi
  echo "[WARN] optional setting skipped: ${key}" >&2
}

set_minify() {
  local resp
  resp="$(cf PATCH "/zones/${CF_ZONE_ID}/settings/minify" '{"value":{"html":"on","css":"on","js":"on"}}')"
  assert_success "$resp" "set minify"
  echo "[OK] setting minify"
}

get_entrypoint() {
  local phase="$1"
  cf GET "/zones/${CF_ZONE_ID}/rulesets/phases/${phase}/entrypoint"
}

ensure_rule() {
  local phase="$1"
  local description="$2"
  local expression="$3"
  local action="$4"
  local action_params="${5:-null}"

  local ep
  ep="$(get_entrypoint "$phase")"
  assert_success "$ep" "get entrypoint ${phase}"

  local rule_id
  rule_id="$(jq -r --arg d "$description" '.result.rules[]? | select(.description==$d) | .id' <<<"$ep" | head -n1)"

  local payload
  payload="$(jq -nc \
    --arg description "$description" \
    --arg expression "$expression" \
    --arg action "$action" \
    --argjson action_parameters "$action_params" \
    '{description:$description,enabled:true,expression:$expression,action:$action} + (if $action_parameters == null then {} else {action_parameters:$action_parameters} end)')"

  if [[ -n "$rule_id" ]]; then
    local r
    r="$(cf PATCH "/zones/${CF_ZONE_ID}/rulesets/phases/${phase}/entrypoint/rules/${rule_id}" "$payload")"
    assert_success "$r" "update rule ${description}"
    echo "[OK] rule updated: ${description}"
  else
    local r
    r="$(cf POST "/zones/${CF_ZONE_ID}/rulesets/phases/${phase}/entrypoint/rules" "$payload")"
    assert_success "$r" "create rule ${description}"
    echo "[OK] rule created: ${description}"
  fi
}

ensure_rule_optional() {
  local phase="$1"
  local description="$2"
  local expression="$3"
  local action="$4"
  local action_params="${5:-null}"

  set +e
  local output
  output="$(ensure_rule "$phase" "$description" "$expression" "$action" "$action_params" 2>&1)"
  local status=$?
  set -e

  if [[ $status -ne 0 ]]; then
    echo "[WARN] optional rule skipped: ${description}" >&2
    echo "$output" >&2
    return 0
  fi

  echo "$output"
  return 0
}

echo "== DNS =="
upsert_dns A catwa.chat "$ORIGIN_IP" true
upsert_dns CNAME www.catwa.chat catwa.chat true
upsert_dns A cdn.catwa.chat "$ORIGIN_IP" true
upsert_dns A ws.catwa.chat "$ORIGIN_IP" true

# Production decision: API and downloads stay proxied to enable WAF/rate-limit/cache control.
# If downloads artifacts can exceed 512MB on your Cloudflare plan, switch to DNS only or move to R2.
upsert_dns A api.catwa.chat "$ORIGIN_IP" true
upsert_dns A downloads.catwa.chat "$ORIGIN_IP" true

echo "== TLS / Core settings =="
set_setting ssl '"strict"'
set_setting always_use_https '"on"'
set_setting automatic_https_rewrites '"on"'
set_setting min_tls_version '"1.2"'
set_setting tls_1_3 '"on"'
set_setting opportunistic_encryption '"on"'
set_setting brotli '"on"'
set_setting http3 '"on"'
set_setting early_hints '"on"'
set_setting always_online '"on"'
set_setting security_level '"medium"'
set_setting browser_check '"on"'
set_setting_optional bot_fight_mode '"on"'
set_minify

echo "== Redirect rules =="
ensure_rule_optional \
  http_request_dynamic_redirect \
  "Canonicalize www -> apex" \
  '(http.host eq "www.catwa.chat")' \
  redirect \
  '{"from_value":{"status_code":301,"target_url":{"expression":"concat(\"https://catwa.chat\", http.request.uri.path)"}}}'

echo "== Cache rules =="
ensure_rule_optional \
  http_request_cache_settings \
  "Bypass API cache" \
  '(http.host eq "api.catwa.chat")' \
  set_cache_settings \
  '{"cache":false}'

ensure_rule_optional \
  http_request_cache_settings \
  "Bypass CDN uploads cache" \
  '(http.host eq "cdn.catwa.chat" and starts_with(http.request.uri.path, "/uploads/"))' \
  set_cache_settings \
  '{"cache":false}'

ensure_rule_optional \
  http_request_cache_settings \
  "CDN assets aggressive cache" \
  '(http.host eq "cdn.catwa.chat" and starts_with(http.request.uri.path, "/assets/"))' \
  set_cache_settings \
  '{"cache":true,"edge_ttl":{"mode":"override_origin","default":2592000},"browser_ttl":{"mode":"override_origin","default":2592000}}'

ensure_rule_optional \
  http_request_cache_settings \
  "Downloads cache binaries" \
  '(http.host eq "downloads.catwa.chat" and http.request.uri.path matches ".*\\.(msi|exe|zip)$")' \
  set_cache_settings \
  '{"cache":true,"edge_ttl":{"mode":"override_origin","default":86400},"browser_ttl":{"mode":"override_origin","default":86400}}'

ensure_rule_optional \
  http_request_cache_settings \
  "Apex static assets cache" \
  '(http.host eq "catwa.chat" and http.request.uri.path matches "^/assets/.*\\.(js|css|png|jpg|jpeg|gif|svg|webp|woff|woff2)$")' \
  set_cache_settings \
  '{"cache":true,"edge_ttl":{"mode":"override_origin","default":604800},"browser_ttl":{"mode":"override_origin","default":604800}}'

echo "== Security / firewall custom rules =="
ensure_rule_optional \
  http_request_firewall_custom \
  "Block common WP exploit paths" \
  '(http.request.uri.path contains "/wp-admin" or http.request.uri.path contains "/wp-login.php" or http.request.uri.path contains "/xmlrpc.php")' \
  block

ensure_rule_optional \
  http_request_firewall_custom \
  "Block traversal and null-byte probes" \
  '(http.host in {"api.catwa.chat" "cdn.catwa.chat" "ws.catwa.chat"} and (lower(http.request.uri.path) contains ".." or lower(http.request.uri.path) contains "%2e%2e" or lower(http.request.uri.path) contains "%00" or lower(http.request.uri.query) contains "%00"))' \
  block

ensure_rule_optional \
  http_request_firewall_custom \
  "Challenge suspicious API scanner methods" \
  '(http.host eq "api.catwa.chat" and starts_with(http.request.uri.path, "/api/") and not (http.request.method in {"GET" "POST" "PATCH" "DELETE" "OPTIONS"}))' \
  managed_challenge

echo "[INFO] API auth managed challenge skipped to avoid breaking XHR login flows."

echo "== Rate limit rules =="
ensure_rule_optional \
  http_ratelimit \
  "Rate limit API auth endpoints" \
  '(http.host eq "api.catwa.chat" and ((http.request.uri.path eq "/api/v1/auth/login") or (http.request.uri.path eq "/api/v1/auth/register") or (http.request.uri.path eq "/api/v1/auth/refresh") or (http.request.uri.path eq "/api/v1/uploads") or (http.request.method eq "POST" and http.request.uri.path eq "/api/v1/dms")))' \
  block \
  '{"requests_per_period":8,"period":10,"mitigation_timeout":10,"characteristics":["ip.src","cf.colo.id"]}'

echo "== Response header transform rules =="
ensure_rule_optional \
  http_response_headers_transform \
  "Set anti-clickjacking headers for web app" \
  '(http.host in {"catwa.chat" "www.catwa.chat"})' \
  rewrite \
  "{\"headers\":{\"X-Frame-Options\":{\"operation\":\"set\",\"value\":\"DENY\"},\"Content-Security-Policy\":{\"operation\":\"set\",\"value\":\"frame-ancestors 'none'\"}}}"

ensure_rule_optional \
  http_response_headers_transform \
  "Allow CORS for downloads update manifests" \
  '(http.host eq "downloads.catwa.chat" and starts_with(lower(http.request.uri.path), "/updates/") and ends_with(lower(http.request.uri.path), "/latest.json"))' \
  rewrite \
  '{"headers":{"Access-Control-Allow-Origin":{"operation":"set","value":"*"},"Access-Control-Allow-Methods":{"operation":"set","value":"GET, OPTIONS"},"Access-Control-Allow-Headers":{"operation":"set","value":"Content-Type"},"Vary":{"operation":"set","value":"Origin"}}}'

echo "== Completed =="
echo "Run validation checks now:"
echo "  curl -I https://catwa.chat"
echo "  curl -I https://www.catwa.chat"
echo "  curl -I https://api.catwa.chat/health"
echo "  curl -I https://ws.catwa.chat/health"
echo "  curl -I https://downloads.catwa.chat/CatwaSetup.msi"
