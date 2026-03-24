# Catwa Desktop Distribution

Bu doküman Catwa masaüstü dağıtım akışını ve web indirme entegrasyonunu açıklar.

## 1) Windows Installer

Catwa artık çıplak `.exe` dağıtmıyor; installer üretiyor:

- `MSI` (ana dağıtım)
- `NSIS` (alternatif installer)

Tauri ayarları:

- `apps/desktop/src-tauri/tauri.conf.json`
  - `bundle.active = true`
  - `bundle.targets = ["nsis", "msi"]`
  - `bundle.windows.nsis.startMenuFolder = "Catwa"`
  - `bundle.windows.nsis.headerImage = "icons/installer/header.bmp"`
  - `bundle.windows.nsis.sidebarImage = "icons/installer/sidebar.bmp"`
  - `bundle.windows.nsis.languages = ["Turkish", "English"]`

Bu kurulumlar Start Menu kısayolu, uninstall ve standart kurulum dizini akışını destekler.

## 1.1) NSIS Tema Özelleştirme

NSIS setup görünümü için branded koyu tema assetleri kullanılır:

- `apps/desktop/src-tauri/icons/installer/header.bmp`
- `apps/desktop/src-tauri/icons/installer/sidebar.bmp`

Assetleri yeniden üret:

```powershell
npm run desktop:installer:theme
```

Renkleri script parametresi ile değiştir:

```powershell
powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/generate-installer-theme.ps1 -PrimaryColor "#0A1024" -SecondaryColor "#113B66" -AccentColor "#23D4FF" -ProductName "CATWA"
```

## 2) Auto-Update

Auto-update Tauri Updater eklentisi ile çalışır.

- Rust: `tauri-plugin-updater`
- Frontend: `@tauri-apps/plugin-updater`
- Uygula + yeniden başlat: `@tauri-apps/plugin-process` (`relaunch`)

Kod:

- `apps/desktop/src/components/desktop/DesktopUpdateManager.tsx`

Davranış:

1. Uygulama açıldıktan sonra arka planda sürüm kontrolü yapılır.
2. Yeni sürüm varsa indirme arka planda başlar.
3. Varsayılan olarak startup kontrolünde indirilen sürüm otomatik uygulanır ve uygulama yeniden başlatılır.
4. Manuel/interval kontrolde indirme sonrası “Yeniden başlat ve uygula” diyaloğu gösterilir.
5. Uygulama offline açılırsa, internet geri geldiği anda güncelleme kontrolü otomatik tekrar denenir.

Kontrol env değişkenleri:

- `VITE_UPDATER_ENABLED=true`
- `VITE_UPDATER_CHECK_INTERVAL_MINUTES=30`
- `VITE_UPDATER_AUTO_INSTALL_ON_STARTUP=true`

Önemli:

- Sadece web deploy (`catwa.chat`) yapmak masaüstünü güncellemez.
- Masaüstü güncellemesi için updater artifact + `latest.json` yayınlanmalıdır.

## 3) Release Yapısı

Bu projede tek dağıtım kanalı vardır:

- `stable`

Config dosyası:

- `apps/desktop/src-tauri/config/release.stable.json`

## 4) Release Build Komutları

Root komutları:

```bash
npm run desktop:release:stable
```

Bu komutlar:

1. Stable config ile Tauri build alır.
2. İmzalı updater artifact’lerini toplar.
3. `release/updates/stable/latest.json` üretir.
4. Installer dosyasını `release/updates/stable/` altına kopyalar.
5. `release/updates/channels.json` dosyasını günceller.

Script dosyaları:

- `apps/desktop/scripts/build-release.mjs`
- `apps/desktop/scripts/generate-update-manifest.mjs`

## 5) Signing Key

Updater imzası için private key gerekir:

- Private key: repo dışında tutulur (git’e eklenmez)
- Public key: `apps/desktop/src-tauri/keys/catwa.updater.key.pub`

Kullanılan env değişkenleri:

- `TAURI_SIGNING_PRIVATE_KEY` veya
- `TAURI_SIGNING_PRIVATE_KEY_PATH`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (anahtar şifreliyse)

Release script private key için otomatik repo fallback kullanmaz.

## 6) Publish Script (Remote)

Release dosyalarını VDS'e tek komutla basmak için:

```bash
npm run desktop:publish:updates -- --host <VDS_IP> --user root
```

Opsiyonel parametreler:

- `--base-dir /var/www/html`
- `--port 22`
- `--identity-file ~/.ssh/id_ed25519`
- `--chown catwa:catwa`
- `--dry-run`

Script:

- `apps/desktop/scripts/publish-updates.mjs`

Script varsayılan olarak stable dosyalarını şu path'lere mirror eder:

- `/var/www/html/updates/stable`
- `/var/www/html/stable` (legacy istemci uyumluluğu)
- `/var/www/html/releases/stable` (legacy URL uyumluluğu)

## 7) Website Download Akışı

Landing butonları gerçek dosya URL’lerine bağlıdır:

- Ana CTA: Stable NSIS installer (`.exe`)
- Ek seçenek: Portable (kullanılıyorsa)

Env değişkenleri:

- `VITE_DOWNLOAD_STABLE_URL`
- `VITE_DOWNLOAD_PORTABLE_URL`
- `VITE_WINDOWS_SUPPORT_TEXT`

Ana “Windows için indir” butonu doğrudan stable installer’ı indirir.

## 7.1) Kapalı Kaynak Dağıtım Notu

- Web tarafında yalnızca installer (`Catwa_Installer_x64.exe` / `.msi`) ve updater paketleri (`latest.json`, imzalı artifact) yayınlanır.
- Kaynak kod, repo dosyaları veya geliştirme artifact’leri publish akışına dahil edilmez.
- Discord’daki `Update.exe`/Squirrel düzeni birebir Tauri standardı değildir; Catwa Tauri updater + imzalı manifest modeli ile eşdeğer güvenli güncelleme akışı kullanır.

## 8) Background Update UX

- Yeni sürüm bulundu -> info toast
- Arka planda indirme -> progress kutusu
- İndirme tamamlandı -> “Yeniden başlat ve uygula” diyaloğu

## 9) Launcher-Ready Mimari Hazırlığı

Mevcut yapı ileride ayrı launcher uygulamasına uygun şekilde kuruldu:

- Kanal bazlı artifact klasörü: `release/updates/stable/`
- Kanal manifesti: `release/updates/stable/latest.json`
- Kanal haritası: `release/updates/channels.json`

Launcher ileride bu metadata’yı doğrudan tüketebilir.

## 10) Delta Update Durumu

Bu aşamada full-package update çalışır.

Delta update için sonraki adımlar:

1. CI’de binary diff artifact üretimi
2. Manifest’e delta metadata alanları eklenmesi
3. Client tarafında delta tercih + full paket fallback

Tauri’nin varsayılan updater modeli full paket odaklıdır; gerçek delta için ek pipeline gerekir.
