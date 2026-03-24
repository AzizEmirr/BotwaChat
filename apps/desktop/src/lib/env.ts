type ClientEnv = {
  appName: string;
  apiBaseUrl: string;
  wsBaseUrl: string;
  cdnBaseUrl: string;
  turnstileSiteKey: string;
  updater: {
    enabled: boolean;
    checkIntervalMinutes: number;
    allowDev: boolean;
    autoInstallOnStartup: boolean;
  };
  downloads: {
    stable: string;
    portable: string;
  };
  windowsSupport: string;
};

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on") {
    return true;
  }
  if (normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off") {
    return false;
  }
  return fallback;
}

function parseIntervalMinutes(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 5) {
    return fallback;
  }
  return parsed;
}

function defaultApiBaseUrl(): string {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  return import.meta.env.DEV ? "http://localhost:8080" : "https://api.catwa.chat";
}

function defaultWsBaseUrl(): string {
  if (import.meta.env.VITE_WS_BASE_URL) {
    return import.meta.env.VITE_WS_BASE_URL;
  }
  return import.meta.env.DEV ? "ws://localhost:8080/ws" : "wss://ws.catwa.chat/ws";
}

function defaultCdnBaseUrl(): string {
  if (import.meta.env.VITE_CDN_BASE_URL) {
    return import.meta.env.VITE_CDN_BASE_URL;
  }
  return import.meta.env.DEV ? "http://localhost:8080" : "https://cdn.catwa.chat";
}

const defaultUpdaterEnabled = !import.meta.env.DEV;
const installerFileName = `Catwa Desktop Setup ${__CATWA_APP_VERSION__}.exe`;
const latestInstallerUrl = `https://downloads.catwa.chat/updates/stable/${encodeURIComponent(installerFileName)}`;

function normalizeDownloadUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) {
    return latestInstallerUrl;
  }
  if (/\/Catwa_Installer_x64\.exe$/i.test(raw) || /\/Catwa_Latest_x64_Setup\.exe$/i.test(raw)) {
    return latestInstallerUrl;
  }
  return raw;
}

export const env: ClientEnv = {
  appName: import.meta.env.VITE_APP_NAME ?? "Catwa",
  apiBaseUrl: defaultApiBaseUrl(),
  wsBaseUrl: defaultWsBaseUrl(),
  cdnBaseUrl: defaultCdnBaseUrl(),
  turnstileSiteKey: (import.meta.env.VITE_TURNSTILE_SITE_KEY ?? "").trim(),
  updater: {
    enabled: parseBoolean(import.meta.env.VITE_UPDATER_ENABLED, defaultUpdaterEnabled),
    checkIntervalMinutes: parseIntervalMinutes(import.meta.env.VITE_UPDATER_CHECK_INTERVAL_MINUTES, 30),
    allowDev: parseBoolean(import.meta.env.VITE_UPDATER_ALLOW_DEV, false),
    autoInstallOnStartup: parseBoolean(import.meta.env.VITE_UPDATER_AUTO_INSTALL_ON_STARTUP, true)
  },
  downloads: {
    stable: normalizeDownloadUrl(import.meta.env.VITE_DOWNLOAD_STABLE_URL),
    portable: normalizeDownloadUrl(import.meta.env.VITE_DOWNLOAD_PORTABLE_URL)
  },
  windowsSupport: import.meta.env.VITE_WINDOWS_SUPPORT_TEXT ?? "Windows 10 / 11 (64-bit)"
};
