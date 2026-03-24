import * as Dialog from "@radix-ui/react-dialog";
import {
  AppWindow,
  Camera,
  Check,
  Loader2,
  MonitorSmartphone,
  ScreenShare,
  Settings2,
  Volume2,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  listCameraDevices,
  listNativeScreenShareSources,
  type CameraDevice,
  type NativeScreenShareSource,
  type ScreenShareFPS,
  type ScreenShareQuality,
  type ScreenShareSelection,
  type ScreenShareTab
} from "../../lib/mediaCaptureService";
import { isTauriDesktop } from "../../lib/runtime";
import { toastWarning } from "../../store/toastStore";

type ScreenSharePickerModalProps = {
  open: boolean;
  starting: boolean;
  defaultQuality: ScreenShareQuality;
  defaultFPS: ScreenShareFPS;
  defaultIncludeSystemAudio: boolean;
  onClose: () => void;
  onStart: (payload: {
    selection: ScreenShareSelection;
    quality: ScreenShareQuality;
    fps: ScreenShareFPS;
    includeSystemAudio: boolean;
  }) => Promise<boolean>;
  onPreferencesChange?: (payload: {
    quality: ScreenShareQuality;
    fps: ScreenShareFPS;
    includeSystemAudio: boolean;
  }) => void;
};

type NativeSourcesState = {
  applications: NativeScreenShareSource[];
  screens: NativeScreenShareSource[];
};

type SharePreset = "game" | "screen" | "custom";

const QUALITY_OPTIONS: ScreenShareQuality[] = ["720p", "1080p"];
const FPS_OPTIONS: ScreenShareFPS[] = [15, 30, 60];
const PRESET_LABELS: Record<SharePreset, string> = {
  game: "Oyun",
  screen: "Ekran Paylaşımı",
  custom: "Özel"
};

function SourceCard({
  selected,
  title,
  description,
  icon,
  thumbnailDataUrl,
  onClick
}: {
  selected: boolean;
  title: string;
  description: string;
  icon: JSX.Element;
  thumbnailDataUrl?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      className={`group rounded-xl border px-3 py-3 text-left transition ${
        selected
          ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)] shadow-[0_0_0_1px_var(--catwa-accent-soft)]"
          : "border-[var(--catwa-border)] bg-slate-900/70 hover:border-slate-500/70 hover:bg-slate-800/80"
      }`}
      onClick={onClick}
      type="button"
    >
      <div className="mb-2 flex h-28 items-center justify-center overflow-hidden rounded-lg border border-[var(--catwa-border)] bg-slate-950/75">
        {thumbnailDataUrl ? (
          <img
            alt={title}
            className="h-full w-full object-cover"
            loading="lazy"
            src={thumbnailDataUrl}
          />
        ) : (
          <div
            className={`inline-flex h-10 w-10 items-center justify-center rounded-lg border ${
              selected ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)]" : "border-slate-700/70 bg-slate-800/70"
            }`}
          >
            {icon}
          </div>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-xs text-slate-400">{description}</p>
        </div>
        {selected ? (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] text-slate-100">
            <Check className="h-3 w-3" />
          </span>
        ) : null}
      </div>
    </button>
  );
}

function NoSourceState({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex h-[320px] flex-col items-center justify-center rounded-lg border border-dashed border-[var(--catwa-border)] bg-slate-900/70 px-4 text-center">
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mt-2 max-w-md text-sm text-slate-400">{description}</p>
    </div>
  );
}

export function ScreenSharePickerModal({
  open,
  starting,
  defaultQuality,
  defaultFPS,
  defaultIncludeSystemAudio,
  onClose,
  onStart,
  onPreferencesChange
}: ScreenSharePickerModalProps) {
  const desktopRuntime = isTauriDesktop();
  const [activeTab, setActiveTab] = useState<ScreenShareTab>("applications");
  const [quality, setQuality] = useState<ScreenShareQuality>(defaultQuality);
  const [fps, setFps] = useState<ScreenShareFPS>(defaultFPS);
  const [includeSystemAudio, setIncludeSystemAudio] = useState(defaultIncludeSystemAudio);
  const [selectedApplicationId, setSelectedApplicationId] = useState<string>("");
  const [selectedScreenId, setSelectedScreenId] = useState<string>("");
  const [selectedCameraId, setSelectedCameraId] = useState<string>("");
  const [cameraDevices, setCameraDevices] = useState<CameraDevice[]>([]);
  const [nativeSources, setNativeSources] = useState<NativeSourcesState>({ applications: [], screens: [] });
  const [loadingSources, setLoadingSources] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sharePreset, setSharePreset] = useState<SharePreset>("custom");

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuality(defaultQuality);
    setFps(defaultFPS);
    setIncludeSystemAudio(defaultIncludeSystemAudio);
    setSettingsOpen(false);

    if (defaultQuality === "1080p" && defaultFPS === 60) {
      setSharePreset("game");
    } else if (defaultQuality === "1080p" && defaultFPS === 30) {
      setSharePreset("screen");
    } else {
      setSharePreset("custom");
    }
  }, [defaultFPS, defaultIncludeSystemAudio, defaultQuality, open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    setLoadingSources(true);

    void (async () => {
      try {
        const [cameras, sources] = await Promise.all([
          listCameraDevices(),
          desktopRuntime ? listNativeScreenShareSources() : Promise.resolve<NativeSourcesState>({ applications: [], screens: [] })
        ]);

        if (cancelled) {
          return;
        }

        setCameraDevices(cameras);
        setNativeSources(sources);

        setSelectedCameraId((current) =>
          current && cameras.some((item) => item.deviceId === current) ? current : (cameras[0]?.deviceId ?? "")
        );
        setSelectedApplicationId((current) =>
          current && sources.applications.some((item) => item.id === current) ? current : (sources.applications[0]?.id ?? "")
        );
        setSelectedScreenId((current) =>
          current && sources.screens.some((item) => item.id === current) ? current : (sources.screens[0]?.id ?? "")
        );
      } finally {
        if (!cancelled) {
          setLoadingSources(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [desktopRuntime, open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    onPreferencesChange?.({
      quality,
      fps,
      includeSystemAudio
    });
  }, [fps, includeSystemAudio, onPreferencesChange, open, quality]);

  const selectedApplication = useMemo(
    () => nativeSources.applications.find((item) => item.id === selectedApplicationId) ?? null,
    [nativeSources.applications, selectedApplicationId]
  );

  const selectedScreen = useMemo(
    () => nativeSources.screens.find((item) => item.id === selectedScreenId) ?? null,
    [nativeSources.screens, selectedScreenId]
  );

  const canStart = useMemo(() => {
    if (activeTab === "devices") {
      return Boolean(selectedCameraId);
    }

    if (!desktopRuntime) {
      return false;
    }

    if (desktopRuntime) {
      if (activeTab === "applications") {
        return Boolean(selectedApplicationId);
      }
      return Boolean(selectedScreenId);
    }

    return false;
  }, [activeTab, desktopRuntime, selectedApplicationId, selectedCameraId, selectedScreenId]);

  const applyPreset = (preset: SharePreset) => {
    setSharePreset(preset);
    if (preset === "game") {
      setQuality("1080p");
      setFps(60);
      setIncludeSystemAudio(true);
      return;
    }
    if (preset === "screen") {
      setQuality("1080p");
      setFps(30);
      setIncludeSystemAudio(true);
      return;
    }
    setQuality("1080p");
    setFps(30);
  };

  const handleStart = async () => {
    if (!canStart || starting) {
      return;
    }

    let selection: ScreenShareSelection;
    if (activeTab === "devices") {
      const selectedCamera = cameraDevices.find((item) => item.deviceId === selectedCameraId);
      if (!selectedCamera) {
        toastWarning("Kamera bulunamadı", "Paylaşım için bir kamera seçmelisin.");
        return;
      }
      selection = {
        tab: "devices",
        deviceId: selectedCamera.deviceId,
        label: selectedCamera.label
      };
    } else if (desktopRuntime && activeTab === "applications") {
      if (!selectedApplication) {
        toastWarning("Kaynak seçilmedi", "Paylaşım için bir uygulama seçmelisin.");
        return;
      }
      selection = {
        tab: "applications",
        sourceId: selectedApplication.id,
        label: selectedApplication.label
      };
    } else if (desktopRuntime && activeTab === "entire-screen") {
      if (!selectedScreen) {
        toastWarning("Kaynak seçilmedi", "Paylaşım için bir ekran seçmelisin.");
        return;
      }
      selection = {
        tab: "entire-screen",
        sourceId: selectedScreen.id,
        label: selectedScreen.label
      };
    } else {
      toastWarning("Desktop gerekli", "Ekran yayını sadece Catwa Desktop uygulamasında başlatılabilir.");
      return;
    }

    const started = await onStart({
      selection,
      quality,
      fps,
      includeSystemAudio: activeTab === "devices" ? false : includeSystemAudio
    });

    if (started) {
      onClose();
    }
  };

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[110] bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[111] w-[calc(100vw-2rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-[var(--catwa-border)] bg-[#26283a] p-5 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <Dialog.Title className="text-base font-semibold text-slate-100">Ekran paylaşımını başlat</Dialog.Title>
              <Dialog.Description className="mt-1 text-xs text-slate-400">
                {desktopRuntime
                  ? "Masaüstü kaynaklarını doğrudan seçip yayına başlayabilirsin."
                  : "Ekran paylaşımı bu sürümde yalnızca Catwa Desktop uygulamasında desteklenir."}
              </Dialog.Description>
            </div>
            <button
              aria-label="Kapat"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700/70 bg-slate-800/70 text-slate-200 transition hover:border-slate-500"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="mb-4 grid grid-cols-3 gap-2 rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 p-1">
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "applications"
                  ? "bg-[var(--catwa-accent-soft)] text-slate-100"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
              }`}
              onClick={() => setActiveTab("applications")}
              type="button"
            >
              <AppWindow className="h-4 w-4" />
              Uygulamalar
            </button>
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "entire-screen"
                  ? "bg-[var(--catwa-accent-soft)] text-slate-100"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
              }`}
              onClick={() => setActiveTab("entire-screen")}
              type="button"
            >
              <MonitorSmartphone className="h-4 w-4" />
              Tüm Ekran
            </button>
            <button
              className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm transition ${
                activeTab === "devices"
                  ? "bg-[var(--catwa-accent-soft)] text-slate-100"
                  : "text-slate-300 hover:bg-slate-800/70 hover:text-slate-100"
              }`}
              onClick={() => setActiveTab("devices")}
              type="button"
            >
              <Camera className="h-4 w-4" />
              Cihazlar
            </button>
          </div>

          <div className="min-h-[340px] rounded-xl border border-[var(--catwa-border)] bg-slate-900/55 p-3">
            {loadingSources ? (
              <div className="flex h-[320px] items-center justify-center text-sm text-slate-400">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Kaynaklar yükleniyor...
              </div>
            ) : null}

            {!loadingSources && activeTab === "applications" ? (
              desktopRuntime ? (
                nativeSources.applications.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {nativeSources.applications.map((source) => (
                      <SourceCard
                        description={source.description}
                        icon={<ScreenShare className="h-5 w-5 text-slate-300" />}
                        key={source.id}
                        onClick={() => setSelectedApplicationId(source.id)}
                        selected={selectedApplicationId === source.id}
                        thumbnailDataUrl={source.thumbnailDataUrl}
                        title={source.label}
                      />
                    ))}
                  </div>
                ) : (
                  <NoSourceState
                    description="Açık uygulama penceresi bulunamadı. Bir uygulamayı açıp tekrar dene."
                    title="Paylaşılabilir uygulama yok"
                  />
                )
              ) : (
                <NoSourceState
                  description="Ekran paylaşımı için masaüstü uygulamaya geç."
                  title="Bu sekme masaüstü uygulamaya özeldir"
                />
              )
            ) : null}

            {!loadingSources && activeTab === "entire-screen" ? (
              desktopRuntime ? (
                nativeSources.screens.length > 0 ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    {nativeSources.screens.map((source) => (
                      <SourceCard
                        description={source.description}
                        icon={<MonitorSmartphone className="h-5 w-5 text-slate-300" />}
                        key={source.id}
                        onClick={() => setSelectedScreenId(source.id)}
                        selected={selectedScreenId === source.id}
                        thumbnailDataUrl={source.thumbnailDataUrl}
                        title={source.label}
                      />
                    ))}
                  </div>
                ) : (
                  <NoSourceState
                    description="Masaüstü ekran kaynağı alınamadı. Ekran sürücüsü ve izinlerini kontrol et."
                    title="Paylaşılabilir ekran bulunamadı"
                  />
                )
              ) : (
                <NoSourceState
                  description="Ekran paylaşımı için masaüstü uygulamaya geç."
                  title="Bu sekme masaüstü uygulamaya özeldir"
                />
              )
            ) : null}

            {!loadingSources && activeTab === "devices" ? (
              cameraDevices.length > 0 ? (
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {cameraDevices.map((source) => (
                    <SourceCard
                      description="Kamera kaynağı"
                      icon={<Camera className="h-5 w-5 text-slate-300" />}
                      key={source.deviceId}
                      onClick={() => setSelectedCameraId(source.deviceId)}
                      selected={selectedCameraId === source.deviceId}
                      title={source.label}
                    />
                  ))}
                </div>
              ) : (
                <NoSourceState
                  description="Gelecekte bu sekmeyi kullanarak kamera gibi belirli cihazlardan paylaşım yapabilirsin."
                  title="Kullanabileceğin hiç kayıt cihazı yok"
                />
              )
            ) : null}
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 px-3 py-2 text-xs text-slate-300">
            <span>
              {PRESET_LABELS[sharePreset]} · {quality} · {fps}fps
              {activeTab === "devices" ? "" : includeSystemAudio ? " · Sistem sesi açık" : " · Sistem sesi kapalı"}
            </span>
            <button
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--catwa-border)] bg-slate-800/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-slate-500"
              onClick={() => setSettingsOpen((value) => !value)}
              type="button"
            >
              <Settings2 className="h-3.5 w-3.5" />
              Ayarlar
            </button>
          </div>

          {settingsOpen ? (
            <div className="mt-3 rounded-xl border border-[var(--catwa-border)] bg-slate-900/65 p-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <button
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    sharePreset === "game"
                      ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)]"
                      : "border-[var(--catwa-border)] bg-slate-900/70 hover:border-slate-500/70"
                  }`}
                  onClick={() => applyPreset("game")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-slate-100">Oyun</p>
                  <p className="mt-0.5 text-xs text-slate-400">Daha akıcı görüntü (1080p, 60fps)</p>
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    sharePreset === "screen"
                      ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)]"
                      : "border-[var(--catwa-border)] bg-slate-900/70 hover:border-slate-500/70"
                  }`}
                  onClick={() => applyPreset("screen")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-slate-100">Ekran Paylaşımı</p>
                  <p className="mt-0.5 text-xs text-slate-400">Daha net metin (1080p, 30fps)</p>
                </button>
                <button
                  className={`rounded-lg border px-3 py-2 text-left transition ${
                    sharePreset === "custom"
                      ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)]"
                      : "border-[var(--catwa-border)] bg-slate-900/70 hover:border-slate-500/70"
                  }`}
                  onClick={() => setSharePreset("custom")}
                  type="button"
                >
                  <p className="text-sm font-semibold text-slate-100">Özel</p>
                  <p className="mt-0.5 text-xs text-slate-400">Ayarları manuel yönet</p>
                </button>
              </div>

              <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
                <label className="text-xs text-slate-300">
                  Ekran çözünürlüğü
                  <select
                    className="mt-1 w-full rounded-md border border-[var(--catwa-border)] bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-[var(--catwa-accent-strong)]"
                    onChange={(event) => {
                      setSharePreset("custom");
                      setQuality(event.target.value as ScreenShareQuality);
                    }}
                    value={quality}
                  >
                    {QUALITY_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="text-xs text-slate-300">
                  Kare hızı
                  <select
                    className="mt-1 w-full rounded-md border border-[var(--catwa-border)] bg-slate-900/70 px-2 py-1.5 text-sm text-slate-100 outline-none focus:border-[var(--catwa-accent-strong)]"
                    onChange={(event) => {
                      setSharePreset("custom");
                      setFps(Number(event.target.value) as ScreenShareFPS);
                    }}
                    value={fps}
                  >
                    {FPS_OPTIONS.map((item) => (
                      <option key={item} value={item}>
                        {item} FPS
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 rounded-lg border border-[var(--catwa-border)] bg-slate-900/65 px-3 py-2 text-xs text-slate-300">
                  <input
                    checked={activeTab === "devices" ? false : includeSystemAudio}
                    className="h-4 w-4 accent-[var(--catwa-accent)]"
                    disabled={activeTab === "devices"}
                    onChange={(event) => {
                      setSharePreset("custom");
                      setIncludeSystemAudio(event.target.checked);
                    }}
                    type="checkbox"
                  />
                  <Volume2 className="h-4 w-4 text-slate-400" />
                  Yayın sesini paylaş
                </label>
              </div>
            </div>
          ) : null}

          {!desktopRuntime && activeTab !== "devices" ? (
            <p className="mt-3 rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Web arayüzü ekran paylaşımında kullanılmaz. Catwa Desktop ile devam et.
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="rounded-md border border-slate-700/80 bg-slate-800/70 px-4 py-2 text-sm text-slate-200 transition hover:border-slate-500"
              onClick={onClose}
              type="button"
            >
              İptal
            </button>
            <button
              className="inline-flex items-center gap-2 rounded-md border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] px-4 py-2 text-sm font-medium text-slate-100 transition hover:bg-[var(--catwa-accent-strong)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canStart || starting}
              onClick={() => {
                void handleStart();
              }}
              type="button"
            >
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScreenShare className="h-4 w-4" />}
              Yayını Başlat
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
