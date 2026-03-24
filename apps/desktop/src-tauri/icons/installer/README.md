# NSIS Installer Theme Assets

Bu klasor NSIS setup gorunumu icin kullanilan brand assetlerini tutar.

- `header.bmp` (150x57): Setup sayfalarinin ust baslik gorseli
- `sidebar.bmp` (164x314): Welcome / Finish sidebar gorseli

Yeniden uretmek icin:

```powershell
npm run desktop:installer:theme
```

Renkleri ozellestirmek icin:

```powershell
powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/generate-installer-theme.ps1 -PrimaryColor "#0A1024" -SecondaryColor "#113B66" -AccentColor "#23D4FF" -ProductName "CATWA"
```
