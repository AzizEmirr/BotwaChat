set -euo pipefail

chown catwa:catwa \
  /opt/catwa/current/apps/desktop/src/components/ui/LinkGuardProvider.tsx \
  /opt/catwa/current/apps/desktop/src/components/workspace/MessageRow.tsx \
  /opt/catwa/current/apps/desktop/src/lib/attachmentAccess.ts \
  /opt/catwa/current/apps/server/internal/common/config/config.go \
  /opt/catwa/current/apps/server/cmd/server/main.go \
  /opt/catwa/current/apps/server/internal/modules/uploads/handler.go \
  /opt/catwa/current/apps/server/internal/modules/uploads/service.go \
  /opt/catwa/current/apps/server/internal/modules/uploads/types.go \
  /opt/catwa/current/apps/server/internal/modules/uploads/access_test.go \
  /opt/catwa/current/apps/server/README.md \
  /opt/catwa/current/scripts/cloudflare/setup_catwa.sh \
  /opt/catwa/current/scripts/cloudflare/setup_catwa.ps1

chmod 755 /opt/catwa/current/scripts/cloudflare/setup_catwa.sh

su -s /bin/bash catwa -c 'cd /opt/catwa/current/apps/server && go test ./...'
su -s /bin/bash catwa -c 'cd /opt/catwa/current/apps/server && go build -o /opt/catwa/bin/catwa-server ./cmd/server'
su -s /bin/bash catwa -c 'cd /opt/catwa/current && npm run build --workspace @catwa/desktop'

systemctl restart catwa-server
nginx -t
systemctl reload nginx

systemctl --no-pager --full status catwa-server | sed -n "1,25p"
curl -fsS https://api.catwa.chat/health
curl -fsS https://catwa.chat/health
