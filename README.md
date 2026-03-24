# Catwa Monorepo

Catwa, masaüstü + web çalışan gerçek zamanlı sohbet uygulamasıdır.

Resmi site: **https://catwa.chat**  
Geliştirici: **Kyu Software**

## Durum
- Bu proje şu anda **Beta (aktif geliştirme)** aşamasındadır.
- API ve arayüz davranışları yeni sürümlerde değişebilir.
- Bazı özelliklerde performans/senkronizasyon iyileştirmeleri devam ediyor.
- Canlı kullanımdan önce test ortamında doğrulama önerilir.

## Teknoloji
- Frontend: React + TypeScript + TailwindCSS
- Desktop: Tauri
- Backend: Go
- Database: PostgreSQL
- Realtime: WebSocket + PostgreSQL LISTEN/NOTIFY
- Voice: WebRTC + LiveKit (self-hosted)
- Auth: email/username/password + JWT access/refresh

## Klasörler
```text
/apps
  /desktop
  /server
/packages
  /shared
/docs
```

## Gereksinimler
- Node.js 20+
- npm 10+
- Go 1.25+
- PostgreSQL 15+
- Rust stable (Tauri için)
- LiveKit server binary

## İlk Kurulum
1. Ortam dosyalarını oluştur:
   - `Copy-Item apps/server/.env.example apps/server/.env`
   - `Copy-Item apps/desktop/.env.example apps/desktop/.env`
2. Bağımlılıkları kur:
   - `npm install`
3. Go modüllerini hazırla:
   - `cd apps/server && go mod tidy`
4. PostgreSQL içinde `catwa` veritabanını oluştur.
5. Migration çalıştır:
   - `npm run server:migrate:up`

## Çalıştırma
- Backend: `npm run server:dev`
- Web (Vite): `npm run desktop:dev`
- Desktop (Electron): `npm run desktop:start`

## Desktop Dağıtım (Installer + Updater)
- Stable release: `npm run desktop:release:stable`
- Remote publish: `npm run desktop:publish:updates -- --host <VDS_IP> --user root`
- NSIS tema assetlerini yeniden üret: `npm run desktop:installer:theme`

Üretilen dosyalar:
- Installer ve updater artefaktları: `release/updates/stable/`
- Kanal manifesti: `release/updates/stable/latest.json`
- Kanal download haritası: `release/updates/channels.json`

Detaylı akış: `docs/distribution.md`  
Güvenlik politikası: `.github/SECURITY.md`

## Web Download Linkleri
`apps/desktop/.env` içine release linkleri ver:
- `VITE_DOWNLOAD_STABLE_URL`
- `VITE_DOWNLOAD_PORTABLE_URL`

Landing sayfasındaki ana “Windows için indir” butonu `VITE_DOWNLOAD_STABLE_URL` değerini kullanır.

## LiveKit (lokal)
PowerShell:
```powershell
$env:LIVEKIT_KEYS="devkey: secret"
livekit-server --dev --bind 0.0.0.0
```

Bash/zsh:
```bash
LIVEKIT_KEYS="devkey: secret" livekit-server --dev --bind 0.0.0.0
```

## Cloudflare Tunnel (opsiyonel)
- API: `npm run tunnel:api`
- LiveKit: `npm run tunnel:livekit`
