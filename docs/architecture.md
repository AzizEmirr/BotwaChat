# Catwa Architecture (Skeleton v0.1.0)

## Hedef
Discord benzeri chat uygulamasinin local-first, moduler ve production-ready temelli bir monorepo iskeletini saglamak.

## Monorepo Yapisi
```
/apps
  /desktop    -> Tauri + React + TypeScript + Tailwind istemci
  /server     -> Go backend (REST + WebSocket + PostgreSQL)
/packages
  /shared     -> ortak TypeScript tipleri, DTO, constants
/docs         -> mimari ve teknik kararlar
```

## Teknik Kararlar
- Router: `go-chi/chi v5`
- WebSocket: `gorilla/websocket`
- Migration: `golang-migrate`
- Frontend state: `zustand`

## Backend Katmanlari
- `cmd/server`: process bootstrap (config, db, hub, http server)
- `internal/config`: environment tabanli konfigurasyon
- `internal/http`: router + HTTP handlers
- `internal/realtime`: WebSocket hub + PostgreSQL LISTEN/NOTIFY bridge
- `internal/storage/postgres`: pgx pool yonetimi
- `migrations`: SQL migration dosyalari

## Realtime Akis
1. Client `/ws` endpoint'ine baglanir.
2. Mesajlar WebSocket Hub uzerinden aktif client'lara broadcast edilir.
3. Backend, PostgreSQL `LISTEN/NOTIFY` kanali ile processler arasi event dagitimi yapar.
4. Bir node `pg_notify` ile event yayinladiginda, diger node'lar `LISTEN` ile alip kendi websocket clientlarina iletir.

## Auth Tasarimi
- Login/Register: email + username + password
- Token modeli: kisa omurlu JWT access token + uzun omurlu refresh token
- Refresh token tablosu DB'de hashlenmis token saklayacak sekilde planlandi.

## Storage Tasarimi
- Yerel dosya depolama klasoru: `apps/server/storage`
- Dosya upload metadata'si ilerleyen asamada DB tablolarina eklenecek.

## Production Hazirlik Notlari
- Graceful shutdown, timeout ve middleware zinciri hazir.
- CORS whitelist, env tabanli yapilandirma ile yonetiliyor.
- SQL migration tabanli schema versiyonlamasi aktif.
- Business logic bilincli olarak bu asamada eklenmedi; sadece altyapi iskeleti kuruldu.
