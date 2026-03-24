set -euo pipefail
for ch in stable beta dev; do
  mkdir -p "/var/www/html/updates/$ch" "/var/www/html/releases/$ch"
  install -m 0644 /tmp/Catwa_0.1.1_x64-setup.exe "/var/www/html/updates/$ch/Catwa_Installer_x64.exe"
  install -m 0644 /tmp/Catwa_0.1.1_x64-setup.exe "/var/www/html/releases/$ch/Catwa_Installer_x64.exe"
done
chown -R catwa:catwa /var/www/html/updates /var/www/html/releases
rm -f /tmp/Catwa_0.1.1_x64-setup.exe
