import { MoreHorizontal, UserMinus, UserRoundPlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { resolveAvatarURL } from "../../lib/avatar";
import type { DMConversation, PresenceState } from "../../types/chat";
import { avatarTone, displayInitials, formatPresence, presenceDotClass } from "./ui";

type ProfileQuickAction = {
  id: string;
  label: string;
  danger?: boolean;
  separatorBefore?: boolean;
  onSelect: () => void;
};

type FriendProfileSidebarProps = {
  conversation: DMConversation;
  presence?: PresenceState;
  mutualServerCount: number;
  mutualFriendCount: number;
  isFriend: boolean;
  note?: string;
  quickActions: ProfileQuickAction[];
  ignored: boolean;
  onToggleFriend: () => void;
  onOpenFullProfile: () => void;
};

function formatDMStartedAt(value?: string): string {
  if (!value) {
    return "Bilinmiyor";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Bilinmiyor";
  }
  return date.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

export function FriendProfileSidebar({
  conversation,
  presence,
  mutualServerCount,
  mutualFriendCount,
  isFriend,
  note,
  quickActions,
  ignored,
  onToggleFriend,
  onOpenFullProfile
}: FriendProfileSidebarProps) {
  const avatarSrc = resolveAvatarURL(conversation.otherAvatarPath);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (menuRootRef.current && !menuRootRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, []);

  return (
    <aside className="relative flex h-full min-h-0 w-full flex-col border-l border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_82%,black_18%)]">
      <div className="shrink-0 border-b border-[var(--catwa-border)] px-3 py-3">
        <div className="flex items-center justify-end gap-2" ref={menuRootRef}>
          <button
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              isFriend
                ? "border-amber-500/45 bg-amber-500/12 text-amber-100 hover:bg-amber-500/20"
                : "border-cyan-500/45 bg-cyan-500/12 text-cyan-100 hover:bg-cyan-500/20"
            }`}
            onClick={onToggleFriend}
            title={isFriend ? "Arkadaşı çıkar" : "Arkadaş ekle"}
            type="button"
          >
            {isFriend ? <UserMinus className="h-3.5 w-3.5" /> : <UserRoundPlus className="h-3.5 w-3.5" />}
            {isFriend ? "Çıkar" : "Ekle"}
          </button>

          <button
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--catwa-border)] bg-slate-900/45 text-[var(--catwa-text-main)] transition hover:bg-slate-900/70"
            onClick={() => setMenuOpen((current) => !current)}
            title="Daha fazla"
            type="button"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen ? (
            <div className="absolute right-0 top-[calc(100%+8px)] z-20 w-[min(90vw,260px)] rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-1.5 shadow-2xl backdrop-blur sm:min-w-[220px] sm:w-auto">
              {quickActions.map((action) => (
                <div key={action.id}>
                  {action.separatorBefore ? <div className="my-1 h-px bg-slate-700/60" /> : null}
                  <button
                    className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-sm transition ${
                      action.danger
                        ? "text-rose-200 hover:bg-rose-500/22"
                        : "text-[var(--catwa-text-main)] hover:bg-slate-700/72"
                    }`}
                    onClick={() => {
                      setMenuOpen(false);
                      action.onSelect();
                    }}
                    type="button"
                  >
                    {action.label}
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <section className="overflow-hidden rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_90%,black_10%)]">
          <div className="h-20 bg-gradient-to-r from-indigo-500/35 via-violet-500/20 to-cyan-500/25" />

          <div className="-mt-9 px-4 pb-4">
            <div className="relative inline-flex">
              <div
                className="flex h-20 w-20 items-center justify-center rounded-2xl border-4 border-[color:color-mix(in_srgb,var(--catwa-panel)_96%,black_4%)] text-lg font-semibold text-slate-100"
                style={{ backgroundColor: avatarTone(conversation.otherUserId) }}
              >
                {avatarSrc ? (
                  <img alt={`${conversation.otherDisplayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
                ) : (
                  displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                )}
              </div>
              <span
                className={`absolute -bottom-1 -right-1 h-4 w-4 rounded-full border-2 border-[color:color-mix(in_srgb,var(--catwa-panel)_96%,black_4%)] ${presenceDotClass(
                  presence
                )}`}
              />
            </div>

            <div className="mt-3">
              <p className="truncate text-2xl font-semibold leading-tight text-[var(--catwa-text-main)] sm:text-3xl">{conversation.otherDisplayName}</p>
              <p className="mt-0.5 truncate text-sm text-[var(--catwa-text-muted)]">@{conversation.otherUsername}</p>
              <p className="mt-1 text-xs text-[var(--catwa-text-soft)]">{formatPresence(presence)}</p>
            </div>

            <div className="mt-3 grid gap-2">
              <div className="rounded-lg border border-[var(--catwa-border)] bg-slate-900/35 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">DM başlangıcı</p>
                <p className="mt-1 text-sm text-[var(--catwa-text-main)]">{formatDMStartedAt(conversation.lastMessageAt)}</p>
              </div>

              <button
                className="flex w-full items-center justify-between rounded-lg border border-[var(--catwa-border)] bg-slate-900/35 px-3 py-2.5 text-left transition hover:bg-slate-800/70"
                type="button"
              >
                <span className="text-sm text-[var(--catwa-text-main)]">Ortak Sunucular</span>
                <span className="text-sm font-semibold text-[var(--catwa-text-muted)]">{mutualServerCount}</span>
              </button>

              <button
                className="flex w-full items-center justify-between rounded-lg border border-[var(--catwa-border)] bg-slate-900/35 px-3 py-2.5 text-left transition hover:bg-slate-800/70"
                type="button"
              >
                <span className="text-sm text-[var(--catwa-text-main)]">Ortak Arkadaşlar</span>
                <span className="text-sm font-semibold text-[var(--catwa-text-muted)]">{mutualFriendCount}</span>
              </button>
            </div>

            {note ? (
              <div className="mt-3 rounded-md border border-[var(--catwa-border)] bg-slate-900/40 px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">Not</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--catwa-text-main)]">{note}</p>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isFriend ? (
                <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/14 px-2.5 py-1 text-xs text-emerald-100">
                  Arkadaşsınız
                </span>
              ) : null}
              {ignored ? (
                <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/14 px-2.5 py-1 text-xs text-amber-100">
                  Yok sayılıyor
                </span>
              ) : null}
            </div>
          </div>
        </section>
      </div>

      <div className="shrink-0 border-t border-[var(--catwa-border)] px-4 py-3">
        <button
          className="w-full rounded-lg border border-[var(--catwa-border)] bg-slate-900/30 px-3 py-2 text-sm text-[var(--catwa-text-muted)] transition hover:border-[var(--catwa-accent-ring)] hover:bg-[var(--catwa-accent-soft)] hover:text-[var(--catwa-text-main)]"
          onClick={onOpenFullProfile}
          type="button"
        >
          Profilin Tamamını Görüntüle
        </button>
      </div>
    </aside>
  );
}

export type { ProfileQuickAction };
