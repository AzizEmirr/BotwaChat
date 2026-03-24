const { app, BrowserWindow, desktopCapturer, ipcMain, safeStorage, shell } = require("electron");
const { autoUpdater } = require("electron-updater");
const { existsSync } = require("node:fs");
const { mkdir, readFile, rm, writeFile } = require("node:fs/promises");
const path = require("node:path");

const appRootDir = path.resolve(__dirname, "..");
const preloadPath = path.join(__dirname, "preload.cjs");
const distHtmlPath = path.join(appRootDir, "dist", "index.html");
const secureStorePath = path.join(app.getPath("userData"), "secure-store.json");

const devServerUrl = (process.env.CATWA_DEV_SERVER_URL ?? process.env.VITE_DEV_SERVER_URL ?? "").trim();
const hostedAppUrl = (process.env.CATWA_APP_URL ?? "https://catwa.chat").trim();
const hasDevServer = devServerUrl.length > 0;
const startMinimized = process.argv.includes("--start-minimized");
const allowLocalFallbackInPackaged = (process.env.CATWA_ALLOW_LOCAL_FALLBACK ?? "").trim() === "1";
const shouldAllowLocalFallback = !app.isPackaged || allowLocalFallbackInPackaged;
const desktopUserAgent = (app.userAgentFallback ?? "").replace(/\s*Electron\/[^\s]+/i, "").trim();

let mainWindow = null;
let updaterConfigured = false;
let availableUpdateVersion = null;
let downloadedUpdateVersion = null;
let updateCheckPromise = null;
let updateDownloadPromise = null;

function escapeHTML(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildStartupErrorPage(reason) {
  const safeReason = escapeHTML(reason || "Bilinmeyen hata");
  const safeTarget = escapeHTML(hostedAppUrl || "(bos)");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8" /><title>Catwa</title><style>body{margin:0;background:#050a16;color:#d7e3ff;font-family:Segoe UI,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}main{max-width:720px;width:100%;background:#111827;border:1px solid #1f2937;border-radius:14px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.35)}h1{margin:0 0 8px;font-size:22px}p{margin:0 0 12px;color:#b6c3df}code,pre{font-family:Consolas,monospace;font-size:12px}pre{white-space:pre-wrap;background:#0b1220;border:1px solid #263244;border-radius:10px;padding:12px;max-height:220px;overflow:auto}button{margin-top:12px;background:#27324a;border:1px solid #3d4f74;color:#e5edff;border-radius:10px;padding:9px 12px;cursor:pointer}button:hover{background:#324264}</style></head><body><main><h1>Uygulama yuklenemedi</h1><p>Hosted arayuz acilamadi. Internet/VDS erisimi veya DNS kontrol et.</p><p><strong>URL:</strong> <code>${safeTarget}</code></p><pre>${safeReason}</pre><button onclick="location.reload()">Tekrar Dene</button></main></body></html>`;
}

async function loadStartupTarget(window) {
  if (desktopUserAgent) {
    window.webContents.setUserAgent(desktopUserAgent);
  }

  if (hasDevServer) {
    await window.loadURL(devServerUrl);
    return "dev-server";
  }

  if (hostedAppUrl.length > 0) {
    try {
      await window.loadURL(hostedAppUrl);
      return "hosted";
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error ?? "hosted load failed");
      console.error(`[catwa] hosted app load failed: ${reason}`);

      if (shouldAllowLocalFallback && existsSync(distHtmlPath)) {
        await window.loadFile(distHtmlPath);
        return "local-fallback";
      }

      const html = buildStartupErrorPage(reason);
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return "error-page";
    }
  }

  if (shouldAllowLocalFallback && existsSync(distHtmlPath)) {
    await window.loadFile(distHtmlPath);
    return "local";
  }

  const html = buildStartupErrorPage("Hosted URL tanimli degil ve local fallback kapali.");
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return "error-page";
}

function isUpdaterRuntimeSupported() {
  return app.isPackaged && !hasDevServer && process.platform === "win32";
}

function normalizeUpdaterHeaders(headers) {
  if (!headers || typeof headers !== "object") {
    return {};
  }

  const normalized = {};
  for (const [key, value] of Object.entries(headers)) {
    if (typeof key !== "string" || key.trim() === "") {
      continue;
    }
    if (typeof value !== "string") {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      continue;
    }
    normalized[key] = trimmed;
  }

  return normalized;
}

function isVersionDifferent(currentVersion, nextVersion) {
  const current = String(currentVersion ?? "")
    .trim()
    .replace(/^v/i, "");
  const next = String(nextVersion ?? "")
    .trim()
    .replace(/^v/i, "");

  if (!current || !next) {
    return false;
  }

  return current !== next;
}

function configureAutoUpdater() {
  if (!isUpdaterRuntimeSupported()) {
    return false;
  }

  if (updaterConfigured) {
    return true;
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("update-available", (info) => {
    const version = typeof info?.version === "string" ? info.version.trim() : "";
    availableUpdateVersion = version || null;
  });

  autoUpdater.on("update-not-available", () => {
    availableUpdateVersion = null;
  });

  autoUpdater.on("update-downloaded", (info) => {
    const version = typeof info?.version === "string" ? info.version.trim() : "";
    downloadedUpdateVersion = version || availableUpdateVersion;
  });

  autoUpdater.on("error", (error) => {
    const message = error instanceof Error ? error.message : String(error ?? "updater error");
    console.error(`[updater] ${message}`);
  });

  updaterConfigured = true;
  return true;
}

async function checkForUpdates(headers) {
  if (!configureAutoUpdater()) {
    return { available: false, version: null };
  }

  const requestHeaders = normalizeUpdaterHeaders(headers);
  if (Object.keys(requestHeaders).length > 0) {
    autoUpdater.requestHeaders = requestHeaders;
  }

  if (updateCheckPromise) {
    return updateCheckPromise;
  }

  updateCheckPromise = (async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const resultVersionRaw = result?.updateInfo?.version;
      const resultVersion = typeof resultVersionRaw === "string" ? resultVersionRaw.trim() : "";
      const normalizedResultVersion = resultVersion || null;
      const trackedVersion = downloadedUpdateVersion ?? availableUpdateVersion ?? normalizedResultVersion;

      const available =
        Boolean(downloadedUpdateVersion) ||
        Boolean(availableUpdateVersion) ||
        (normalizedResultVersion !== null && isVersionDifferent(app.getVersion(), normalizedResultVersion));

      if (!available) {
        availableUpdateVersion = null;
      } else if (!availableUpdateVersion && !downloadedUpdateVersion && normalizedResultVersion) {
        availableUpdateVersion = normalizedResultVersion;
      }

      return {
        available,
        version: trackedVersion
      };
    } finally {
      updateCheckPromise = null;
    }
  })();

  return updateCheckPromise;
}

async function downloadUpdate() {
  if (!configureAutoUpdater()) {
    return { version: null };
  }

  if (downloadedUpdateVersion) {
    return { version: downloadedUpdateVersion };
  }

  if (updateDownloadPromise) {
    return updateDownloadPromise;
  }

  updateDownloadPromise = (async () => {
    try {
      if (!availableUpdateVersion) {
        const checkResult = await checkForUpdates({});
        if (!checkResult.available) {
          return { version: null };
        }
      }

      await autoUpdater.downloadUpdate();
      const version = downloadedUpdateVersion ?? availableUpdateVersion ?? null;
      if (version && !downloadedUpdateVersion) {
        downloadedUpdateVersion = version;
      }

      return { version };
    } finally {
      updateDownloadPromise = null;
    }
  })();

  return updateDownloadPromise;
}

async function installUpdateAndRelaunch() {
  if (!configureAutoUpdater() || !downloadedUpdateVersion) {
    return false;
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return true;
}

function sanitizeLabel(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value
    .replace(/\r/g, " ")
    .replace(/\n/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ")
    .trim();
}

function resolveBrowserWindow(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win ?? mainWindow;
}

async function readSecureStore() {
  if (!existsSync(secureStorePath)) {
    return {};
  }

  try {
    const raw = await readFile(secureStorePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return {};
    }
    return parsed;
  } catch {
    return {};
  }
}

async function writeSecureStore(payload) {
  const directory = path.dirname(secureStorePath);
  await mkdir(directory, { recursive: true });
  await writeFile(secureStorePath, JSON.stringify(payload), "utf8");
}

async function secureStoreGet(key) {
  if (!safeStorage.isEncryptionAvailable()) {
    return null;
  }

  const payload = await readSecureStore();
  const encoded = payload?.[key];
  if (typeof encoded !== "string" || encoded.trim() === "") {
    return null;
  }

  try {
    const decrypted = safeStorage.decryptString(Buffer.from(encoded, "base64"));
    return decrypted;
  } catch {
    return null;
  }
}

async function secureStoreSet(key, value) {
  if (!safeStorage.isEncryptionAvailable()) {
    return false;
  }

  const payload = await readSecureStore();
  const encrypted = safeStorage.encryptString(value).toString("base64");
  payload[key] = encrypted;
  await writeSecureStore(payload);
  return true;
}

async function secureStoreDelete(key) {
  const payload = await readSecureStore();
  if (!(key in payload)) {
    return;
  }

  delete payload[key];
  if (Object.keys(payload).length === 0) {
    try {
      await rm(secureStorePath);
    } catch {
      // noop
    }
    return;
  }

  await writeSecureStore(payload);
}

function startupScriptPath() {
  if (process.platform !== "win32") {
    throw new Error("startup integration is only supported on Windows");
  }

  const appData = process.env.APPDATA;
  if (!appData) {
    throw new Error("APPDATA environment variable is missing");
  }

  return path.join(appData, "Microsoft", "Windows", "Start Menu", "Programs", "Startup", "Catwa Startup.cmd");
}

async function readStartupConfiguration() {
  if (process.platform !== "win32") {
    return {
      enabled: false,
      startMinimized: false
    };
  }

  const scriptPath = startupScriptPath();
  if (!existsSync(scriptPath)) {
    return {
      enabled: false,
      startMinimized: false
    };
  }

  const content = await readFile(scriptPath, "utf8").catch(() => "");
  return {
    enabled: true,
    startMinimized: content.includes("--start-minimized")
  };
}

async function configureStartup(enabled, startMinimizedValue) {
  if (process.platform !== "win32") {
    return {
      enabled: false,
      startMinimized: false
    };
  }

  const scriptPath = startupScriptPath();

  if (!enabled) {
    try {
      await rm(scriptPath);
    } catch {
      // noop
    }
    return readStartupConfiguration();
  }

  const exePath = process.execPath.replace(/"/g, '""');
  const args = startMinimizedValue ? "--autostart --start-minimized" : "--autostart";
  const scriptContent = `@echo off\r\nstart "" "${exePath}" ${args}\r\n`;
  await mkdir(path.dirname(scriptPath), { recursive: true });
  await writeFile(scriptPath, scriptContent, "utf8");

  return readStartupConfiguration();
}

async function listScreenShareSources() {
  const sources = await desktopCapturer.getSources({
    types: ["window", "screen"],
    thumbnailSize: {
      width: 520,
      height: 300
    },
    fetchWindowIcons: false
  });

  const applications = [];
  const screens = [];

  for (const source of sources) {
    const label = sanitizeLabel(source.name) || (source.id.startsWith("window:") ? "Uygulama" : "Ekran");
    const thumbnailDataUrl = source.thumbnail && !source.thumbnail.isEmpty() ? source.thumbnail.toDataURL() : null;
    const item = {
      id: source.id,
      label,
      description: source.id,
      thumbnailDataUrl
    };

    if (source.id.startsWith("window:")) {
      applications.push(item);
    } else {
      screens.push(item);
    }
  }

  return {
    applications,
    screens
  };
}

async function nativeFetch(request) {
  const headers = new Headers(request?.headers ?? {});
  const body = request?.bodyBase64 ? Buffer.from(request.bodyBase64, "base64") : undefined;
  const response = await fetch(request.url, {
    method: request.method,
    headers,
    body
  });

  const responseHeaders = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const bodyBuffer = Buffer.from(await response.arrayBuffer());

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    bodyBase64: bodyBuffer.toString("base64")
  };
}

async function createMainWindow() {
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    frame: false,
    titleBarStyle: "hiddenInset",
    autoHideMenuBar: true,
    backgroundColor: "#0b1020",
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow = window;

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  const startupLoadMode = await loadStartupTarget(window);
  if (hasDevServer && startupLoadMode === "dev-server") {
    window.webContents.openDevTools({ mode: "detach" });
  }

  if (startMinimized) {
    window.minimize();
  } else {
    window.show();
  }
}

function registerIpcHandlers() {
  ipcMain.handle("catwa:get-app-version", async () => app.getVersion());

  ipcMain.handle("catwa:window-minimize", async (event) => {
    resolveBrowserWindow(event)?.minimize();
  });

  ipcMain.handle("catwa:window-toggle-maximize", async (event) => {
    const target = resolveBrowserWindow(event);
    if (!target) {
      return;
    }

    if (target.isMaximized()) {
      target.unmaximize();
      return;
    }
    target.maximize();
  });

  ipcMain.handle("catwa:window-close", async (event) => {
    resolveBrowserWindow(event)?.close();
  });

  ipcMain.handle("catwa:window-focus", async (event) => {
    resolveBrowserWindow(event)?.focus();
  });

  ipcMain.handle("catwa:set-badge-count", async (_event, count) => {
    const normalized = typeof count === "number" && count > 0 ? count : 0;
    app.setBadgeCount(normalized);
  });

  ipcMain.handle("catwa:request-user-attention", async (event) => {
    const target = resolveBrowserWindow(event);
    if (!target) {
      return;
    }

    target.flashFrame(true);
    setTimeout(() => {
      target.flashFrame(false);
    }, 2000);
  });

  ipcMain.handle("catwa:open-external-url", async (_event, url) => {
    try {
      await shell.openExternal(url);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle("catwa:secure-store-get", async (_event, key) => secureStoreGet(String(key ?? "")));

  ipcMain.handle("catwa:secure-store-set", async (_event, key, value) => {
    if (typeof key !== "string" || key.trim() === "" || typeof value !== "string") {
      return false;
    }
    return secureStoreSet(key, value);
  });

  ipcMain.handle("catwa:secure-store-delete", async (_event, key) => {
    if (typeof key !== "string" || key.trim() === "") {
      return;
    }
    await secureStoreDelete(key);
  });

  ipcMain.handle("catwa:startup-read", async () => readStartupConfiguration());

  ipcMain.handle("catwa:startup-configure", async (_event, enabled, startMinimizedValue) =>
    configureStartup(Boolean(enabled), Boolean(startMinimizedValue))
  );

  ipcMain.handle("catwa:screen-share-list-sources", async () => listScreenShareSources());

  ipcMain.handle("catwa:native-fetch", async (_event, request) => nativeFetch(request));

  ipcMain.handle("catwa:updater-is-supported", async () => isUpdaterRuntimeSupported());

  ipcMain.handle("catwa:updater-check", async (_event, headers) => checkForUpdates(headers));

  ipcMain.handle("catwa:updater-download", async () => downloadUpdate());

  ipcMain.handle("catwa:updater-install-and-relaunch", async () => installUpdateAndRelaunch());
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

app.whenReady().then(async () => {
  registerIpcHandlers();
  await createMainWindow();
});
