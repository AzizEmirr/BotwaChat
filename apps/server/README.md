# Catwa Server

Go + PostgreSQL backend.

## Stack
- Go 1.25+
- PostgreSQL 15+
- Router: `chi`
- Auth: JWT access + refresh token
- Password hashing: `bcrypt`
- Rate limiting: `x/time/rate`
- Migrations: `golang-migrate`
- Realtime: WebSocket + PostgreSQL LISTEN/NOTIFY
- Voice SFU: LiveKit

## Ortam
```powershell
Copy-Item .env.example .env
```

Önemli değişkenler:
- `POSTGRES_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_AUDIENCE`
- `UPLOAD_ACCESS_SECRET` (zorunlu, production'da `JWT_ACCESS_SECRET` ile aynı olamaz)
- `UPLOAD_ACCESS_URL_TTL` (varsayılan: `2m`)
- `TURNSTILE_SECRET_KEY` (opsiyonel; set edilirse login/register için `turnstileToken` zorunlu olur)
- `TURNSTILE_VERIFY_URL` (varsayılan: Cloudflare siteverify endpoint)
- `TURNSTILE_ALLOW_DESKTOP_BYPASS` (varsayılan: `true`; `true` yapılırsa `X-Catwa-Desktop: true` + desktop UA gelen login/register isteklerinde Turnstile atlanır)
- `TURNSTILE_ENFORCE_SERVER_INVITE` (varsayılan: `false`; `true` yapılırsa `/servers/{serverId}/members` için `turnstileToken` zorunlu olur)
- `WS_NOTIFY_CHANNEL`
- `TRUSTED_PROXY_CIDRS` (`CF-Connecting-IP` / `X-Forwarded-For` başlıkları sadece bu CIDR'lerden gelen isteklerde güvenilir kabul edilir)
- `LIVEKIT_URL`
- `LIVEKIT_PUBLIC_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `VOICE_ROOM_PREFIX`

## Migration
```bash
npm run server:migrate:up
npm run server:migrate:down
```

## Çalıştırma
```bash
npm run server:dev
```

## Endpointler
Base: `/api/v1`

Auth:
- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/logout`
- `POST /auth/refresh`
- `POST /auth/change-password`

Not:
- `TURNSTILE_SECRET_KEY` set edilirse `register/login` body'lerinde `turnstileToken` alanı zorunlu doğrulanır.
- `TURNSTILE_ALLOW_DESKTOP_BYPASS=true` ise desktop istemciden gelen login/register isteklerinde Turnstile doğrulaması atlanır.
- `TURNSTILE_ENFORCE_SERVER_INVITE=true` yapılırsa `POST /servers/{serverId}/members` body'sinde `turnstileToken` zorunlu olur.

Users:
- `GET /users/me`
- `PATCH /users/me`
- `GET /users/search?q=<text>&limit=15`

Servers:
- `GET /servers`
- `POST /servers`

Channels:
- `POST /channels`

Messages:
- `POST /messages`
- `GET /messages?conversation_type=channel|dm&conversation_id=<uuid>&limit=50&before=<rfc3339>`

DMs:
- `POST /dms`
- `GET /dms`

Voice:
- `GET /voice/channels?workspace_id=<uuid>`
- `POST /voice/channels`

Uploads:
- `POST /uploads` (multipart)
- `GET /uploads/stream?path=<relative-or-full-upload-url>` (auth gerekli, üyelik kontrolü ile güvenli dosya stream)

Public upload serving:
- `GET /uploads/<yyyy>/<mm>/<dd>/<file>` artık yalnızca imzalı query ile açılır (`exp` + `sig`).

Notifications:
- `GET /notifications?limit=20`

WebSocket:
- `GET /ws` (auth via `Sec-WebSocket-Protocol: catwa.v1, access_token.<token>`)

## Güvenlik Notları
- Production'da `WS_ALLOW_EMPTY_ORIGIN=true` artık kabul edilmez.
- Production'da `http://` origin sadece loopback hostlar için (`localhost`, `127.0.0.1`, `::1`) kabul edilir.
- `UPLOAD_ACCESS_SECRET`, production'da varsayılan olamaz ve JWT secretlarıyla aynı olamaz.
- Login tarafında IP + kullanıcı bazlı ek brute-force koruması bulunur; çok sayıda yanlış denemede geçici blok uygulanır.
- `CF-Connecting-IP` / `X-Forwarded-For` başlıkları yalnızca `TRUSTED_PROXY_CIDRS` içindeki kaynaklardan geliyorsa dikkate alınır.
