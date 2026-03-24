type RuntimeWindow = Window & {
  __CATWA_ELECTRON__?: unknown;
};

export function isDesktopRuntime(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const candidate = window as RuntimeWindow;
  if (candidate.__CATWA_ELECTRON__) {
    return true;
  }

  return typeof navigator !== "undefined" && /electron/i.test(navigator.userAgent);
}

// Backward-compat alias for existing call sites.
export function isTauriDesktop(): boolean {
  return isDesktopRuntime();
}
