# Catwa Updater Keys

Do not commit private signing keys to the repository.

- `catwa.updater.key.pub`: public key (safe to commit)
- private key: keep outside the repo and load via environment variables

## Generate keys

```bash
npx tauri signer generate --ci --write-keys /secure/path/catwa.updater.key
```

## Build signing configuration

Use one of these:

```bash
export TAURI_SIGNING_PRIVATE_KEY="$(cat /secure/path/catwa.updater.key)"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-key-password"
```

or

```bash
export TAURI_SIGNING_PRIVATE_KEY_PATH="/secure/path/catwa.updater.key"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-key-password"
```

PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY_PATH = "C:\\secure\\catwa.updater.key"
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "your-key-password"
```
