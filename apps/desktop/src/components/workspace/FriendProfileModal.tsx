import * as Dialog from "@radix-ui/react-dialog";
import { MessageSquare, ShieldAlert, UserCheck2, X } from "lucide-react";
import { resolveAvatarURL } from "../../lib/avatar";
import type { DMConversation, PresenceState } from "../../types/chat";
import { avatarTone, displayInitials, formatPresence, presenceDotClass } from "./ui";

type FriendProfileModalProps = {
  open: boolean;
  onClose: () => void;
  conversation: DMConversation | null;
  presence?: PresenceState;
  mutualServerCount: number;
  mutualFriendCount: number;
  isFriend: boolean;
  note?: string;
  ignored: boolean;
  onOpenSearch: () => void;
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

export function FriendProfileModal({
  open,
  onClose,
  conversation,
  presence,
  mutualServerCount,
  mutualFriendCount,
  isFriend,
  note,
  ignored,
  onOpenSearch
}: FriendProfileModalProps) {
  const avatarSrc = resolveAvatarURL(conversation?.otherAvatarPath);
  const fallbackInitials = conversation ? displayInitials(conversation.otherDisplayName, conversation.otherUsername) : "?";
  const bannerHueBase = conversation ? avatarTone(conversation.otherUserId) : "#334155";

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
        <Dialog.Overlay className="fixed inset-0 z-[95] bg-slate-950/80 backdrop-blur-md" />
        <Dialog.Content className="fixed inset-3 z-[96] overflow-hidden rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_88%,black_12%)] shadow-[0_28px_90px_rgba(2,6,23,0.65)] md:inset-auto md:left-1/2 md:top-1/2 md:h-[min(88vh,760px)] md:w-[min(96vw,1040px)] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl">
          <div className="relative flex h-full flex-col md:flex-row">
            <Dialog.Close asChild>
              <button
                className="absolute right-2 top-2 z-10 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/12 bg-slate-900/70 text-slate-100 transition hover:border-white/25 hover:bg-slate-800/80 sm:right-4 sm:top-4"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>

            <section className="relative min-h-[260px] w-full border-b border-[var(--catwa-border)] sm:min-h-[300px] md:min-h-[320px] md:w-[46%] md:border-b-0 md:border-r">
              <div
                className="h-44 w-full"
                style={{
                  background: `radial-gradient(140% 120% at 18% 0%, ${bannerHueBase}E6 0%, rgba(40,52,95,0.72) 48%, rgba(8,13,25,0.94) 100%)`
                }}
              />
              <div className="px-4 pb-4 sm:px-6 sm:pb-6">
                <div className="-mt-12 inline-flex rounded-3xl border-4 border-[color:color-mix(in_srgb,var(--catwa-panel)_96%,black_4%)] shadow-lg shadow-black/40">
                  <div
                    className="flex h-24 w-24 items-center justify-center rounded-[inherit] text-2xl font-semibold text-slate-100"
                    style={{ backgroundColor: conversation ? avatarTone(conversation.otherUserId) : "#475569" }}
                  >
                    {avatarSrc ? (
                      <img alt={conversation ? `${conversation.otherDisplayName} avatarı` : "Profil avatarı"} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
                    ) : (
                      fallbackInitials
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <Dialog.Title className="truncate text-2xl font-semibold leading-tight text-slate-100 sm:text-3xl">
                    {conversation?.otherDisplayName ?? "Profil"}
                  </Dialog.Title>
                  {conversation ? <p className="mt-1 truncate text-sm text-slate-300">@{conversation.otherUsername}</p> : null}
                  <p className="mt-2 inline-flex items-center gap-2 text-sm text-slate-300">
                    <span className={`inline-flex h-2.5 w-2.5 rounded-full ${presenceDotClass(presence)}`} />
                    {formatPresence(presence)}
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/35 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Ortak Sunucu</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{mutualServerCount}</p>
                  </div>
                  <div className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/35 px-3 py-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Ortak Arkadaş</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{mutualFriendCount}</p>
                  </div>
                </div>

                <div className="mt-5 grid gap-2">
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--catwa-accent-ring)] bg-[var(--catwa-accent-soft)] px-4 py-2.5 text-sm font-medium text-slate-100 transition hover:bg-[var(--catwa-accent-strong)]"
                    onClick={onClose}
                    type="button"
                  >
                    <MessageSquare className="h-4 w-4" />
                    Mesaj Gönder
                  </button>
                  <button
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--catwa-border)] bg-slate-900/30 px-4 py-2.5 text-sm text-slate-200 transition hover:bg-slate-800/60"
                    onClick={() => {
                      onClose();
                      onOpenSearch();
                    }}
                    type="button"
                  >
                    Mesajlarda Ara
                  </button>
                </div>
              </div>
            </section>

            <section className="flex min-h-0 flex-1 flex-col bg-[linear-gradient(145deg,rgba(10,16,32,0.95),rgba(7,12,24,0.95))] px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-6">
              <Dialog.Description className="text-sm text-slate-400">Profil özeti ve sohbet bağlamı</Dialog.Description>

              <div className="mt-5 grid min-h-0 flex-1 gap-3 overflow-y-auto">
                <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Durum</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    {isFriend ? (
                      <span className="inline-flex items-center gap-2 rounded-md border border-emerald-500/45 bg-emerald-500/14 px-2.5 py-1 text-xs text-emerald-100">
                        <UserCheck2 className="h-3.5 w-3.5" />
                        Arkadaşsınız
                      </span>
                    ) : null}
                    {ignored ? (
                      <span className="inline-flex items-center gap-2 rounded-md border border-amber-500/45 bg-amber-500/14 px-2.5 py-1 text-xs text-amber-100">
                        <ShieldAlert className="h-3.5 w-3.5" />
                        Yok sayılıyor
                      </span>
                    ) : null}
                    {!isFriend && !ignored ? (
                      <span className="inline-flex items-center gap-2 rounded-md border border-slate-600/60 bg-slate-900/35 px-2.5 py-1 text-xs text-slate-300">
                        Normal iletişim
                      </span>
                    ) : null}
                  </div>
                </article>

                <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/30 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Sohbet Bilgisi</p>
                  <div className="mt-3 grid gap-2 text-sm text-slate-200">
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/35 px-3 py-2">
                      <span className="text-slate-400">DM başlangıcı</span>
                      <span>{formatDMStartedAt(conversation?.lastMessageAt)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-800/80 bg-slate-950/35 px-3 py-2">
                      <span className="text-slate-400">Kullanıcı ID</span>
                      <span className="max-w-[140px] truncate font-mono text-xs text-slate-300 sm:max-w-[220px]">{conversation?.otherUserId ?? "-"}</span>
                    </div>
                  </div>
                </article>

                {note ? (
                  <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/30 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Not</p>
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-slate-200">{note}</p>
                  </article>
                ) : null}
              </div>
            </section>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
