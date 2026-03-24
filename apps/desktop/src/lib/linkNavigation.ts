import { openExternalUrlNative } from "./desktopBridge";
import { isTauriDesktop } from "./runtime";

export type InternalNavigateFn = (path: string) => void;

export async function openExternalUrl(url: string): Promise<boolean> {
  if (!url.trim()) {
    return false;
  }

  if (isTauriDesktop()) {
    const openedByDesktopRuntime = await openExternalUrlNative(url);
    if (openedByDesktopRuntime) {
      return true;
    }
  }

  try {
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (opened) {
      opened.opener = null;
    }
    return true;
  } catch {
    return false;
  }
}

export function navigateInternalUrl(url: string, navigateInternal?: InternalNavigateFn): void {
  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");

    if (navigateInternal && typeof window !== "undefined" && parsed.origin === window.location.origin) {
      navigateInternal(`${parsed.pathname}${parsed.search}${parsed.hash}`);
      return;
    }

    if (typeof window !== "undefined") {
      window.location.assign(parsed.toString());
    }
  } catch {
    // noop
  }
}
