export type StartupConfiguration = {
  enabled: boolean;
  startMinimized: boolean;
};

export type NativeScreenShareSource = {
  id: string;
  label: string;
  description: string;
  thumbnailDataUrl?: string | null;
};

export type NativeScreenShareSources = {
  applications: NativeScreenShareSource[];
  screens: NativeScreenShareSource[];
};

export type NativeFetchRequest = {
  url: string;
  method: string;
  headers: Record<string, string>;
  bodyBase64?: string;
};

export type NativeFetchResponse = {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  bodyBase64: string;
};

export type NativeUpdaterCheckResult = {
  available: boolean;
  version: string | null;
};

export type NativeUpdaterDownloadResult = {
  version: string | null;
};

type DesktopBridge = {
  isDesktopRuntime?: boolean;
  getAppVersion?: () => Promise<string>;
  windowMinimize?: () => Promise<void>;
  windowToggleMaximize?: () => Promise<void>;
  windowClose?: () => Promise<void>;
  windowFocus?: () => Promise<void>;
  setBadgeCount?: (count?: number) => Promise<void>;
  requestUserAttention?: () => Promise<void>;
  openExternalUrl?: (url: string) => Promise<boolean>;
  secureStoreGet?: (key: string) => Promise<string | null>;
  secureStoreSet?: (key: string, value: string) => Promise<boolean>;
  secureStoreDelete?: (key: string) => Promise<void>;
  readStartupConfiguration?: () => Promise<StartupConfiguration>;
  configureStartup?: (enabled: boolean, startMinimized: boolean) => Promise<StartupConfiguration>;
  listScreenShareSources?: () => Promise<NativeScreenShareSources>;
  nativeFetch?: (request: NativeFetchRequest) => Promise<NativeFetchResponse>;
  isUpdaterSupported?: () => Promise<boolean>;
  checkForUpdates?: (headers?: Record<string, string>) => Promise<NativeUpdaterCheckResult>;
  downloadUpdate?: () => Promise<NativeUpdaterDownloadResult>;
  installUpdateAndRelaunch?: () => Promise<boolean>;
};

const DEFAULT_STARTUP_CONFIG: StartupConfiguration = {
  enabled: false,
  startMinimized: false
};

function getDesktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as Window & { __CATWA_ELECTRON__?: DesktopBridge }).__CATWA_ELECTRON__ ?? null;
}

export function hasDesktopBridge(): boolean {
  const bridge = getDesktopBridge();
  return Boolean(bridge?.isDesktopRuntime);
}

export async function getDesktopAppVersion(): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.getAppVersion) {
    return null;
  }
  try {
    const version = await bridge.getAppVersion();
    return typeof version === "string" && version.trim() ? version : null;
  } catch {
    return null;
  }
}

export async function minimizeDesktopWindow(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.windowMinimize) {
    return;
  }
  try {
    await bridge.windowMinimize();
  } catch {
    // noop
  }
}

export async function toggleDesktopWindowSize(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.windowToggleMaximize) {
    return;
  }
  try {
    await bridge.windowToggleMaximize();
  } catch {
    // noop
  }
}

export async function closeDesktopWindow(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.windowClose) {
    return;
  }
  try {
    await bridge.windowClose();
  } catch {
    // noop
  }
}

export async function focusDesktopWindow(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.windowFocus) {
    return;
  }
  try {
    await bridge.windowFocus();
  } catch {
    // noop
  }
}

export async function setDesktopBadgeCount(count?: number): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.setBadgeCount) {
    return;
  }
  try {
    await bridge.setBadgeCount(count);
  } catch {
    // noop
  }
}

export async function requestDesktopAttention(): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.requestUserAttention) {
    return;
  }
  try {
    await bridge.requestUserAttention();
  } catch {
    // noop
  }
}

export async function openExternalUrlNative(url: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.openExternalUrl) {
    return false;
  }
  try {
    return await bridge.openExternalUrl(url);
  } catch {
    return false;
  }
}

export async function secureStoreGet(key: string): Promise<string | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.secureStoreGet) {
    return null;
  }
  try {
    return await bridge.secureStoreGet(key);
  } catch {
    return null;
  }
}

export async function secureStoreSet(key: string, value: string): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.secureStoreSet) {
    return false;
  }
  try {
    return await bridge.secureStoreSet(key, value);
  } catch {
    return false;
  }
}

export async function secureStoreDelete(key: string): Promise<void> {
  const bridge = getDesktopBridge();
  if (!bridge?.secureStoreDelete) {
    return;
  }
  try {
    await bridge.secureStoreDelete(key);
  } catch {
    // noop
  }
}

export async function readDesktopStartupConfiguration(): Promise<StartupConfiguration> {
  const bridge = getDesktopBridge();
  if (!bridge?.readStartupConfiguration) {
    return DEFAULT_STARTUP_CONFIG;
  }
  try {
    return await bridge.readStartupConfiguration();
  } catch {
    return DEFAULT_STARTUP_CONFIG;
  }
}

export async function configureDesktopStartup(enabled: boolean, startMinimized: boolean): Promise<StartupConfiguration> {
  const bridge = getDesktopBridge();
  if (!bridge?.configureStartup) {
    return DEFAULT_STARTUP_CONFIG;
  }
  try {
    return await bridge.configureStartup(enabled, startMinimized);
  } catch {
    return DEFAULT_STARTUP_CONFIG;
  }
}

export async function listDesktopScreenShareSources(): Promise<NativeScreenShareSources> {
  const bridge = getDesktopBridge();
  if (!bridge?.listScreenShareSources) {
    return { applications: [], screens: [] };
  }
  try {
    const payload = await bridge.listScreenShareSources();
    return {
      applications: Array.isArray(payload?.applications) ? payload.applications : [],
      screens: Array.isArray(payload?.screens) ? payload.screens : []
    };
  } catch {
    return { applications: [], screens: [] };
  }
}

export async function nativeDesktopFetch(request: NativeFetchRequest): Promise<NativeFetchResponse | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.nativeFetch) {
    return null;
  }
  try {
    return await bridge.nativeFetch(request);
  } catch {
    return null;
  }
}

export async function isDesktopUpdaterSupported(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.isUpdaterSupported) {
    return false;
  }
  try {
    return await bridge.isUpdaterSupported();
  } catch {
    return false;
  }
}

export async function checkDesktopForUpdates(headers: Record<string, string>): Promise<NativeUpdaterCheckResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.checkForUpdates) {
    return null;
  }
  try {
    return await bridge.checkForUpdates(headers);
  } catch {
    return null;
  }
}

export async function downloadDesktopUpdate(): Promise<NativeUpdaterDownloadResult | null> {
  const bridge = getDesktopBridge();
  if (!bridge?.downloadUpdate) {
    return null;
  }
  try {
    return await bridge.downloadUpdate();
  } catch {
    return null;
  }
}

export async function installDesktopUpdateAndRelaunch(): Promise<boolean> {
  const bridge = getDesktopBridge();
  if (!bridge?.installUpdateAndRelaunch) {
    return false;
  }
  try {
    return await bridge.installUpdateAndRelaunch();
  } catch {
    return false;
  }
}
