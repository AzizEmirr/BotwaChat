#!/usr/bin/env bash
set -euo pipefail

# Cloudflare cache purge helper for Catwa
# Requirements: bash, curl
# Usage:
#   CF_API_TOKEN='cf_scoped_token' \
#   CF_ZONE_ID='9d9ca849ddea509d9ee3aa3e42a1941f' \
#   bash scripts/cloudflare/purge_cache.sh all
#   bash scripts/cloudflare/purge_cache.sh files https://cdn.catwa.chat/assets/app.js https://cdn.catwa.chat/assets/app.css
#   bash scripts/cloudflare/purge_cache.sh prefixes cdn.catwa.chat/assets

: "${CF_ZONE_ID:?CF_ZONE_ID is required}"
: "${CF_API_TOKEN:?CF_API_TOKEN is required (scoped token only)}"

auth_headers=(-H "Authorization: Bearer ${CF_API_TOKEN}")
echo "[INFO] Cloudflare auth: scoped API token"

api_base="https://api.cloudflare.com/client/v4"

purge() {
  local payload="$1"
  curl -sS -X POST "${api_base}/zones/${CF_ZONE_ID}/purge_cache" \
    "${auth_headers[@]}" \
    -H "Content-Type: application/json" \
    --data "$payload"
}

mode="${1:-all}"
shift || true

case "$mode" in
  all)
    purge '{"purge_everything":true}'
    ;;
  files)
    if [[ "$#" -eq 0 ]]; then
      echo "Provide at least one full URL for files mode" >&2
      exit 1
    fi
    json_files="$(printf '%s\n' "$@" | sed 's/"/\\"/g' | awk 'BEGIN{printf "["} {if(NR>1)printf ","; printf "\"%s\"",$0} END{printf "]"}')"
    purge "{\"files\":${json_files}}"
    ;;
  prefixes)
    if [[ "$#" -eq 0 ]]; then
      echo "Provide at least one prefix, e.g. cdn.catwa.chat/assets" >&2
      exit 1
    fi
    json_prefixes="$(printf '%s\n' "$@" | sed 's/"/\\"/g' | awk 'BEGIN{printf "["} {if(NR>1)printf ","; printf "\"%s\"",$0} END{printf "]"}')"
    purge "{\"prefixes\":${json_prefixes}}"
    ;;
  *)
    echo "Unknown mode: $mode" >&2
    echo "Modes: all | files | prefixes" >&2
    exit 1
    ;;
esac
