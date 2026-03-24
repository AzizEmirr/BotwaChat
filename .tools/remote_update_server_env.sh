set -euo pipefail
ENV_FILE=/etc/catwa/server.env
BACKUP=/etc/catwa/server.env.bak.$(date +%Y%m%d%H%M%S)
cp "$ENV_FILE" "$BACKUP"

NEW_SECRET=$(openssl rand -hex 32)

upsert() {
  key="$1"
  val="$2"
  if grep -qE "^${key}=" "$ENV_FILE"; then
    sed -i "s#^${key}=.*#${key}=${val}#" "$ENV_FILE"
  else
    printf '%s=%s\n' "$key" "$val" >> "$ENV_FILE"
  fi
}

upsert "UPLOAD_ACCESS_SECRET" "$NEW_SECRET"
upsert "UPLOAD_ACCESS_URL_TTL" "2m"
upsert "VOICE_TOKEN_TTL" "5m"

chmod 640 "$ENV_FILE"
chown root:catwa "$ENV_FILE"

systemctl restart catwa-server
systemctl is-active catwa-server
