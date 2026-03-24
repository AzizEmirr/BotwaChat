import { ChevronDown, ChevronRight, Copy, Headphones, Mic, MicOff, Pencil, Settings } from "lucide-react";
import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { resolveAvatarURL } from "../../lib/avatar";
import { getDesktopAppVersion } from "../../lib/desktopBridge";
import { toPublicID } from "../../lib/publicId";
import { isTauriDesktop } from "../../lib/runtime";
import { toastInfo, toastSuccess } from "../../store/toastStore";
import type { UserProfile } from "../../types/chat";
import { avatarTone, displayInitials } from "./ui";

export type SelfPresenceStatus = "online" | "idle" | "dnd" | "invisible";

type UserPanelProps = {
  currentUser: UserProfile | null;
  wsConnected: boolean;
  liveKitConnected: boolean;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  hasActiveVoiceChannel: boolean;
  selfPresenceStatus: SelfPresenceStatus;
  onChangeSelfPresenceStatus: (status: SelfPresenceStatus) => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  onOpenSettings: (section?: "account") => void;
  onLogout: () => void;
};

type StatusMeta = {
  label: string;
  description: string;
  dotClass: string;
};

const STATUS_META: Record<SelfPresenceStatus, StatusMeta> = {
  online: {
    label: "Çevrimiçi",
    description: "Mesajlar ve bildirimler açık",
    dotClass: "bg-emerald-400"
  },
  idle: {
    label: "Boşta",
    description: "Uzakta görünürsün",
    dotClass: "bg-amber-400"
  },
  dnd: {
    label: "Rahatsız Etmeyin",
    description: "Masaüstü bildirimleri almayacaksın",
    dotClass: "bg-rose-400"
  },
  invisible: {
    label: "Görünmez",
    description: "Çevrimdışı görüneceksin",
    dotClass: "bg-slate-500"
  }
};

function ActionButton({
  title,
  icon: Icon,
  disabled,
  onClick,
  active,
  showChevron = false
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  disabled?: boolean;
  onClick?: () => void;
  active?: boolean;
  showChevron?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-8 items-center justify-center gap-1 rounded-lg border px-2 transition-all duration-150 disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? "border-rose-400/35 bg-rose-500/18 text-rose-100 shadow-[0_0_0_1px_rgba(251,113,133,0.12)]"
          : "border-white/10 bg-black/20 text-slate-200 hover:border-white/25 hover:bg-white/12 hover:text-slate-100"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon className="h-4 w-4" />
      {showChevron ? <ChevronDown className="h-3 w-3 opacity-75" /> : null}
    </button>
  );
}

export function UserPanel({
  currentUser,
  wsConnected,
  liveKitConnected,
  voiceMuted,
  voiceDeafened,
  hasActiveVoiceChannel,
  selfPresenceStatus,
  onChangeSelfPresenceStatus,
  onToggleMute,
  onToggleDeafen,
  onOpenSettings,
  onLogout
}: UserPanelProps) {
  const menuRootRef = useRef<HTMLDivElement | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(__CATWA_APP_VERSION__ || null);

  const presenceMeta = useMemo(() => STATUS_META[selfPresenceStatus], [selfPresenceStatus]);
  const avatarSrc = useMemo(() => resolveAvatarURL(currentUser?.avatarPath), [currentUser?.avatarPath]);

  useEffect(() => {
    if (!isTauriDesktop()) {
      setAppVersion(__CATWA_APP_VERSION__ || null);
      return;
    }

    let mounted = true;
    void getDesktopAppVersion()
      .then((version) => {
        if (mounted) {
          setAppVersion((version ?? __CATWA_APP_VERSION__) || null);
        }
      })
      .catch(() => {
        if (mounted) {
          setAppVersion(__CATWA_APP_VERSION__ || null);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!feedback) {
      return;
    }
    const timer = window.setTimeout(() => setFeedback(null), 1800);
    return () => window.clearTimeout(timer);
  }, [feedback]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRootRef.current && !menuRootRef.current.contains(target)) {
        setProfileOpen(false);
        setStatusMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, []);

  const copyUserID = async () => {
    if (!currentUser?.id) {
      return;
    }

    try {
      await navigator.clipboard.writeText(toPublicID(currentUser.id));
      setFeedback("Kullanıcı ID kopyalandı.");
      toastSuccess("Kullanıcı ID'si kopyalandı");
    } catch {
      setFeedback("Kullanıcı ID kopyalanamadı.");
    }
  };

  const onAccountSwitch = () => {
    setProfileOpen(false);
    setStatusMenuOpen(false);
    onLogout();
  };

  return (
    <footer className="shrink-0 border-t border-[var(--catwa-border-soft)] bg-transparent px-2 pb-2 pt-2">
      <div
        className="relative rounded-xl border border-white/12 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--catwa-accent)_30%,transparent)_0%,color-mix(in_srgb,var(--catwa-panel)_82%,black_18%)_48%,color-mix(in_srgb,var(--catwa-accent-secondary)_18%,transparent)_100%)] px-1.5 py-1.5 shadow-[0_16px_36px_-24px_rgba(2,6,23,0.88)]"
        ref={menuRootRef}
      >
        <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_85%_0%,rgba(255,255,255,0.18),transparent_48%)]" />

        {profileOpen && (
          <div className="absolute bottom-[calc(100%+10px)] left-0 z-40 w-[min(92vw,304px)] rounded-xl border border-slate-700/70 bg-[#2f2b3e] p-3 shadow-2xl">
            <div className="relative overflow-hidden rounded-lg border border-slate-700/60 bg-slate-900/35">
              <div className="h-24 bg-gradient-to-r from-fuchsia-500/35 via-violet-500/20 to-cyan-500/30" />
              <div className="relative -mt-7 px-3 pb-3">
                <div className="relative inline-flex">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-[#2f2b3e] text-sm font-semibold text-slate-100"
                    style={{ backgroundColor: avatarTone(currentUser?.id ?? "anon") }}
                  >
                    {avatarSrc ? (
                      <img alt="Profil avatarı" className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
                    ) : (
                      displayInitials(currentUser?.displayName ?? "?", currentUser?.username ?? "?")
                    )}
                  </div>
                  <span className={`absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full border-2 border-[#2f2b3e] ${presenceMeta.dotClass}`} />
                </div>

                <p className="catwa-personal-info mt-2 truncate text-3xl font-semibold text-slate-100">
                  {currentUser?.displayName ?? "Kullanıcı"}
                </p>
                <p className="catwa-personal-info truncate text-sm text-slate-300">@{currentUser?.username ?? "kullanici"}</p>
                <p className="mt-1 text-sm text-slate-300">{presenceMeta.label}</p>
              </div>
            </div>

            <div className="mt-3 space-y-1 rounded-lg border border-slate-700/50 bg-slate-900/30 p-1.5">
              <button
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800/70"
                onClick={() => {
                  setProfileOpen(false);
                  setStatusMenuOpen(false);
                  onOpenSettings("account");
                }}
                type="button"
              >
                <Pencil className="h-4 w-4" />
                Profili Düzenle
              </button>

              <button
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800/70"
                onClick={() => setStatusMenuOpen((current) => !current)}
                type="button"
              >
                <span className="inline-flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${presenceMeta.dotClass}`} />
                  {presenceMeta.label}
                </span>
                <ChevronRight className="h-4 w-4" />
              </button>

              {statusMenuOpen && (
                <div className="space-y-1 rounded-md border border-slate-700/60 bg-slate-900/45 p-1.5">
                  {(["online", "idle", "dnd", "invisible"] as SelfPresenceStatus[]).map((status) => {
                    const meta = STATUS_META[status];
                    return (
                      <button
                        className={`w-full rounded-md px-2.5 py-2 text-left transition ${
                          status === selfPresenceStatus ? "bg-slate-800/75" : "hover:bg-slate-800/60"
                        }`}
                        key={status}
                        onClick={() => {
                          onChangeSelfPresenceStatus(status);
                          setStatusMenuOpen(false);
                          setFeedback(`Durum güncellendi: ${meta.label}`);
                          toastInfo("Durum güncellendi", meta.label);
                        }}
                        type="button"
                      >
                        <span className="inline-flex items-center gap-2 text-sm font-medium text-slate-100">
                          <span className={`inline-block h-2.5 w-2.5 rounded-full ${meta.dotClass}`} />
                          {meta.label}
                        </span>
                        <span className="mt-0.5 block pl-4 text-xs text-slate-400">{meta.description}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <button
                className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800/70"
                onClick={onAccountSwitch}
                type="button"
              >
                <span>Hesap Değiştir</span>
                <ChevronRight className="h-4 w-4" />
              </button>

              <button
                className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-sm text-slate-200 transition hover:bg-slate-800/70"
                onClick={() => {
                  void copyUserID();
                }}
                type="button"
              >
                <Copy className="h-4 w-4" />
                Kullanıcı ID'sini Kopyala
              </button>
            </div>

            {feedback && <p className="mt-2 text-xs text-cyan-200">{feedback}</p>}
          </div>
        )}

        <div className="relative z-[1] flex items-center justify-between gap-2">
          <button
            className="flex min-w-0 items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-white/12 active:bg-white/15"
            onClick={() => {
              setProfileOpen((current) => {
                const nextOpen = !current;
                if (!nextOpen) {
                  setStatusMenuOpen(false);
                }
                return nextOpen;
              });
            }}
            type="button"
          >
            <div
              className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-xs font-semibold text-slate-100"
              style={{ backgroundColor: avatarTone(currentUser?.id ?? "anon") }}
            >
              {avatarSrc ? (
                <img alt="Profil avatarı" className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
              ) : (
                displayInitials(currentUser?.displayName ?? "?", currentUser?.username ?? "?")
              )}
              <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${presenceMeta.dotClass}`} />
            </div>

            <div className="min-w-0">
              <p className="catwa-personal-info truncate text-sm font-semibold text-slate-100">{currentUser?.displayName ?? "Kullanıcı"}</p>
              <p className="truncate text-[11px] text-slate-200/80">{presenceMeta.label}</p>
            </div>
          </button>

          <div className="flex items-center gap-1 rounded-lg bg-black/10 p-1">
            <ActionButton
              active={hasActiveVoiceChannel && !voiceMuted && !voiceDeafened}
              disabled={!hasActiveVoiceChannel}
              icon={voiceMuted ? MicOff : Mic}
              onClick={onToggleMute}
              showChevron
              title={voiceMuted ? "Mikrofonu aç" : "Mikrofonu kapat"}
            />
            <ActionButton
              active={hasActiveVoiceChannel && !voiceDeafened}
              disabled={!hasActiveVoiceChannel}
              icon={Headphones}
              onClick={onToggleDeafen}
              showChevron
              title={voiceDeafened ? "Dinlemeyi aç" : "Dinlemeyi kapat"}
            />
            <ActionButton icon={Settings} onClick={onOpenSettings} title="Ayarlar" />
          </div>
        </div>
      </div>
      {appVersion ? (
        <p className="pointer-events-none fixed bottom-1.5 right-2 z-[120] select-none text-[10px] text-slate-200/75">v{appVersion}</p>
      ) : null}
    </footer>
  );
}

