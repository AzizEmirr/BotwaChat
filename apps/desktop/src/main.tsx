import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { showConsoleSafetyWarning } from "./lib/consoleSafetyWarning";
import "./styles/index.css";

const CHUNK_RECOVERY_KEY = "catwa.chunkRecoveryReloaded";
const CHUNK_RECOVERY_COOLDOWN_MS = 15 * 60 * 1000;
const BUILD_REVISION = "2026-03-19T15:53+03:00";
const SPLASH_FADE_MS = 280;

if (typeof window !== "undefined") {
  (window as typeof window & { __CATWA_BUILD__?: string }).__CATWA_BUILD__ = BUILD_REVISION;
  const topWindow = window.top;
  if (topWindow && topWindow !== window.self) {
    try {
      topWindow.location.href = window.location.href;
    } catch {
      window.location.href = window.location.href;
    }
  }
}

function tryRecoverFromChunkError() {
  try {
    const now = Date.now();
    const rawLastReloadAt = window.sessionStorage.getItem(CHUNK_RECOVERY_KEY);
    const lastReloadAt = rawLastReloadAt ? Number.parseInt(rawLastReloadAt, 10) : Number.NaN;
    const wasRecentlyReloaded = Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RECOVERY_COOLDOWN_MS;

    if (wasRecentlyReloaded) {
      return;
    }

    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  } catch {
    // ignore storage errors and still reload once
  }

  window.location.reload();
}

function registerServiceWorker() {
  if (import.meta.env.DEV) {
    return;
  }
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js").catch(() => {
      // noop
    });
  });
}

function dismissStartupSplash() {
  if (typeof window === "undefined") {
    return;
  }
  const splash = document.getElementById("catwa-startup-splash");
  if (!splash) {
    return;
  }
  splash.classList.add("is-hidden");
  window.setTimeout(() => {
    splash.remove();
  }, SPLASH_FADE_MS);
}

function installMobileZoomLock() {
  if (typeof window === "undefined") {
    return;
  }
  const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
  if (!isCoarsePointer) {
    return;
  }

  const preventGesture = (event: Event) => {
    event.preventDefault();
  };
  const onTouchMove = (event: TouchEvent) => {
    if (event.touches.length > 1) {
      event.preventDefault();
    }
  };
  let lastTouchEnd = 0;
  const onTouchEnd = (event: TouchEvent) => {
    const now = Date.now();
    if (now - lastTouchEnd <= 320) {
      event.preventDefault();
    }
    lastTouchEnd = now;
  };

  document.addEventListener("gesturestart", preventGesture, { passive: false });
  document.addEventListener("gesturechange", preventGesture, { passive: false });
  document.addEventListener("gestureend", preventGesture, { passive: false });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  document.addEventListener("touchend", onTouchEnd, { passive: false });
}

window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  tryRecoverFromChunkError();
});

window.addEventListener("error", (event) => {
  const message = String(event.message ?? "");
  if (message.includes("Loading chunk") || message.includes("dynamically imported module")) {
    tryRecoverFromChunkError();
  }
});

window.addEventListener("unhandledrejection", (event) => {
  const reason = String((event.reason as { message?: string } | undefined)?.message ?? event.reason ?? "");
  if (reason.includes("Loading chunk") || reason.includes("dynamically imported module")) {
    tryRecoverFromChunkError();
  }
});

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

showConsoleSafetyWarning();
registerServiceWorker();
installMobileZoomLock();

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);

window.requestAnimationFrame(() => {
  dismissStartupSplash();
});
