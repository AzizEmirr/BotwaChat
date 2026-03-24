import * as Dialog from "@radix-ui/react-dialog";
import * as Switch from "@radix-ui/react-switch";
import { AnimatePresence, motion } from "framer-motion";
import {
  Ban,
  Check,
  KeyRound,
  Keyboard,
  LogOut,
  MessageCircle,
  Mic,
  Monitor,
  MonitorSmartphone,
  Palette,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  UserRound,
  Volume2,
  X
} from "lucide-react";
import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isTauriDesktop } from "../../lib/runtime";
import { configureStartup, readStartupConfiguration } from "../../lib/startupIntegration";
import { buildMicrophoneConstraints } from "../../lib/voiceVideoPreferences";
import {
  applyThemePreset,
  applyAppPreferences,
  getDefaultAppPreferences,
  getThemePresetById,
  loadAppPreferences,
  saveAppPreferences,
  THEME_PRESET_OPTIONS,
  THEME_OPTIONS,
  type AppPreferences,
  type MessageDisplayMode
} from "../../lib/uiPreferences";
import { useDesktopUpdateStore } from "../../store/desktopUpdateStore";
import { toastInfo, toastSuccess } from "../../store/toastStore";
import { useLinkGuard } from "../ui/LinkGuardProvider";
import type {
  BlockedUserItem,
  FriendPrivacySettings,
  UpdateFriendPrivacySettingsRequest,
  UserProfile
} from "../../types/chat";

type SettingsModalProps = {
  open: boolean;
  initialSection?: SettingsSectionId;
  appName: string;
  currentUser: UserProfile | null;
  apiBaseURL: string;
  wsBaseURL: string;
  compactMode: boolean;
  profileUpdating: boolean;
  passwordUpdating: boolean;
  error: string | null;
  friendPrivacySettings: FriendPrivacySettings;
  blockedUsers: BlockedUserItem[];
  loadingFriendPrivacy: boolean;
  loadingBlockedUsers: boolean;
  updatingFriendPrivacy: boolean;
  onCompactModeChange: (value: boolean) => void;
  onClose: () => void;
  onLogout: () => void;
  onResetUI: () => void;
  onClearError: () => void;
  onUpdateProfile: (input: {
    username: string;
    displayName: string;
    bio: string;
    avatarPath: string;
  }) => Promise<boolean>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  onUpdateFriendPrivacy: (patch: UpdateFriendPrivacySettingsRequest) => Promise<boolean>;
  onUnblockUser: (userId: string) => Promise<boolean>;
};

export type SettingsSectionId =
  | "account"
  | "privacy"
  | "appearance"
  | "voice-video"
  | "chat"
  | "keybinds"
  | "windows"
  | "streamer-mode";

type NavItem = {
  id: SettingsSectionId;
  label: string;
  group: "Kullanıcı Ayarları" | "Uygulama Ayarları";
  icon: React.ComponentType<{ className?: string }>;
};

type KeybindRow = {
  label: string;
  keys: string[];
};

type KeybindGroup = {
  title: string;
  description?: string;
  rows: KeybindRow[];
};

const NAV_ITEMS: NavItem[] = [
  { id: "account", label: "Hesabım", group: "Kullanıcı Ayarları", icon: UserRound },
  { id: "privacy", label: "Gizlilik ve Güvenlik", group: "Kullanıcı Ayarları", icon: ShieldAlert },
  { id: "appearance", label: "Görünüm", group: "Uygulama Ayarları", icon: Palette },
  { id: "voice-video", label: "Ses ve Görüntü", group: "Uygulama Ayarları", icon: Mic },
  { id: "chat", label: "Sohbet", group: "Uygulama Ayarları", icon: MessageCircle },
  { id: "keybinds", label: "Tuş Atamaları", group: "Uygulama Ayarları", icon: Keyboard },
  { id: "windows", label: "Windows Ayarları", group: "Uygulama Ayarları", icon: Monitor },
  { id: "streamer-mode", label: "Yayıncı Modu", group: "Uygulama Ayarları", icon: MonitorSmartphone }
];

const NAV_SEARCH_KEYWORDS: Record<SettingsSectionId, string[]> = {
  account: ["hesap", "profil", "kullanıcı", "şifre"],
  privacy: ["gizlilik", "güvenlik", "engelle", "arkadaşlık"],
  appearance: ["görünüm", "tema", "renk", "yoğunluk", "yakınlaştırma"],
  "voice-video": ["ses", "görüntü", "mikrofon", "hoparlör", "gürültü"],
  chat: ["sohbet", "emoji", "medya", "bağlantı", "içerik"],
  keybinds: ["tuş", "kısayol", "klavye", "atalama"],
  windows: ["windows", "başlangıç", "sistem", "güncelleme"],
  "streamer-mode": ["yayıncı", "streamer", "gizle", "bildirim"]
};

const KEYBIND_GROUPS: KeybindGroup[] = [
  {
    title: "Mesajlar",
    description: "Bu kısayollar yazışma alanında aktifken çalışır.",
    rows: [
      { label: "Mesaj gönder", keys: ["ENTER"] },
      { label: "Yeni satır", keys: ["SHIFT", "ENTER"] },
      { label: "Yanıt önizlemesini kapat", keys: ["ESC"] }
    ]
  },
  {
    title: "Navigasyon",
    rows: [
      { label: "Global aramayı odakla", keys: ["CTRL/CMD", "K"] },
      { label: "Ayarları aç", keys: ["CTRL/CMD", ","] },
      { label: "Açık modalı kapat", keys: ["ESC"] }
    ]
  },
  {
    title: "Ses ve Görüntü",
    rows: [
      { label: "Mikrofonu aç/kapat", keys: ["CTRL/CMD", "SHIFT", "M"] }
    ]
  },
  {
    title: "Mesaj Etkileşimleri",
    description: "Bu aksiyonlar mesaj satırındaki sağ tık menüsünden erişilebilir.",
    rows: [
      { label: "Yanıtla", keys: ["Sağ tık", "Yanıtla"] },
      { label: "Mesajı düzenle", keys: ["Sağ tık", "Mesajı Düzenle"] },
      { label: "Mesaj bağlantısını kopyala", keys: ["Sağ tık", "Mesaj Bağlantısını Kopyala"] }
    ]
  }
];

const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

function ToggleRow({
  title,
  description,
  checked,
  onChange,
  disabled
}: {
  title: string;
  description?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-4 border-b border-[var(--catwa-border-soft)] px-0 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-100">{title}</span>
        {description ? <span className="mt-0.5 block text-xs text-slate-400">{description}</span> : null}
      </span>
      <div className="mt-0.5 flex shrink-0 items-center">
        <Switch.Root
          checked={checked}
          className="inline-flex h-5 w-10 items-center rounded-full border transition data-[state=checked]:border-emerald-300/90 data-[state=checked]:bg-emerald-500/60 data-[state=unchecked]:border-slate-500/80 data-[state=unchecked]:bg-slate-700/80 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={disabled}
          onCheckedChange={onChange}
        >
          <Switch.Thumb className="pointer-events-none block h-4 w-4 translate-x-0.5 rounded-full bg-slate-200 shadow transition data-[state=checked]:translate-x-5 data-[state=checked]:bg-white" />
        </Switch.Root>
      </div>
    </label>
  );
}

function RangeRow({
  label,
  description,
  value,
  min,
  max,
  step,
  unit,
  onChange
}: {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2 border-b border-[var(--catwa-border-soft)] px-0 py-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100">{label}</p>
          {description ? <p className="mt-0.5 text-xs text-slate-400">{description}</p> : null}
        </div>
        <span className="shrink-0 text-xs text-slate-300">
          {value}
          {unit ?? ""}
        </span>
      </div>
      <input
        className="h-1.5 w-full cursor-pointer accent-indigo-500"
        max={max}
        min={min}
        onChange={(event) => onChange(Number.parseInt(event.target.value, 10))}
        step={step ?? 1}
        type="range"
        value={value}
      />
    </div>
  );
}

function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-2xl font-semibold text-slate-100">{title}</h2>
      {description ? <p className="mt-1 text-sm text-slate-400">{description}</p> : null}
    </div>
  );
}

function formatBlockedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function SettingsModal({
  open,
  initialSection,
  appName,
  currentUser,
  apiBaseURL,
  compactMode,
  profileUpdating,
  passwordUpdating,
  error,
  friendPrivacySettings,
  blockedUsers,
  loadingFriendPrivacy,
  loadingBlockedUsers,
  updatingFriendPrivacy,
  onCompactModeChange,
  onClose,
  onLogout,
  onResetUI,
  onClearError,
  onUpdateProfile,
  onChangePassword,
  onUpdateFriendPrivacy,
  onUnblockUser
}: SettingsModalProps) {
  const windowsSettingsAvailable = isTauriDesktop();
  const { clearTrustedDomains, trustedDomainsCount } = useLinkGuard();
  const updaterEnabled = useDesktopUpdateStore((state) => state.enabled);
  const updaterChecking = useDesktopUpdateStore((state) => state.checking);
  const updaterDownloading = useDesktopUpdateStore((state) => state.downloading);
  const updaterReadyVersion = useDesktopUpdateStore((state) => state.readyVersion);
  const requestManualUpdateCheck = useDesktopUpdateStore((state) => state.requestManualCheck);
  const [activeSection, setActiveSection] = useState<SettingsSectionId>(initialSection ?? "appearance");
  const [settingsSearch, setSettingsSearch] = useState("");
  const [preferences, setPreferences] = useState<AppPreferences>(() => loadAppPreferences());

  const [usernameDraft, setUsernameDraft] = useState("");
  const [displayNameDraft, setDisplayNameDraft] = useState("");
  const [bioDraft, setBioDraft] = useState("");
  const [avatarPathDraft, setAvatarPathDraft] = useState("");
  const [currentPasswordDraft, setCurrentPasswordDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);
  const [avatarUploadName, setAvatarUploadName] = useState<string | null>(null);

  const [inputDevices, setInputDevices] = useState<MediaDeviceInfo[]>([]);
  const [outputDevices, setOutputDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceLoading, setDeviceLoading] = useState(false);
  const [micTesting, setMicTesting] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);
  const avatarInputRef = useRef<HTMLInputElement | null>(null);

  const normalizedSettingsSearch = settingsSearch.trim().toLocaleLowerCase("tr-TR");

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => (windowsSettingsAvailable ? true : item.id !== "windows")),
    [windowsSettingsAvailable]
  );

  const groupedNav = useMemo(
    () => ({
      "Kullanıcı Ayarları": navItems.filter((item) => {
        if (item.group !== "Kullanıcı Ayarları") {
          return false;
        }
        if (!normalizedSettingsSearch) {
          return true;
        }
        const haystack = `${item.label} ${(NAV_SEARCH_KEYWORDS[item.id] ?? []).join(" ")}`.toLocaleLowerCase("tr-TR");
        return haystack.includes(normalizedSettingsSearch);
      }),
      "Uygulama Ayarları": navItems.filter((item) => {
        if (item.group !== "Uygulama Ayarları") {
          return false;
        }
        if (!normalizedSettingsSearch) {
          return true;
        }
        const haystack = `${item.label} ${(NAV_SEARCH_KEYWORDS[item.id] ?? []).join(" ")}`.toLocaleLowerCase("tr-TR");
        return haystack.includes(normalizedSettingsSearch);
      })
    }),
    [navItems, normalizedSettingsSearch]
  );

  const visibleNavItems = useMemo(
    () => [...groupedNav["Kullanıcı Ayarları"], ...groupedNav["Uygulama Ayarları"]],
    [groupedNav]
  );

  const profileChanged = useMemo(() => {
    const originalUsername = currentUser?.username ?? "";
    const originalDisplayName = currentUser?.displayName ?? "";
    const originalBio = currentUser?.bio ?? "";
    const originalAvatarPath = currentUser?.avatarPath ?? "";

    return (
      usernameDraft.trim() !== originalUsername ||
      displayNameDraft.trim() !== originalDisplayName ||
      bioDraft.trim() !== originalBio ||
      avatarPathDraft.trim() !== originalAvatarPath
    );
  }, [
    avatarPathDraft,
    bioDraft,
    currentUser?.avatarPath,
    currentUser?.bio,
    currentUser?.displayName,
    currentUser?.username,
    displayNameDraft,
    usernameDraft
  ]);

  const canSubmitPassword =
    currentPasswordDraft.trim().length > 0 &&
    newPasswordDraft.trim().length > 0 &&
    confirmPasswordDraft.trim().length > 0 &&
    newPasswordDraft === confirmPasswordDraft;

  const avatarPreviewSrc = useMemo(() => {
    const trimmed = avatarPathDraft.trim();
    if (!trimmed) {
      return null;
    }
    if (trimmed.startsWith("data:image/")) {
      return trimmed;
    }
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return `${apiBaseURL}${trimmed}`;
    }
    return `${apiBaseURL}/${trimmed}`;
  }, [apiBaseURL, avatarPathDraft]);

  const stopMicTest = useCallback(() => {
    if (rafRef.current) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    analyserRef.current = null;
    setMicTesting(false);
    setMicLevel(0);
  }, []);

  const refreshDevices = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
      return;
    }

    setDeviceLoading(true);
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === "audioinput");
      const outputs = devices.filter((device) => device.kind === "audiooutput");
      setInputDevices(inputs);
      setOutputDevices(outputs);

      setPreferences((current) => {
        const next = { ...current };
        if (!inputs.some((device) => device.deviceId === next.voiceVideo.inputDeviceId)) {
          next.voiceVideo = { ...next.voiceVideo, inputDeviceId: "default" };
        }
        if (!outputs.some((device) => device.deviceId === next.voiceVideo.outputDeviceId)) {
          next.voiceVideo = { ...next.voiceVideo, outputDeviceId: "default" };
        }
        return next;
      });
    } catch {
      setWarningMessage("Ses cihazları listesi okunamadı. Tarayıcı izinlerini kontrol et.");
    } finally {
      setDeviceLoading(false);
    }
  }, []);

  const startMicTest = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setWarningMessage("Bu ortamda mikrofon testi desteklenmiyor.");
      return;
    }

    try {
      setWarningMessage(null);
      const audioConstraints = buildMicrophoneConstraints(preferences.voiceVideo);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 256;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      streamRef.current = stream;
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;
      setMicTesting(true);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        if (!analyserRef.current) {
          return;
        }
        analyserRef.current.getByteTimeDomainData(dataArray);
        let sumSquares = 0;
        for (let index = 0; index < dataArray.length; index += 1) {
          const normalized = (dataArray[index] - 128) / 128;
          sumSquares += normalized * normalized;
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const gainMultiplier = Math.max(0, Math.min(2, preferences.voiceVideo.inputVolume / 50));
        const level = Math.min(100, Math.round(rms * 240 * gainMultiplier));
        setMicLevel(level);
        rafRef.current = window.requestAnimationFrame(tick);
      };

      tick();
    } catch {
      setWarningMessage("Mikrofon testi başlatılamadı. Uygulama mikrofon iznini kontrol et.");
      stopMicTest();
    }
  }, [preferences.voiceVideo, stopMicTest]);

  useEffect(() => {
    saveAppPreferences(preferences);
    applyAppPreferences(preferences);
  }, [preferences]);

  useEffect(() => {
    setPreferences((current) => {
      const messageDisplay: MessageDisplayMode = compactMode ? "compact" : "default";
      if (current.appearance.messageDisplay === messageDisplay) {
        return current;
      }
      return {
        ...current,
        appearance: {
          ...current.appearance,
          messageDisplay
        }
      };
    });
  }, [compactMode]);

  useEffect(() => {
    if (!open || !initialSection) {
      return;
    }
    if (!windowsSettingsAvailable && initialSection === "windows") {
      setActiveSection("appearance");
      return;
    }
    setActiveSection(initialSection);
  }, [open, initialSection, windowsSettingsAvailable]);

  useEffect(() => {
    if (!windowsSettingsAvailable && activeSection === "windows") {
      setActiveSection("appearance");
    }
  }, [activeSection, windowsSettingsAvailable]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setSettingsSearch("");
    setUsernameDraft(currentUser?.username ?? "");
    setDisplayNameDraft(currentUser?.displayName ?? "");
    setBioDraft(currentUser?.bio ?? "");
    setAvatarPathDraft(currentUser?.avatarPath ?? "");
    setCurrentPasswordDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setWarningMessage(null);
    setSuccessMessage(null);
    setAvatarUploadName(null);
    onClearError();
  }, [open, currentUser, onClearError]);

  useEffect(() => {
    if (!open || !normalizedSettingsSearch || visibleNavItems.length === 0) {
      return;
    }
    if (visibleNavItems.some((item) => item.id === activeSection)) {
      return;
    }
    setActiveSection(visibleNavItems[0].id);
  }, [activeSection, normalizedSettingsSearch, open, visibleNavItems]);

  useEffect(() => {
    if (open && activeSection === "voice-video") {
      void refreshDevices();
    }
  }, [activeSection, open, refreshDevices]);

  useEffect(() => {
    if (!open) {
      stopMicTest();
    }
  }, [open, stopMicTest]);

  const syncStartupConfiguration = useCallback(async () => {
    if (!isTauriDesktop()) {
      return;
    }

    const configured = await readStartupConfiguration();
    setPreferences((current) => ({
      ...current,
      windows: {
        ...current.windows,
        openOnStartup: configured.enabled,
        startMinimized: configured.enabled && configured.startMinimized
      }
    }));
  }, []);

  useEffect(() => {
    if (!open || !isTauriDesktop()) {
      return;
    }
    void syncStartupConfiguration();
  }, [open, syncStartupConfiguration]);

  useEffect(() => () => stopMicTest(), [stopMicTest]);

  const setAppearance = (patch: Partial<AppPreferences["appearance"]>) => {
    setPreferences((current) => ({
      ...current,
      appearance: {
        ...current.appearance,
        ...patch
      }
    }));
  };

  const setVoiceVideo = (patch: Partial<AppPreferences["voiceVideo"]>) => {
    setPreferences((current) => ({
      ...current,
      voiceVideo: {
        ...current.voiceVideo,
        ...patch
      }
    }));
  };

  const setChat = (patch: Partial<AppPreferences["chat"]>) => {
    setPreferences((current) => ({
      ...current,
      chat: {
        ...current.chat,
        ...patch
      }
    }));
  };

  const setWindows = (patch: Partial<AppPreferences["windows"]>) => {
    setPreferences((current) => ({
      ...current,
      windows: {
        ...current.windows,
        ...patch
      }
    }));
  };

  const applyStartupConfiguration = useCallback(
    async (enabled: boolean, startMinimized: boolean) => {
      const targetEnabled = enabled;
      const targetStartMinimized = targetEnabled && startMinimized;
      const configured = await configureStartup(targetEnabled, targetStartMinimized);

      setPreferences((current) => ({
        ...current,
        windows: {
          ...current.windows,
          openOnStartup: configured.enabled,
          startMinimized: configured.enabled && configured.startMinimized
        }
      }));

      if (targetEnabled && !configured.enabled) {
        setWarningMessage("Başlangıç ayarı işletim sistemine uygulanamadı.");
        return false;
      }

      return true;
    },
    []
  );

  const setStreamerMode = (patch: Partial<AppPreferences["streamerMode"]>) => {
    setPreferences((current) => ({
      ...current,
      streamerMode: {
        ...current.streamerMode,
        ...patch
      }
    }));
  };

  const submitProfile = async () => {
    const ok = await onUpdateProfile({
      username: usernameDraft,
      displayName: displayNameDraft,
      bio: bioDraft,
      avatarPath: avatarPathDraft
    });
    if (ok) {
      setSuccessMessage("Profil ayarları güncellendi.");
    }
  };

  const onAvatarFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.currentTarget.value = "";
    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setWarningMessage("Avatar için yalnızca görsel dosya yükleyebilirsin.");
      return;
    }

    if (file.size > AVATAR_MAX_BYTES) {
      setWarningMessage("Avatar dosyası en fazla 2 MB olabilir.");
      return;
    }

    const reader = new FileReader();
    reader.onerror = () => {
      setWarningMessage("Avatar dosyası okunamadı.");
    };
    reader.onload = () => {
      if (typeof reader.result !== "string" || !reader.result.startsWith("data:image/")) {
        setWarningMessage("Avatar dosyası geçersiz bir formatta.");
        return;
      }
      setAvatarPathDraft(reader.result);
      setAvatarUploadName(file.name);
      setWarningMessage(null);
      setSuccessMessage("Avatar seçildi. Kaydet ile profiline uygulayabilirsin.");
    };
    reader.readAsDataURL(file);
  };

  const submitPassword = async () => {
    if (!canSubmitPassword) {
      return;
    }
    const ok = await onChangePassword(currentPasswordDraft, newPasswordDraft);
    if (ok) {
      setCurrentPasswordDraft("");
      setNewPasswordDraft("");
      setConfirmPasswordDraft("");
      setSuccessMessage("Şifre başarıyla güncellendi.");
    }
  };

  const updatePrivacy = async (patch: UpdateFriendPrivacySettingsRequest) => {
    const ok = await onUpdateFriendPrivacy(patch);
    if (ok) {
      setSuccessMessage("Arkadaşlık isteği ayarları güncellendi.");
    }
  };

  const resetPreferences = () => {
    const defaults = getDefaultAppPreferences();
    setPreferences(defaults);
    onCompactModeChange(false);
    onResetUI();
    toastInfo("Ayarlar sıfırlandı", "Tüm arayüz tercihleri varsayılan değerlere döndü.");
    setSuccessMessage("Arayüz ayarları varsayılanlara döndürüldü.");
  };

  const renderAccountSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Hesabım" description="Profil, güvenlik ve bağlantı noktaları" />
      <div className="grid gap-4 xl:grid-cols-2">
        <article className="space-y-3 rounded-xl border border-slate-800/85 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <UserRound className="h-4 w-4 text-indigo-300" />
            <h3 className="text-sm font-semibold">Kullanıcı Profili</h3>
          </div>

          <div className="rounded-lg border border-slate-800/85 bg-slate-950/45 p-3">
            <p className="text-xs text-slate-400">Avatar</p>
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900 text-sm font-semibold text-slate-100">
                {avatarPreviewSrc ? (
                  <img alt="Avatar önizlemesi" className="h-full w-full object-cover" src={avatarPreviewSrc} />
                ) : (
                  <span>{(displayNameDraft || usernameDraft || "?").trim().slice(0, 2).toUpperCase()}</span>
                )}
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
                    onClick={() => avatarInputRef.current?.click()}
                    type="button"
                  >
                    Avatar Seç
                  </button>
                  <button
                    className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!avatarPathDraft.trim()}
                    onClick={() => {
                      setAvatarPathDraft("");
                      setAvatarUploadName(null);
                    }}
                    type="button"
                  >
                    Avatarı Temizle
                  </button>
                </div>
                <p className="truncate text-[11px] text-slate-500">
                  {avatarUploadName ? `${avatarUploadName} seçildi` : "PNG/JPG/WebP/GIF/AVIF, en fazla 2 MB"}
                </p>
              </div>
            </div>
            <input
              accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
              className="hidden"
              onChange={onAvatarFileChange}
              ref={avatarInputRef}
              type="file"
            />
          </div>

          <label className="block text-xs text-slate-400">
            Görünen ad
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setDisplayNameDraft(event.target.value)}
              value={displayNameDraft}
            />
          </label>

          <label className="block text-xs text-slate-400">
            Kullanıcı adı
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setUsernameDraft(event.target.value)}
              value={usernameDraft}
            />
          </label>

          <label className="block text-xs text-slate-400">
            Biyografi
            <textarea
              className="mt-1.5 h-24 w-full resize-none rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              maxLength={500}
              onChange={(event) => setBioDraft(event.target.value)}
              placeholder="Kendin hakkında kısa bir açıklama yaz."
              value={bioDraft}
            />
          </label>

          <label className="block text-xs text-slate-400">
            Avatar yolu (opsiyonel)
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setAvatarPathDraft(event.target.value)}
              placeholder="https://... veya /uploads/..."
              value={avatarPathDraft}
            />
          </label>

          <div className="flex items-center justify-between rounded-lg border border-slate-800/80 bg-slate-950/55 px-3 py-2 text-xs text-slate-400">
            <span>E-posta</span>
            <span className="truncate text-slate-200">{currentUser?.email ?? "-"}</span>
          </div>

          <button
            className="inline-flex items-center gap-2 rounded-md border border-indigo-500/45 bg-indigo-500/15 px-3 py-2 text-xs text-indigo-100 transition hover:bg-indigo-500/25 disabled:opacity-50"
            disabled={profileUpdating || !profileChanged}
            onClick={() => {
              void submitProfile();
            }}
            type="button"
          >
            <Save className="h-3.5 w-3.5" />
            {profileUpdating ? "Kaydediliyor..." : "Profili Kaydet"}
          </button>
        </article>

        <article className="space-y-3 rounded-xl border border-slate-800/85 bg-slate-900/60 p-4">
          <div className="flex items-center gap-2 text-slate-200">
            <KeyRound className="h-4 w-4 text-indigo-300" />
            <h3 className="text-sm font-semibold">Şifre Güncelle</h3>
          </div>

          <label className="block text-xs text-slate-400">
            Mevcut şifre
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setCurrentPasswordDraft(event.target.value)}
              type="password"
              value={currentPasswordDraft}
            />
          </label>

          <label className="block text-xs text-slate-400">
            Yeni şifre
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setNewPasswordDraft(event.target.value)}
              type="password"
              value={newPasswordDraft}
            />
          </label>

          <label className="block text-xs text-slate-400">
            Yeni şifre (tekrar)
            <input
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setConfirmPasswordDraft(event.target.value)}
              type="password"
              value={confirmPasswordDraft}
            />
          </label>

          {confirmPasswordDraft && newPasswordDraft !== confirmPasswordDraft ? (
            <p className="text-xs text-rose-300">Yeni şifre ve tekrar alanı aynı olmalı.</p>
          ) : null}

          <button
            className="inline-flex items-center gap-2 rounded-md border border-indigo-500/45 bg-indigo-500/15 px-3 py-2 text-xs text-indigo-100 transition hover:bg-indigo-500/25 disabled:opacity-50"
            disabled={passwordUpdating || !canSubmitPassword}
            onClick={() => {
              void submitPassword();
            }}
            type="button"
          >
            <KeyRound className="h-3.5 w-3.5" />
            {passwordUpdating ? "Güncelleniyor..." : "Şifreyi Güncelle"}
          </button>

        </article>
      </div>

      <article className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4">
        <h3 className="text-sm font-semibold text-rose-200">Oturum İşlemleri</h3>
        <p className="mt-1 text-xs text-rose-100/85">Çıkış yaptığında erişim ve yenileme tokenları temizlenir.</p>
        <button
          className="mt-3 inline-flex items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/20 px-3 py-2 text-xs text-rose-100 transition hover:bg-rose-500/30"
          onClick={onLogout}
          type="button"
        >
          <LogOut className="h-3.5 w-3.5" />
          Çıkış Yap
        </button>
      </article>
    </div>
  );

  const renderPrivacySection = () => (
    <div className="space-y-4">
      <SectionTitle title="Gizlilik ve Güvenlik" description="Arkadaşlık istekleri ve engellenen hesaplar" />
      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <ShieldAlert className="h-4 w-4 text-indigo-300" />
          <h3 className="text-sm font-semibold">Arkadaşlık İstekleri</h3>
        </div>

        {loadingFriendPrivacy ? (
          <p className="text-xs text-slate-500">Arkadaşlık isteği ayarları yükleniyor...</p>
        ) : (
          <div className="grid gap-2">
            <ToggleRow
              checked={friendPrivacySettings.allowEveryone}
              description="Herkes sana arkadaşlık isteği gönderebilir."
              disabled={updatingFriendPrivacy}
              onChange={(value) => {
                void updatePrivacy({ allowEveryone: value });
              }}
              title="Herkes"
            />
            <ToggleRow
              checked={friendPrivacySettings.allowFriendsOfFriends}
              description="Arkadaşlarının arkadaşları sana istek gönderebilir."
              disabled={updatingFriendPrivacy}
              onChange={(value) => {
                void updatePrivacy({ allowFriendsOfFriends: value });
              }}
              title="Arkadaşların arkadaşları"
            />
            <ToggleRow
              checked={friendPrivacySettings.allowServerMembers}
              description="Aynı sunucuda olduğun üyeler sana istek gönderebilir."
              disabled={updatingFriendPrivacy}
              onChange={(value) => {
                void updatePrivacy({ allowServerMembers: value });
              }}
              title="Sunucu üyeleri"
            />
          </div>
        )}
      </article>

      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <Ban className="h-4 w-4 text-amber-300" />
          <h3 className="text-sm font-semibold">Engellediğin Hesaplar</h3>
        </div>
        <div className="rounded-lg border border-slate-800/85 bg-slate-900/45">
          <div className="flex items-center justify-between border-b border-slate-800/80 px-3 py-2.5">
            <p className="text-sm font-medium text-slate-100">Engellenen hesaplar</p>
            <span className="text-xs text-slate-400">{blockedUsers.length} hesap</span>
          </div>

          {loadingBlockedUsers ? (
            <p className="px-3 py-4 text-xs text-slate-500">Engellenen hesaplar yükleniyor...</p>
          ) : blockedUsers.length === 0 ? (
            <p className="px-3 py-4 text-xs text-slate-500">Engellenen hesap yok.</p>
          ) : (
            <div className="divide-y divide-slate-800/70">
              {blockedUsers.map((item) => (
                <div className="flex items-center justify-between gap-3 px-3 py-3" key={item.userId}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-100">{item.displayName}</p>
                    <p className="truncate text-xs text-slate-500">
                      @{item.username}
                      {item.blockedAt ? ` • ${formatBlockedDate(item.blockedAt)} tarihinde engellendi` : ""}
                    </p>
                  </div>
                  <button
                    className="inline-flex items-center gap-1 rounded border border-slate-600/80 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-100 transition hover:border-slate-400"
                    onClick={() => {
                      void onUnblockUser(item.userId);
                    }}
                    type="button"
                  >
                    Engeli kaldır
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </article>

      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <div className="flex items-center gap-2 text-slate-200">
          <ShieldAlert className="h-4 w-4 text-cyan-300" />
          <h3 className="text-sm font-semibold">Harici Bağlantı Güvenliği</h3>
        </div>
        <p className="text-xs text-slate-400">
          “Bu domain için bir daha uyarma” seçeneğiyle güvenilen domainleri buradan temizleyebilirsin.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-800/85 bg-slate-950/45 px-3 py-2.5">
          <p className="text-sm text-slate-200">
            Güvenilen domain sayısı: <span className="font-semibold">{trustedDomainsCount}</span>
          </p>
          <button
            className="inline-flex items-center gap-1 rounded border border-slate-600/80 bg-slate-800/80 px-2.5 py-1.5 text-xs text-slate-100 transition hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={trustedDomainsCount === 0}
            onClick={() => {
              clearTrustedDomains();
              setSuccessMessage("Harici bağlantı güven listesi sıfırlandı.");
              toastInfo("Güven listesi sıfırlandı", "Harici bağlantılar için uyarılar tekrar gösterilecek.");
            }}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Güvenilen Domainleri Sıfırla
          </button>
        </div>
      </article>
    </div>
  );

  const renderAppearanceSection = () => {
    const activePreset = getThemePresetById(preferences.appearance.themePreset);
    const gradientPresets = THEME_PRESET_OPTIONS.filter((preset) => preset.category === "gradient");

    const applyPreset = (presetId: (typeof THEME_PRESET_OPTIONS)[number]["id"]) => {
      const next = applyThemePreset(preferences, presetId);
      setPreferences(next);
      setSuccessMessage(`${getThemePresetById(presetId).label} teması uygulandı.`);
    };

    return (
      <div className="catwa-settings-appearance space-y-5">
        <SectionTitle title="Tema" description="Ana tema ve renk geçişli özel temaları buradan yönetebilirsin." />
        <article className="catwa-settings-section space-y-4 p-1">
          <div className="flex items-start gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Palette className="h-4 w-4 text-indigo-300" />
                Varsayılan Temalar
              </p>
              <p className="mt-1 text-sm text-slate-300">Arayüzün rengini daha iyi görünürlük için ayarla.</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {THEME_OPTIONS.map((theme) => {
              const preset = getThemePresetById(theme.presetId);
              const active = preferences.appearance.themePreset === preset.id;
              return (
                <button
                  className={`relative h-14 w-14 border transition ${active ? "border-indigo-400/90" : "border-slate-600/80 hover:border-slate-400"}`}
                  key={theme.id}
                  onClick={() => applyPreset(preset.id)}
                  title={theme.label}
                  type="button"
                >
                  <span className="block h-full w-full" style={{ background: theme.swatch }} />
                  {active ? (
                    <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white">
                      <Check className="h-3 w-3" />
                    </span>
                  ) : null}
                </button>
              );
            })}
            <button
              className="inline-flex h-14 w-14 items-center justify-center border border-slate-600/80 text-slate-200 transition hover:border-slate-400"
              onClick={() => applyPreset("default-dark")}
              title="Varsayılana dön"
              type="button"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>

          <div className="border-t border-[var(--catwa-border-soft)] pt-4">
            <p className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Sparkles className="h-4 w-4 text-indigo-300" />
              Renk Temaları
            </p>
            <p className="mt-1 text-sm text-slate-300">Catwa'yı özelleştir. Tüm temalar herkese açık.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {gradientPresets.map((preset) => {
                const active = preferences.appearance.themePreset === preset.id;
                return (
                  <button
                    className={`relative h-14 w-14 border transition ${active ? "border-indigo-400/90" : "border-slate-600/80 hover:border-slate-400"}`}
                    key={preset.id}
                    onClick={() => applyPreset(preset.id)}
                    title={preset.label}
                    type="button"
                  >
                    <span className="block h-full w-full" style={{ background: preset.swatch }} />
                    {active ? (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex h-5 w-5 items-center justify-center rounded-full bg-indigo-500 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-[var(--catwa-border-soft)] pt-4">
            <p className="flex items-center gap-2 text-sm font-medium text-slate-100">
              <Monitor className="h-4 w-4 text-indigo-300" />
              Canlı Önizleme
            </p>
            <p className="mt-1 text-xs text-[var(--catwa-text-muted)]">
              Aktif tema: {activePreset.label} · {activePreset.description}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="catwa-settings-plain-btn inline-flex h-10 items-center border border-indigo-500/50 px-4 text-sm font-medium text-indigo-100"
                onClick={() => {
                  const normalized = {
                    ...preferences,
                    appearance: { ...preferences.appearance }
                  };
                  saveAppPreferences(normalized);
                  applyAppPreferences(normalized);
                  toastSuccess("Tema uygulandı", "Seçtiğin tema kaydedildi.");
                  setSuccessMessage("Tema ayarları uygulandı.");
                }}
                type="button"
              >
                Uygula
              </button>
              <button
                className="catwa-settings-plain-btn inline-flex h-10 items-center border border-slate-700/80 px-4 text-sm font-medium text-slate-200"
                onClick={() => {
                  const defaults = getDefaultAppPreferences();
                  const defaultPreset = getThemePresetById(defaults.appearance.themePreset);
                  const next = applyThemePreset(defaults, defaultPreset.id);
                  setPreferences((current) => ({
                    ...current,
                    appearance: next.appearance
                  }));
                  toastInfo("Tema sıfırlandı", "Varsayılan tema değerleri yüklendi.");
                  setSuccessMessage("Tema varsayılan ayarlara döndürüldü.");
                }}
                type="button"
              >
                Sıfırla
              </button>
            </div>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            <div className="catwa-settings-subsection p-3">
              <p className="text-sm font-medium text-slate-100">Kullanıcı Arayüzü Yoğunluğu</p>
              <div className="mt-2 flex gap-1">
                {([
                  { id: "comfortable", label: "Geniş" },
                  { id: "normal", label: "Varsayılan" },
                  { id: "compact", label: "Sıkışık" }
                ] as const).map((item) => (
                  <button
                    className={`catwa-settings-chip border px-2.5 py-1 text-xs ${
                      preferences.appearance.density === item.id
                        ? "catwa-settings-chip--active border-indigo-400/70 text-indigo-100"
                        : "border-slate-700/80 text-slate-300"
                    }`}
                    key={item.id}
                    onClick={() => setAppearance({ density: item.id })}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="catwa-settings-subsection p-3">
              <p className="text-sm font-medium text-slate-100">Uygulama İçi Simge Stili</p>
              <div className="mt-2 flex gap-1">
                {([
                  { id: "classic", label: "Klasik" },
                  { id: "filled", label: "Dolu" },
                  { id: "minimal", label: "Minimal" }
                ] as const).map((item) => (
                  <button
                    className={`catwa-settings-chip border px-2.5 py-1 text-xs ${
                      preferences.appearance.iconStyle === item.id
                        ? "catwa-settings-chip--active border-indigo-400/70 text-indigo-100"
                        : "border-slate-700/80 text-slate-300"
                    }`}
                    key={item.id}
                    onClick={() => setAppearance({ iconStyle: item.id })}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </article>

        <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Mesaj Aralığı</h3>
        <div className="rounded-lg border border-slate-800/85 bg-slate-950/45 p-3">
          <p className="text-sm font-medium text-slate-100">Sohbet Mesaj Görünümü</p>
          <div className="mt-2 flex gap-1">
            {([
              { id: "default", label: "Varsayılan" },
              { id: "compact", label: "Sıkışık" }
            ] as const).map((item) => (
              <button
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  preferences.appearance.messageDisplay === item.id
                    ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700/80 bg-slate-900 text-slate-300"
                }`}
                key={item.id}
                onClick={() => {
                  setAppearance({ messageDisplay: item.id });
                  onCompactModeChange(item.id === "compact");
                }}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <RangeRow
          description="Mesaj grupları arasındaki boşluğu ayarlar."
          label="Mesaj Grupları Arasındaki Boşluk"
          max={24}
          min={0}
          onChange={(value) => setAppearance({ messageGroupGap: value })}
          unit="px"
          value={preferences.appearance.messageGroupGap}
        />
      </article>

      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Ölçekleme</h3>
        <RangeRow
          description="Sohbet metin boyutunu değiştirir."
          label="Sohbet Yazı Tipi Ölçeği"
          max={24}
          min={12}
          onChange={(value) => setAppearance({ chatFontSize: value })}
          unit="px"
          value={preferences.appearance.chatFontSize}
        />
        <RangeRow
          description="Arayüz boyutunu genel olarak ölçekler."
          label="Yakınlaştırma Seviyesi"
          max={200}
          min={50}
          onChange={(value) => setAppearance({ uiZoom: value })}
          unit="%"
          value={preferences.appearance.uiZoom}
        />
      </article>
    </div>
  );
  };

  const renderVoiceVideoSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Ses ve Görüntü" description="Mikrofon, hoparlör ve gelişmiş ses ayarları" />
      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-lg font-semibold text-slate-100">Ses</h3>
          <button
            className="inline-flex items-center gap-1 rounded-md border border-slate-700/80 bg-slate-900 px-2.5 py-1 text-xs text-slate-300 transition hover:border-slate-500"
            onClick={() => {
              void refreshDevices();
            }}
            type="button"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {deviceLoading ? "Yenileniyor..." : "Cihazları Yenile"}
          </button>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block text-xs text-slate-400">
            Mikrofon
            <select
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setVoiceVideo({ inputDeviceId: event.target.value })}
              value={preferences.voiceVideo.inputDeviceId}
            >
              <option value="default">Windows Varsayılanı</option>
              {inputDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Mikrofon ${index + 1}`}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs text-slate-400">
            Konuşmacı
            <select
              className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
              onChange={(event) => setVoiceVideo({ outputDeviceId: event.target.value })}
              value={preferences.voiceVideo.outputDeviceId}
            >
              <option value="default">Windows Varsayılanı</option>
              {outputDevices.map((device, index) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Hoparlör ${index + 1}`}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <RangeRow
            label="Mikrofon Ses Seviyesi"
            max={100}
            min={0}
            onChange={(value) => setVoiceVideo({ inputVolume: value })}
            value={preferences.voiceVideo.inputVolume}
          />
          <RangeRow
            label="Hoparlör Ses Seviyesi"
            max={100}
            min={0}
            onChange={(value) => setVoiceVideo({ outputVolume: value })}
            value={preferences.voiceVideo.outputVolume}
          />
        </div>

        <div className="rounded-lg border border-slate-800/85 bg-slate-950/45 p-3">
          <div className="flex items-center gap-2">
            <button
              className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium transition ${
                micTesting
                  ? "border-rose-500/50 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30"
                  : "border-indigo-500/50 bg-indigo-500/20 text-indigo-100 hover:bg-indigo-500/30"
              }`}
              onClick={() => {
                if (micTesting) {
                  stopMicTest();
                  return;
                }
                void startMicTest();
              }}
              type="button"
            >
              <Volume2 className="h-4 w-4" />
              {micTesting ? "Mikrofon Testini Durdur" : "Mikrofon Testi"}
            </button>
            <p className="text-xs text-slate-400">Mikrofon seviyesini canlı izle</p>
          </div>
          <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-[var(--catwa-accent)] transition-[width] duration-75"
              style={{ width: `${micLevel}%` }}
            />
          </div>
        </div>
      </article>

      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Giriş Profili</h3>
        <div className="space-y-2 rounded-lg border border-slate-800/85 bg-slate-950/45 p-3">
          {([
            { id: "isolation", label: "Ses İzolasyonu", description: "Arka plan gürültüsünü agresif biçimde azaltır." },
            { id: "studio", label: "Stüdyo", description: "Daha doğal ama temiz bir giriş profili." },
            { id: "custom", label: "Özel", description: "Aşağıdaki gelişmiş ayarları manuel yönet." }
          ] as const).map((item) => (
            <label className="flex cursor-pointer items-start gap-3 rounded-md px-1 py-1 text-sm text-slate-200" key={item.id}>
              <input
                checked={preferences.voiceVideo.voiceProfile === item.id}
                className="mt-1 accent-indigo-500"
                name="voice-profile"
                onChange={() => setVoiceVideo({ voiceProfile: item.id })}
                type="radio"
              />
              <span>
                <span className="block font-medium">{item.label}</span>
                <span className="block text-xs text-slate-400">{item.description}</span>
              </span>
            </label>
          ))}
        </div>

      </article>

      <article className="space-y-3 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Ses İşleme</h3>

        <label className="block text-xs text-slate-400">
          Gürültü Azaltma
          <select
            className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 outline-none transition focus:border-indigo-400/60"
            onChange={(event) =>
              setVoiceVideo({
                noiseSuppression: event.target.value as AppPreferences["voiceVideo"]["noiseSuppression"]
              })
            }
            value={preferences.voiceVideo.noiseSuppression}
          >
            <option value="standard">Standart</option>
            <option value="off">Kapalı</option>
          </select>
        </label>

        <ToggleRow
          checked={preferences.voiceVideo.echoCancellation}
          description="Mikrofon yankısını bastırır."
          onChange={(value) => setVoiceVideo({ echoCancellation: value })}
          title="Yankı Engelleme"
        />
        <ToggleRow
          checked={preferences.voiceVideo.pushToTalk}
          description="Mikrofon sadece belirlenen tuşa basarken iletilir."
          onChange={(value) => setVoiceVideo({ pushToTalk: value })}
          title="Bas-Konuş"
        />
        <ToggleRow
          checked={preferences.voiceVideo.autoGainControl}
          description="Mikrofon ses seviyesini temiz ve tutarlı tutar."
          onChange={(value) => setVoiceVideo({ autoGainControl: value })}
          title="Otomatik Kazanç Kontrolü"
        />
      </article>
    </div>
  );

  const renderChatSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Sohbet" description="Medya, emoji ve metin kutusu davranışları" />
      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Resimler, videolar ve lolcatleri göster</h3>
        <ToggleRow
          checked={preferences.chat.showLinkMedia}
          description="Sohbette bağlantı olarak paylaşıldığında."
          onChange={(value) => setChat({ showLinkMedia: value })}
          title="Bağlantı medyası"
        />
        <ToggleRow
          checked={preferences.chat.showUploadedMedia}
          description="Doğrudan yüklenen görsel dosyaları önizler."
          onChange={(value) => setChat({ showUploadedMedia: value })}
          title="Yüklenen medya"
        />
        <ToggleRow
          checked={preferences.chat.showAltText}
          description="Görseller için açıklama metinlerini görünür yapar."
          onChange={(value) => setChat({ showAltText: value })}
          title="Görsel açıklamaları"
        />
      </article>

      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Eklentiler ve Bağlantı Önizlemeleri</h3>
        <ToggleRow
          checked={preferences.chat.showEmbeds}
          description="Sohbete yapıştırılan eklentileri ve web önizlemelerini gösterir."
          onChange={(value) => setChat({ showEmbeds: value })}
          title="Önizlemeleri göster"
        />
      </article>

      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">Emoji</h3>
        <ToggleRow
          checked={preferences.chat.showEmojiReactions}
          description="Mesajlarda emoji tepkilerini gösterir."
          onChange={(value) => setChat({ showEmojiReactions: value })}
          title="Emoji tepkileri"
        />
        <ToggleRow
          checked={preferences.chat.autoEmojiConvert}
          description="Kısayol ifadeleri otomatik emojilere dönüştürülür."
          onChange={(value) => setChat({ autoEmojiConvert: value })}
          title="Otomatik emoji dönüştür"
        />
      </article>

      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <h3 className="text-lg font-semibold text-slate-100">İçerik</h3>
        <ToggleRow
          checked={preferences.chat.allowSensitiveDM}
          description="Arkadaşlardan gelen direkt mesajlarda hassas içeriği göster."
          onChange={(value) => setChat({ allowSensitiveDM: value })}
          title="Yetişkin içerikli DM"
        />
        <ToggleRow
          checked={preferences.chat.allowSensitiveServer}
          description="Sunucu kanallarındaki hassas içerikleri göster."
          onChange={(value) => setChat({ allowSensitiveServer: value })}
          title="Sunucu içerikleri"
        />
        <div className="rounded-lg border border-slate-800/85 bg-slate-950/45 p-3">
          <p className="text-sm font-medium text-slate-100">Direkt Mesaj spam'i</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {([
              { id: "all", label: "Hepsini filtrele" },
              { id: "non-friends", label: "Arkadaş olmadıkların" },
              { id: "off", label: "Filtreleme" }
            ] as const).map((item) => (
              <button
                className={`rounded-md border px-2.5 py-1 text-xs transition ${
                  preferences.chat.dmSpamFilter === item.id
                    ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100"
                    : "border-slate-700/80 bg-slate-900 text-slate-300"
                }`}
                key={item.id}
                onClick={() => setChat({ dmSpamFilter: item.id })}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </article>
    </div>
  );

  const renderKeybindsSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Tuş Atamaları" description="Mesajlar, navigasyon ve ses kısayolları" />
      {KEYBIND_GROUPS.map((group) => (
        <article className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-4" key={group.title}>
          <h3 className="text-2xl font-semibold text-slate-100">{group.title}</h3>
          {group.description ? <p className="mt-1 text-sm text-slate-400">{group.description}</p> : null}
          <div className="mt-3 overflow-hidden rounded-lg border border-slate-800/85 bg-slate-950/45">
            {group.rows.map((row, index) => (
              <div
                className={`flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between ${
                  index !== group.rows.length - 1 ? "border-b border-slate-800/75" : ""
                }`}
                key={`${group.title}-${row.label}`}
              >
                <p className="text-sm text-slate-200">{row.label}</p>
                <div className="flex flex-wrap items-center gap-1.5 md:justify-end">
                  {row.keys.map((key) => (
                    <span
                      className="inline-flex min-w-[26px] items-center justify-center rounded bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-300"
                      key={`${row.label}-${key}`}
                    >
                      {key}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </article>
      ))}
    </div>
  );

  const renderWindowsSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Windows Ayarları" description="Başlangıç davranışı ve sistem yardımcıları" />
      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <ToggleRow
          checked={preferences.windows.openOnStartup}
          description="Bilgisayar açıldığında Catwa otomatik başlar."
          onChange={(value) => {
            setWindows({ openOnStartup: value, startMinimized: value ? preferences.windows.startMinimized : false });
            if (isTauriDesktop()) {
              void applyStartupConfiguration(value, value ? preferences.windows.startMinimized : false);
            }
          }}
          title="Başlangıçta Catwa'i Aç"
        />
        <ToggleRow
          checked={preferences.windows.startMinimized}
          description="Başlangıçta pencereyi simge durumunda başlatır."
          disabled={!preferences.windows.openOnStartup}
          onChange={(value) => {
            setWindows({ startMinimized: value });
            if (isTauriDesktop() && preferences.windows.openOnStartup) {
              void applyStartupConfiguration(true, value);
            }
          }}
          title="Simge Durumunda Başlat"
        />
        <ToggleRow
          checked={preferences.windows.closeButtonMinimizes}
          description="Kapat düğmesi uygulamayı tamamen kapatmak yerine küçültür."
          onChange={(value) => setWindows({ closeButtonMinimizes: value })}
          title="Kapat Düğmesi Başlat Çubuğuna Küçültsün"
        />
        <div className="flex items-center justify-between rounded-lg border border-slate-800/85 bg-slate-950/45 px-4 py-3">
          <div>
            <p className="text-sm font-medium text-slate-100">Catwa Sistem Yardımcısı</p>
            <p className="mt-0.5 text-xs text-slate-400">Kısayollar ve arka plan entegrasyonları için yerel yardımcı süreç.</p>
          </div>
          <button
            className={`inline-flex h-10 items-center rounded-md border px-4 text-sm font-medium transition ${
              preferences.windows.systemHelperEnabled
                ? "border-rose-500/50 bg-rose-500/15 text-rose-200 hover:bg-rose-500/25"
                : "border-emerald-500/50 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25"
            }`}
            onClick={() => setWindows({ systemHelperEnabled: !preferences.windows.systemHelperEnabled })}
            type="button"
          >
            {preferences.windows.systemHelperEnabled ? "Kaldır" : "Etkinleştir"}
          </button>
        </div>

        <div className="flex items-center justify-between rounded-lg border border-slate-800/85 bg-slate-950/45 px-4 py-3">
          <div className="pr-4">
            <p className="text-sm font-medium text-slate-100">Güncellemeler</p>
            <p className="mt-0.5 text-xs text-slate-400">
              {!isTauriDesktop()
                ? "Güncelleme denetimi yalnızca masaüstü uygulamada kullanılabilir."
                : !updaterEnabled
                  ? "Bu sürümde otomatik güncelleme kapalı."
                  : updaterDownloading
                    ? "Yeni sürüm arka planda indiriliyor."
                    : updaterReadyVersion
                      ? `${updaterReadyVersion} sürümü indirildi, yeniden başlatınca uygulanır.`
                      : "Yeni sürüm olup olmadığını hemen kontrol et."}
            </p>
          </div>
          <button
            className="inline-flex h-10 items-center gap-2 rounded-md border border-cyan-500/50 bg-cyan-500/15 px-4 text-sm font-medium text-cyan-100 transition hover:bg-cyan-500/25 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isTauriDesktop() || !updaterEnabled || updaterChecking || updaterDownloading}
            onClick={() => requestManualUpdateCheck()}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${updaterChecking ? "animate-spin" : ""}`} />
            Güncelleme denetle
          </button>
        </div>
      </article>
    </div>
  );

  const renderStreamerModeSection = () => (
    <div className="space-y-4">
      <SectionTitle title="Yayıncı Modu" description="Yayın sırasında kişisel bilgileri gizleme ayarları" />
      <article className="space-y-2 rounded-xl border border-slate-800/90 bg-slate-900/55 p-4">
        <ToggleRow
          checked={preferences.streamerMode.enabled}
          description="Yayıncı modu aktif olduğunda aşağıdaki korumalar uygulanır."
          onChange={(value) => setStreamerMode({ enabled: value })}
          title="Yayıncı Modunu Etkinleştir"
        />
        <ToggleRow
          checked={preferences.streamerMode.hidePersonalInfo}
          description="E-posta, kullanıcı adı etiketi gibi bilgileri maskeleyebilir."
          disabled={!preferences.streamerMode.enabled}
          onChange={(value) => setStreamerMode({ hidePersonalInfo: value })}
          title="Kişisel bilgileri gizle"
        />
        <ToggleRow
          checked={preferences.streamerMode.hideInviteLinks}
          description="Davet bağlantılarını ekran yayınında bulanıklaştırır."
          disabled={!preferences.streamerMode.enabled}
          onChange={(value) => setStreamerMode({ hideInviteLinks: value })}
          title="Davet bağlantılarını gizle"
        />
        <ToggleRow
          checked={preferences.streamerMode.hideSounds}
          description="Bildirim seslerini susturur."
          disabled={!preferences.streamerMode.enabled}
          onChange={(value) => setStreamerMode({ hideSounds: value })}
          title="Bildirim seslerini kapat"
        />
        <ToggleRow
          checked={preferences.streamerMode.hideNotificationPreview}
          description="Masaüstü bildirim metin önizlemesini gizler."
          disabled={!preferences.streamerMode.enabled}
          onChange={(value) => setStreamerMode({ hideNotificationPreview: value })}
          title="Bildirim önizlemesini gizle"
        />
      </article>
    </div>
  );

  const renderContent = () => {
    if (activeSection === "account") {
      return renderAccountSection();
    }
    if (activeSection === "privacy") {
      return renderPrivacySection();
    }
    if (activeSection === "appearance") {
      return renderAppearanceSection();
    }
    if (activeSection === "voice-video") {
      return renderVoiceVideoSection();
    }
    if (activeSection === "chat") {
      return renderChatSection();
    }
    if (activeSection === "keybinds") {
      return renderKeybindsSection();
    }
    if (activeSection === "windows") {
      if (!windowsSettingsAvailable) {
        return renderAppearanceSection();
      }
      return renderWindowsSection();
    }
    if (activeSection === "streamer-mode") {
      return renderStreamerModeSection();
    }
    return renderAppearanceSection();
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
      <Dialog.Portal forceMount>
        <AnimatePresence initial={false}>
          {open ? (
            <Dialog.Overlay asChild forceMount>
              <motion.div
                animate={{ opacity: 1 }}
                className="fixed inset-0 z-[70] bg-[var(--catwa-overlay-color)]"
                exit={{ opacity: 0 }}
                initial={{ opacity: 0 }}
                transition={preferences.accessibility.reducedMotion ? { duration: 0 } : { duration: 0.16, ease: "easeOut" }}
              />
            </Dialog.Overlay>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {open ? (
            <Dialog.Content asChild forceMount>
              <motion.div
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: 0
                }}
                className="catwa-settings-modal fixed inset-0 z-[71] h-[100dvh] w-screen overflow-hidden rounded-none border-0 md:left-0 md:right-0 md:top-[6vh] md:mx-auto md:h-[88vh] md:max-h-[960px] md:w-[min(1240px,94vw)] md:rounded-2xl md:border md:border-[var(--catwa-border-soft)]"
                exit={
                  preferences.accessibility.reducedMotion
                    ? { opacity: 0 }
                    : {
                        opacity: 0,
                        scale: 0.995,
                        y: 6
                      }
                }
                initial={
                  preferences.accessibility.reducedMotion
                    ? { opacity: 1 }
                    : {
                        opacity: 0,
                        scale: 0.995,
                        y: 8
                      }
                }
                transition={
                  preferences.accessibility.reducedMotion
                    ? { duration: 0 }
                    : { duration: 0.2, ease: [0.22, 1, 0.36, 1] }
                }
              >
          <header className="flex h-14 items-center justify-between border-b border-[var(--catwa-border-soft)] px-4 md:h-16 md:px-5">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-slate-500">{appName}</p>
              <Dialog.Title className="truncate text-lg font-semibold text-slate-100">Ayarlar</Dialog.Title>
            </div>
            <Dialog.Close asChild>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--catwa-border-soft)] bg-transparent text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="grid h-[calc(100%-3.5rem)] grid-cols-1 overflow-hidden md:h-[calc(100%-4rem)] md:grid-cols-[260px_minmax(0,1fr)]">
            <aside className="catwa-settings-nav h-[188px] overflow-y-auto border-b border-[var(--catwa-border-soft)] px-3 py-3 md:h-full md:border-b-0 md:border-r md:py-4">
              <div className="mb-4 border-b border-[var(--catwa-border-soft)] pb-3">
                <div className="flex items-center gap-2 px-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-700 text-sm font-semibold text-slate-100">
                    {(currentUser?.displayName || currentUser?.username || "U").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-100">{currentUser?.displayName || currentUser?.username || "Kullanıcı"}</p>
                    <p className="truncate text-xs text-slate-400">@{currentUser?.username || "user"}</p>
                  </div>
                </div>
                <div className="mt-3 px-2">
                  <input
                    className="h-9 w-full rounded-lg border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_76%,black_24%)] px-3 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-[var(--catwa-accent-ring)]"
                    onChange={(event) => setSettingsSearch(event.target.value)}
                    placeholder="Ara"
                    type="text"
                    value={settingsSearch}
                  />
                </div>
              </div>
              {visibleNavItems.length === 0 ? (
                <p className="px-2 py-2 text-xs text-slate-500">Arama sonucunda bölüm bulunamadı.</p>
              ) : null}

              {(["Kullanıcı Ayarları", "Uygulama Ayarları"] as const).map((groupTitle, groupIndex) => (
                <div
                  className={`${groupIndex === 0 ? "" : "mt-3 border-t border-[var(--catwa-border-soft)] pt-3"}`}
                  key={groupTitle}
                >
                  {groupedNav[groupTitle].length === 0 ? null : (
                  <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{groupTitle}</p>
                  )}
                  <div className="space-y-0">
                    {groupedNav[groupTitle].map((item) => {
                      const Icon = item.icon;
                      const active = item.id === activeSection;

                      return (
                        <button
                          className={`catwa-settings-nav-item flex w-full items-center gap-2 border-l-2 px-2.5 py-2 text-sm transition-colors ${
                            active
                              ? "border-l-[var(--catwa-accent)] bg-[var(--catwa-accent-softest)] font-medium text-slate-100"
                              : "border-l-transparent text-slate-400 hover:bg-white/[0.03] hover:text-slate-200"
                          }`}
                          key={item.id}
                          onClick={() => setActiveSection(item.id)}
                          type="button"
                        >
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </aside>

            <section className="catwa-settings-content h-full overflow-y-auto px-4 py-4 md:px-6 md:py-5">
              {(error || successMessage || warningMessage) && (
                <div className="mb-4 space-y-2">
                  {error ? (
                    <p className="rounded-md border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</p>
                  ) : null}
                  {successMessage ? (
                    <p className="rounded-md border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                      {successMessage}
                    </p>
                  ) : null}
                  {warningMessage ? (
                    <p className="rounded-md border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                      {warningMessage}
                    </p>
                  ) : null}
                </div>
              )}

              {renderContent()}

              <footer className="mt-6 flex items-center justify-between border-t border-[var(--catwa-border-soft)] pt-4">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Sparkles className="h-4 w-4" />
                  Değişiklikler otomatik kaydedilir.
                </div>

                <button
                  className="inline-flex items-center gap-2 rounded-md border border-slate-700/80 bg-slate-800/70 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                  onClick={onClose}
                  type="button"
                >
                  Kapat
                </button>
              </footer>
            </section>
          </div>
              </motion.div>
            </Dialog.Content>
          ) : null}
        </AnimatePresence>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

