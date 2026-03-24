import type { AuthTokens } from "../types/chat";
import { isTauriDesktop } from "./runtime";
import { secureStoreDelete, secureStoreGet, secureStoreSet } from "./desktopBridge";

const ACCESS_TOKEN_STORAGE_KEY = "catwa.accessToken";
const REFRESH_TOKEN_STORAGE_KEY = "catwa.refreshToken";

const SECURE_ACCESS_KEY = "auth.access";
const SECURE_REFRESH_KEY = "auth.refresh";
const SECURE_PROBE_KEY = "__catwa.secure-probe__";

let secureStoreAvailable: boolean | null = null;

function buildTokens(accessToken: string, refreshToken: string): AuthTokens {
  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: 0
  };
}

function readLocalTokens(): AuthTokens | null {
  if (typeof window === "undefined") {
    return null;
  }

  const accessToken = window.localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_STORAGE_KEY);
  if (!accessToken || !refreshToken) {
    return null;
  }

  return buildTokens(accessToken, refreshToken);
}

function clearLocalTokens() {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  window.localStorage.removeItem(REFRESH_TOKEN_STORAGE_KEY);
}

function writeLocalTokens(tokens: AuthTokens) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, tokens.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_STORAGE_KEY, tokens.refreshToken);
}

async function secureGet(key: string): Promise<string | null> {
  const value = await secureStoreGet(key);
  return typeof value === "string" && value.trim() ? value : null;
}

async function isSecureStoreAvailable(): Promise<boolean> {
  if (!isTauriDesktop()) {
    return false;
  }

  if (secureStoreAvailable !== null) {
    return secureStoreAvailable;
  }

  const probeValue = `probe:${Date.now()}`;
  const wrote = await secureStoreSet(SECURE_PROBE_KEY, probeValue);
  if (!wrote) {
    secureStoreAvailable = false;
    return secureStoreAvailable;
  }
  await secureStoreDelete(SECURE_PROBE_KEY);
  secureStoreAvailable = true;

  return secureStoreAvailable;
}

async function secureSet(key: string, value: string): Promise<boolean> {
  return secureStoreSet(key, value);
}

async function secureDelete(key: string): Promise<void> {
  await secureStoreDelete(key);
}

async function clearSecureTokens() {
  await Promise.all([secureDelete(SECURE_ACCESS_KEY), secureDelete(SECURE_REFRESH_KEY)]);
}

async function readDesktopTokens(): Promise<AuthTokens | null> {
  const localTokens = readLocalTokens();
  const secureEnabled = await isSecureStoreAvailable();
  if (!secureEnabled) {
    return localTokens;
  }

  const [secureAccessToken, secureRefreshToken] = await Promise.all([
    secureGet(SECURE_ACCESS_KEY),
    secureGet(SECURE_REFRESH_KEY)
  ]);

  if (secureAccessToken && secureRefreshToken) {
    const secureTokens = buildTokens(secureAccessToken, secureRefreshToken);
    writeLocalTokens(secureTokens);
    return secureTokens;
  }

  if (secureAccessToken || secureRefreshToken) {
    await clearSecureTokens();
  }

  return localTokens;
}

export async function readStoredTokens(): Promise<AuthTokens | null> {
  if (!isTauriDesktop()) {
    return readLocalTokens();
  }
  return readDesktopTokens();
}

export async function persistTokens(tokens: AuthTokens | null): Promise<void> {
  if (!isTauriDesktop()) {
    if (!tokens) {
      clearLocalTokens();
      return;
    }
    writeLocalTokens(tokens);
    return;
  }

  if (!tokens) {
    clearLocalTokens();
    if (await isSecureStoreAvailable()) {
      await clearSecureTokens();
    }
    return;
  }

  writeLocalTokens(tokens);
  if (!(await isSecureStoreAvailable())) {
    return;
  }

  const [wroteAccess, wroteRefresh] = await Promise.all([
    secureSet(SECURE_ACCESS_KEY, tokens.accessToken),
    secureSet(SECURE_REFRESH_KEY, tokens.refreshToken)
  ]);

  if (!wroteAccess || !wroteRefresh) {
    await clearSecureTokens();
  }
}
