import * as Dialog from "@radix-ui/react-dialog";
import { Bell, Inbox, UserPlus, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { FriendRequestItem, ServerInviteItem } from "../../types/chat";
import { formatClock } from "./ui";

export type InboxUnreadItem = {
  conversationId: string;
  displayName: string;
  username: string;
  lastMessage?: string;
  lastMessageAt?: string;
  unreadCount: number;
};

export type InboxNotificationItem = {
  id: string;
  title: string;
  description: string;
  createdAt?: string;
};

type InboxModalProps = {
  open: boolean;
  onClose: () => void;
  anchorRect?: DOMRect | null;
  unreadItems: InboxUnreadItem[];
  notifications: InboxNotificationItem[];
  incomingRequests: FriendRequestItem[];
  incomingServerInvites: ServerInviteItem[];
  onOpenConversation: (conversationId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onAcceptServerInvite: (inviteId: string) => void;
  onRejectServerInvite: (inviteId: string) => void;
};

type InboxTab = "for-you" | "unread" | "requests";

export function InboxModal({
  open,
  onClose,
  anchorRect,
  unreadItems,
  notifications,
  incomingRequests,
  incomingServerInvites,
  onOpenConversation,
  onAcceptRequest,
  onRejectRequest,
  onAcceptServerInvite,
  onRejectServerInvite
}: InboxModalProps) {
  const [tab, setTab] = useState<InboxTab>("for-you");

  const forYouItems = useMemo(() => {
    const items: Array<{
      id: string;
      title: string;
      description: string;
      createdAt?: string;
      type: "notification" | "unread" | "request";
    }> = [];

    for (const notification of notifications.slice(0, 6)) {
      items.push({
        id: `n-${notification.id}`,
        title: notification.title,
        description: notification.description,
        createdAt: notification.createdAt,
        type: "notification"
      });
    }

    for (const unread of unreadItems.slice(0, 6)) {
      items.push({
        id: `u-${unread.conversationId}`,
        title: `${unread.displayName} (${unread.unreadCount} okunmamış)`,
        description: unread.lastMessage ?? "Yeni mesajlar var.",
        createdAt: unread.lastMessageAt,
        type: "unread"
      });
    }

    for (const request of incomingRequests.slice(0, 6)) {
      items.push({
        id: `r-${request.id}`,
        title: `${request.displayName} arkadaşlık isteği gönderdi`,
        description: `@${request.username}`,
        createdAt: request.createdAt,
        type: "request"
      });
    }

    for (const invite of incomingServerInvites.slice(0, 6)) {
      items.push({
        id: `s-${invite.id}`,
        title: `${invite.serverName} sunucusu daveti`,
        description: `${invite.invitedByDisplayName} davet etti`,
        createdAt: invite.createdAt,
        type: "request"
      });
    }

    return items.sort((a, b) => {
      const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return bTime - aTime;
    });
  }, [incomingRequests, incomingServerInvites, notifications, unreadItems]);

  const requestItems = useMemo(
    () =>
      [
        ...incomingRequests.map((request) => ({
          id: request.id,
          createdAt: request.createdAt,
          type: "friend" as const,
          request
        })),
        ...incomingServerInvites.map((invite) => ({
          id: invite.id,
          createdAt: invite.createdAt,
          type: "server-invite" as const,
          invite
        }))
      ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [incomingRequests, incomingServerInvites]
  );

  const panelPosition = useMemo(() => {
    const fallback = { top: 48, right: 12 };
    if (!anchorRect) {
      return fallback;
    }

    const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 1440;
    return {
      top: Math.max(44, Math.round(anchorRect.bottom + 8)),
      right: Math.max(8, Math.round(viewportWidth - anchorRect.right))
    };
  }, [anchorRect]);

  const panelMaxHeight = useMemo(() => {
    const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 900;
    const available = viewportHeight - panelPosition.top - 12;
    return Math.max(300, Math.min(620, available));
  }, [panelPosition.top]);

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
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-transparent" />
        <Dialog.Content
          className="fixed z-[91] w-[min(92vw,500px)] overflow-hidden rounded-2xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_95%,black_5%)] shadow-[0_22px_70px_-30px_rgba(2,6,23,0.92)]"
          style={{
            right: `${panelPosition.right}px`,
            top: `${panelPosition.top}px`,
            height: `${panelMaxHeight}px`
          }}
        >
          <div className="flex h-full min-h-0 flex-col">
            <header className="flex items-center justify-between gap-2 border-b border-[var(--catwa-border)] px-4 py-3">
              <Dialog.Title className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--catwa-text-main)]">
                <Inbox className="h-4 w-4" />
                Gelen Kutusu
              </Dialog.Title>
              <Dialog.Close asChild>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--catwa-border)] bg-slate-900/65 text-slate-300 transition hover:text-slate-100"
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </Dialog.Close>
            </header>

            <div className="flex items-center gap-2 border-b border-[var(--catwa-border)] px-3 py-2">
              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  tab === "for-you" ? "bg-slate-700/95 text-slate-100" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                }`}
                onClick={() => setTab("for-you")}
                type="button"
              >
                Senin İçin
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  tab === "unread" ? "bg-slate-700/95 text-slate-100" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                }`}
                onClick={() => setTab("unread")}
                type="button"
              >
                Okunmamışlar
              </button>
              <button
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  tab === "requests" ? "bg-slate-700/95 text-slate-100" : "text-slate-400 hover:bg-slate-800/70 hover:text-slate-200"
                }`}
                onClick={() => setTab("requests")}
                type="button"
              >
                İstekler
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
              {tab === "for-you" ? (
                <div className="space-y-2">
                  {forYouItems.length === 0 ? <Empty label="Şu an gösterilecek içerik yok." /> : null}
                  {forYouItems.map((item) => (
                    <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 px-3 py-2.5" key={item.id}>
                      <p className="text-sm font-medium text-slate-100">{item.title}</p>
                      <p className="mt-0.5 text-xs text-slate-400">{item.description}</p>
                      {item.createdAt ? <p className="mt-1 text-[11px] text-slate-500">{formatClock(item.createdAt)}</p> : null}
                    </article>
                  ))}
                </div>
              ) : null}

              {tab === "unread" ? (
                <div className="space-y-2">
                  {unreadItems.length === 0 ? <Empty label="Okunmamış mesaj yok." /> : null}
                  {unreadItems.map((item) => (
                    <button
                      className="w-full rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 px-3 py-2.5 text-left transition hover:border-[var(--catwa-accent-strong)] hover:bg-slate-800/60"
                      key={item.conversationId}
                      onClick={() => {
                        onOpenConversation(item.conversationId);
                        onClose();
                      }}
                      type="button"
                    >
                      <p className="text-sm font-medium text-slate-100">{item.displayName}</p>
                      <p className="mt-0.5 text-xs text-slate-400">@{item.username}</p>
                      <p className="mt-1 truncate text-xs text-slate-300">{item.lastMessage ?? "Yeni mesajlar var."}</p>
                      <div className="mt-1 flex items-center justify-between">
                        <span className="inline-flex items-center rounded-full bg-[var(--catwa-accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-cyan-100">
                          {item.unreadCount} okunmamış
                        </span>
                        {item.lastMessageAt ? <span className="text-[11px] text-slate-500">{formatClock(item.lastMessageAt)}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              ) : null}

              {tab === "requests" ? (
                <div className="space-y-2">
                  {requestItems.length === 0 ? <Empty label="Gelen istek veya davet yok." /> : null}
                  {requestItems.map((item) => {
                    if (item.type === "friend") {
                      const request = item.request;
                      return (
                        <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 px-3 py-2.5" key={`friend-${request.id}`}>
                          <p className="text-sm font-medium text-slate-100">{request.displayName}</p>
                          <p className="mt-0.5 text-xs text-slate-400">@{request.username}</p>
                          <div className="mt-2 flex items-center gap-2">
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-500/45 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/25"
                              onClick={() => onAcceptRequest(request.id)}
                              type="button"
                            >
                              <UserPlus className="h-3.5 w-3.5" />
                              Kabul Et
                            </button>
                            <button
                              className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/15 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-500/25"
                              onClick={() => onRejectRequest(request.id)}
                              type="button"
                            >
                              <X className="h-3.5 w-3.5" />
                              Reddet
                            </button>
                            <span className="ml-auto text-[11px] text-slate-500">{formatClock(request.createdAt)}</span>
                          </div>
                        </article>
                      );
                    }

                    const invite = item.invite;
                    return (
                      <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/45 px-3 py-2.5" key={`invite-${invite.id}`}>
                        <p className="text-sm font-medium text-slate-100">{invite.serverName}</p>
                        <p className="mt-0.5 text-xs text-slate-400">{invite.invitedByDisplayName} seni sunucuya davet etti.</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-500/45 bg-emerald-500/15 px-2 py-1 text-xs text-emerald-100 transition hover:bg-emerald-500/25"
                            onClick={() => onAcceptServerInvite(invite.id)}
                            type="button"
                          >
                            <UserPlus className="h-3.5 w-3.5" />
                            Katıl
                          </button>
                          <button
                            className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/15 px-2 py-1 text-xs text-rose-100 transition hover:bg-rose-500/25"
                            onClick={() => onRejectServerInvite(invite.id)}
                            type="button"
                          >
                            <X className="h-3.5 w-3.5" />
                            Reddet
                          </button>
                          <span className="ml-auto text-[11px] text-slate-500">{formatClock(invite.createdAt)}</span>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/40 px-3 py-3 text-center">
      <p className="inline-flex items-center gap-1 text-sm text-slate-400">
        <Bell className="h-4 w-4" />
        {label}
      </p>
    </div>
  );
}
