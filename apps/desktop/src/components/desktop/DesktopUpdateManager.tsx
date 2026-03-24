import * as Dialog from "@radix-ui/react-dialog";
import { Loader2, RefreshCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  checkDesktopForUpdates,
  downloadDesktopUpdate,
  getDesktopAppVersion,
  installDesktopUpdateAndRelaunch,
  isDesktopUpdaterSupported
} from "../../lib/desktopBridge";
import { env } from "../../lib/env";
import { getReleaseChannel, getReleaseChannelLabel, getUpdaterRequestHeaders } from "../../lib/release";
import { isTauriDesktop } from "../../lib/runtime";
import { useChatStore } from "../../store/chatStore";
import { useDesktopUpdateStore } from "../../store/desktopUpdateStore";
import { toastError, toastInfo, toastSuccess } from "../../store/toastStore";

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeMessage = (error as { message?: unknown }).message;
    if (typeof maybeMessage === "string") {
      return maybeMessage;
    }
  }
  return String(error ?? "");
}

function normalizeUpdaterError(error: unknown): string {
  const rawMessage = getErrorMessage(error);
  const message = rawMessage || "Güncelleme işlemi başarısız oldu.";
  if (message.toLowerCase().includes("offline")) {
    return "İnternet bağlantısı olmadığı için güncelleme kontrol edilemedi.";
  }
  return message;
}


function headersToRecord(headers: HeadersInit): Record<string, string> {
  const normalized = new Headers(headers);
  return Object.fromEntries(normalized.entries());
}
async function checkInternetReachability(apiBaseUrl: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return false;
  }

  if (typeof fetch !== "function" || typeof AbortController === "undefined") {
    return true;
  }

  const controller = new AbortController();
  const timeoutID = window.setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}/health`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    return response.ok;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timeoutID);
  }
}

export function DesktopUpdateManager() {
  const appStatus = useChatStore((state) => state.appStatus);
  const manualCheckNonce = useDesktopUpdateStore((state) => state.requestNonce);
  const setUpdaterEnabled = useDesktopUpdateStore((state) => state.setEnabled);
  const setStoreChecking = useDesktopUpdateStore((state) => state.setChecking);
  const setStoreDownloading = useDesktopUpdateStore((state) => state.setDownloading);
  const setStoreReadyVersion = useDesktopUpdateStore((state) => state.setReadyVersion);
  const [checking, setChecking] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [installedVersion, setInstalledVersion] = useState<string | null>(__CATWA_APP_VERSION__ || null);
  const [readyVersion, setReadyVersion] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [nativeUpdaterSupported, setNativeUpdaterSupported] = useState(false);

  const inFlightRef = useRef(false);
  const startupCheckDoneRef = useRef(false);
  const startupCheckWaitingForNetworkRef = useRef(false);
  const autoInstallInFlightRef = useRef(false);
  const latestDownloadVersionRef = useRef<string | null>(null);

  const channel = getReleaseChannel();
  const channelLabel = getReleaseChannelLabel(channel);
  const eligibleRuntime = isTauriDesktop() && env?.updater?.enabled && (!import.meta.env.DEV || env?.updater?.allowDev);
  const enabled = eligibleRuntime && nativeUpdaterSupported;

  const canReachInternet = useCallback(() => checkInternetReachability(env.apiBaseUrl), []);

  const shouldAutoInstall = useCallback(
    (source: "startup" | "interval" | "manual" | "online") =>
      env.updater.autoInstallOnStartup && (source === "startup" || source === "online"),
    []
  );

  useEffect(() => {
    let mounted = true;

    if (!eligibleRuntime) {
      setNativeUpdaterSupported(false);
      return () => {
        mounted = false;
      };
    }

    void isDesktopUpdaterSupported()
      .then((supported) => {
        if (mounted) {
          setNativeUpdaterSupported(Boolean(supported));
        }
      })
      .catch(() => {
        if (mounted) {
          setNativeUpdaterSupported(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [eligibleRuntime]);

  useEffect(() => {
    if (!enabled) {
      setInstalledVersion(__CATWA_APP_VERSION__ || null);
      return;
    }

    let mounted = true;
    void getDesktopAppVersion()
      .then((version) => {
        if (mounted) {
          setInstalledVersion((version ?? __CATWA_APP_VERSION__) || null);
        }
      })
      .catch(() => {
        if (mounted) {
          setInstalledVersion(__CATWA_APP_VERSION__ || null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [enabled]);

  const installDownloadedUpdate = useCallback(
    async (source: "startup" | "interval" | "manual" | "online") => {
      if (autoInstallInFlightRef.current) {
        return false;
      }
      autoInstallInFlightRef.current = true;
      setApplying(true);
      try {
        const installed = await installDesktopUpdateAndRelaunch();
        if (!installed) {
          throw new Error("Yerel updater bu sürümde güncellemeyi uygulayamadı.");
        }
        return true;
      } catch (error) {
        const message = normalizeUpdaterError(error);
        toastError(
          "Güncelleme uygulanamadı",
          source === "startup"
            ? `${message} Güncelleme indirildi, uygulamayı yeniden başlatarak tekrar deneyebilirsin.`
            : message,
          "update-apply-failed"
        );
        setApplying(false);
        return false;
      } finally {
        autoInstallInFlightRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    setUpdaterEnabled(enabled);
    if (!enabled) {
      setStoreChecking(false);
      setStoreDownloading(false);
      setStoreReadyVersion(null);
      startupCheckDoneRef.current = false;
      startupCheckWaitingForNetworkRef.current = false;
      latestDownloadVersionRef.current = null;
    }
  }, [enabled, setStoreChecking, setStoreDownloading, setStoreReadyVersion, setUpdaterEnabled]);

  useEffect(() => {
    setStoreChecking(checking);
  }, [checking, setStoreChecking]);

  useEffect(() => {
    setStoreDownloading(downloading);
  }, [downloading, setStoreDownloading]);

  useEffect(() => {
    setStoreReadyVersion(readyVersion);
  }, [readyVersion, setStoreReadyVersion]);

  const checkForUpdates = useCallback(
    async (source: "startup" | "interval" | "manual" | "online") => {
      if (!enabled || appStatus === "booting" || inFlightRef.current) {
        return;
      }

      const reachable = await canReachInternet();
      if (!reachable) {
        const message = "İnternet bağlantısı olmadığı için güncelleme kontrol edilemedi.";
        if (source === "startup") {
          startupCheckDoneRef.current = false;
          startupCheckWaitingForNetworkRef.current = true;
        }
        if (source === "manual") {
          toastError("Güncelleme denetimi başarısız", message, "update-check-failed-manual-offline");
        }
        return;
      }

      inFlightRef.current = true;
      setChecking(true);

      try {
        if (source === "startup" || source === "online") {
          startupCheckWaitingForNetworkRef.current = false;
        }

        const checkResult = await checkDesktopForUpdates(headersToRecord(getUpdaterRequestHeaders(channel)));
        if (!checkResult) {
          throw new Error("Yerel updater kontrolü başarısız oldu.");
        }

        if (!checkResult.available) {
          if (source === "manual") {
            const currentVersionText = installedVersion ? `Yüklü sürüm: v${installedVersion}.` : "";
            toastInfo(
              "Yeni sürüm yok",
              `${channelLabel} kanalında güncel sürümü kullanıyorsun. ${currentVersionText}`.trim(),
              "update-not-available"
            );
          }
          return;
        }

        setDownloading(true);
        toastInfo(
          "Yeni sürüm bulundu",
          `${checkResult.version ?? "Yeni"} sürümü arka planda indiriliyor (${channelLabel}).`,
          `update-found-${channel}-${checkResult.version ?? "latest"}`
        );

        const downloadResult = await downloadDesktopUpdate();
        const version = downloadResult?.version ?? checkResult.version ?? null;
        latestDownloadVersionRef.current = version;
        setReadyVersion(version);

        const autoInstall = shouldAutoInstall(source);
        if (autoInstall) {
          toastInfo(
            "Güncelleme uygulanıyor",
            `${version ?? "Yeni"} sürümü indirildi. Uygulama otomatik yeniden başlatılacak.`,
            `update-auto-install-${channel}-${version ?? "latest"}`
          );
          const installed = await installDownloadedUpdate(source);
          if (installed) {
            return;
          }
        }

        setDialogOpen(true);
        toastSuccess(
          "Güncelleme hazır",
          `${version ?? "Yeni sürüm"} indirildi. Yeniden başlatıp hemen uygulayabilirsin.`,
          `update-ready-${channel}-${version ?? "latest"}`
        );
      } catch (error) {
        const message = normalizeUpdaterError(error);
        if (source === "manual") {
          toastError("Güncelleme denetimi başarısız", message, "update-check-failed-manual");
        } else {
          console.warn("[updater] scheduled update check failed:", message);
        }
      } finally {
        inFlightRef.current = false;
        setChecking(false);
        setDownloading(false);
      }
    },
    [appStatus, canReachInternet, channel, channelLabel, enabled, installDownloadedUpdate, installedVersion, shouldAutoInstall]
  );

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (!startupCheckDoneRef.current && appStatus !== "booting") {
      startupCheckDoneRef.current = true;
      startupCheckWaitingForNetworkRef.current = false;
      void checkForUpdates("startup");
    }

    const handleOnline = () => {
      if (!enabled || appStatus === "booting") {
        return;
      }
      if (startupCheckWaitingForNetworkRef.current) {
        startupCheckDoneRef.current = true;
        startupCheckWaitingForNetworkRef.current = false;
        void checkForUpdates("online");
      }
    };

    window.addEventListener("online", handleOnline);

    const intervalMs = env.updater.checkIntervalMinutes * 60_000;
    const intervalID = window.setInterval(() => {
      void checkForUpdates("interval");
    }, intervalMs);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.clearInterval(intervalID);
    };
  }, [appStatus, checkForUpdates, enabled]);

  useEffect(() => {
    if (!enabled || manualCheckNonce === 0) {
      return;
    }
    void checkForUpdates("manual");
  }, [checkForUpdates, enabled, manualCheckNonce]);

  const applyUpdate = useCallback(async () => {
    await installDownloadedUpdate("manual");
  }, [installDownloadedUpdate]);

  if (!enabled) {
    return null;
  }

  return (
    <>
      {downloading ? (
        <div className="pointer-events-none fixed bottom-3 right-3 z-[130] w-[min(92vw,300px)] rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_92%,black_8%)] px-3 py-2.5 shadow-2xl sm:bottom-5 sm:right-5">
          <div className="flex items-center gap-2 text-sm text-[var(--catwa-text-main)]">
            <Loader2 className="h-4 w-4 animate-spin text-[var(--catwa-accent)]" />
            <span className="font-medium">Güncelleme indiriliyor ({channelLabel})</span>
          </div>
          <p className="mt-1 text-xs text-[var(--catwa-text-soft)]">İndirme sürüyor...</p>
        </div>
      ) : null}

      <Dialog.Root
        onOpenChange={(open) => {
          if (!applying) {
            setDialogOpen(open);
          }
        }}
        open={dialogOpen}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[150] bg-slate-950/78 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[151] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-base font-semibold text-[var(--catwa-text-main)]">Yeni sürüm hazır</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-[var(--catwa-text-soft)]">
                  {readyVersion
                    ? `${readyVersion} sürümü (${channelLabel}) arka planda indirildi.`
                    : "Güncelleme indirildi ve uygulanmaya hazır."}
                </Dialog.Description>
              </div>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--catwa-border)] bg-[var(--catwa-panel-alt)] text-[var(--catwa-text-soft)] transition hover:text-[var(--catwa-text-main)]"
                onClick={() => setDialogOpen(false)}
                title="Kapat"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 rounded-xl border border-[var(--catwa-border)] bg-[var(--catwa-panel-alt)] p-3 text-xs text-[var(--catwa-text-soft)]">
              Güncellemeyi uygulamak için uygulama yeniden başlatılır. Açık taslakların varsa önce kaydet.
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                className="rounded-lg border border-[var(--catwa-border)] bg-transparent px-3 py-2 text-sm font-medium text-[var(--catwa-text-main)] transition hover:bg-white/5"
                disabled={applying}
                onClick={() => setDialogOpen(false)}
                type="button"
              >
                Sonra
              </button>
              <button
                className="inline-flex items-center gap-2 rounded-lg border border-[var(--catwa-accent-ring)] bg-[var(--catwa-accent-soft)] px-3 py-2 text-sm font-semibold text-[var(--catwa-text-main)] transition hover:bg-[var(--catwa-accent-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                disabled={applying}
                onClick={() => {
                  void applyUpdate();
                }}
                type="button"
              >
                {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />}
                Yeniden başlat ve uygula
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
