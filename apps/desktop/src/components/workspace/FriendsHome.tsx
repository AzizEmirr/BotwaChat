import { useState } from "react";
import { Ban, Check, Clock3, MessageCircle, UserMinus, X } from "lucide-react";
import { compactPreviewText } from "../../lib/linkUtils";
import type { DMConversation, FriendItem, FriendRequestItem, PresenceState } from "../../types/chat";
import { formatClock, formatPresence, presenceDotClass } from "./ui";

export type FriendsHomeTab = "online" | "all" | "pending" | "add-friend";

type FriendsHomeProps = {
  conversations: DMConversation[];
  friends: FriendItem[];
  incomingRequests: FriendRequestItem[];
  outgoingRequests: FriendRequestItem[];
  loadingFriends: boolean;
  loadingRequests: boolean;
  sendingFriendRequest: boolean;
  presenceByUser: Record<string, PresenceState>;
  activeTab: FriendsHomeTab;
  onTabChange: (tab: FriendsHomeTab) => void;
  onSelectConversation: (conversationId: string) => void;
  onStartDM: (userId: string) => void;
  onAcceptRequest: (requestId: string) => void;
  onRejectRequest: (requestId: string) => void;
  onCancelRequest: (requestId: string) => void;
  onRemoveFriend: (friendUserId: string) => void;
  onBlockUser: (userId: string) => void;
  onSendFriendRequestByUsername: (username: string) => Promise<boolean>;
};

export function FriendsHome({
  conversations,
  friends,
  incomingRequests,
  outgoingRequests,
  loadingFriends,
  loadingRequests,
  sendingFriendRequest,
  presenceByUser,
  activeTab,
  onTabChange,
  onSelectConversation,
  onStartDM,
  onAcceptRequest,
  onRejectRequest,
  onCancelRequest,
  onRemoveFriend,
  onBlockUser,
  onSendFriendRequestByUsername
}: FriendsHomeProps) {
  const [friendRequestUsername, setFriendRequestUsername] = useState("");

  const handleFriendRequestSubmit = async () => {
    const normalizedUsername = friendRequestUsername.trim();
    if (!normalizedUsername) {
      return;
    }
    const sent = await onSendFriendRequestByUsername(normalizedUsername);
    if (sent) {
      setFriendRequestUsername("");
    }
  };

  const onlineFriends = friends.filter((item) => {
    const status = presenceByUser[item.userId]?.status ?? item.status;
    return status === "online";
  });

  const visibleFriends = activeTab === "online" ? onlineFriends : friends;
  const visibleConversations =
    activeTab === "online"
      ? conversations.filter((item) => {
          const status = presenceByUser[item.otherUserId]?.status;
          return status === "online";
        })
      : conversations;

  const showPendingSections = activeTab === "pending";
  const showFriendsSections = activeTab === "all" || activeTab === "online";

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-6 sm:py-5">
      {activeTab === "add-friend" ? (
        <section className="mt-4 border-t border-[var(--catwa-border-soft)] p-4">
          <h4 className="text-sm font-semibold text-slate-100">Arkadaş Ekle</h4>
          <p className="mt-2 text-sm text-slate-400">
            Yalnızca tam kullanıcı adını yazarak arkadaşlık isteği gönderebilirsin.
          </p>
          <form
            className="mt-4 flex w-full max-w-3xl flex-wrap items-center gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleFriendRequestSubmit();
            }}
          >
            <input
              className="h-11 min-w-0 flex-1 border border-[var(--catwa-border-soft)] bg-[var(--catwa-surface)] px-3 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-[var(--catwa-primary)]"
              onChange={(event) => setFriendRequestUsername(event.target.value)}
              placeholder="Tam kullanıcı adını yaz (örnek: kyu)"
              value={friendRequestUsername}
            />
            <button
              className="h-11 w-full border border-[var(--catwa-primary)] px-4 text-sm font-medium text-[var(--catwa-primary)] transition disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
              disabled={sendingFriendRequest || friendRequestUsername.trim().length < 2}
              type="submit"
            >
              {sendingFriendRequest ? "Gönderiliyor..." : "Arkadaşlık İsteği Gönder"}
            </button>
          </form>
          <p className="mt-2 text-xs text-slate-500">
            Kısmi arama desteklenmez. Kullanıcı adını eksiksiz yazman gerekir.
          </p>
        </section>
      ) : null}

      {showPendingSections ? (
        <>
          <section className="mt-4 border-t border-[var(--catwa-border-soft)] p-3">
            <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Gelen Arkadaşlık İstekleri</h4>
            {loadingRequests && <p className="px-1 py-4 text-xs text-slate-500">İstekler yükleniyor...</p>}
            {!loadingRequests && incomingRequests.length === 0 && <p className="px-1 py-4 text-xs text-slate-500">Gelen istek bulunmuyor.</p>}

            <div className="mt-2 space-y-1">
              {incomingRequests.map((item) => (
                <div className="flex items-center justify-between gap-2 border-b border-[var(--catwa-border-soft)] px-3 py-2" key={item.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-100">{item.displayName}</p>
                    <p className="truncate text-xs text-slate-500">
                      @{item.username} • {formatClock(item.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center text-emerald-200 transition hover:bg-emerald-500/20"
                      onClick={() => onAcceptRequest(item.id)}
                      title="Kabul et"
                      type="button"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center text-rose-200 transition hover:bg-rose-500/20"
                      onClick={() => onRejectRequest(item.id)}
                      title="Reddet"
                      type="button"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-4 border-t border-[var(--catwa-border-soft)] p-3">
            <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">Giden Arkadaşlık İstekleri</h4>
            {loadingRequests && <p className="px-1 py-4 text-xs text-slate-500">İstekler yükleniyor...</p>}
            {!loadingRequests && outgoingRequests.length === 0 && <p className="px-1 py-4 text-xs text-slate-500">Giden istek bulunmuyor.</p>}

            <div className="mt-2 space-y-1">
              {outgoingRequests.map((item) => (
                <div className="flex items-center justify-between gap-2 border-b border-[var(--catwa-border-soft)] px-3 py-2" key={item.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-slate-100">{item.displayName}</p>
                    <p className="truncate text-xs text-slate-500">@{item.username} • beklemede</p>
                  </div>
                  <button
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-amber-200 transition hover:bg-amber-500/20"
                    onClick={() => onCancelRequest(item.id)}
                    type="button"
                  >
                    <Clock3 className="h-3.5 w-3.5" />
                    İptal
                  </button>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {showFriendsSections ? (
        <>
          <section className="mt-4 border-t border-[var(--catwa-border-soft)] p-3">
            <h4 className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {activeTab === "online" ? "Çevrimiçi Arkadaşlar" : "Arkadaş Listesi"}
            </h4>
            {loadingFriends && <p className="px-1 py-4 text-xs text-slate-500">Arkadaşlar yükleniyor...</p>}
            {!loadingFriends && visibleFriends.length === 0 && <p className="px-1 py-4 text-xs text-slate-500">Gösterilecek arkadaş yok.</p>}

            <div className="mt-2 space-y-1">
              {visibleFriends.map((item) => (
                <div className="flex items-center justify-between gap-2 border-b border-[var(--catwa-border-soft)] px-3 py-2" key={item.userId}>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`inline-block h-2.5 w-2.5 rounded-full ${presenceDotClass(presenceByUser[item.userId] ?? { status: item.status })}`} />
                      <p className="truncate text-sm text-slate-100">{item.displayName}</p>
                    </div>
                    <p className="truncate text-xs text-slate-500">
                      @{item.username} • {formatPresence(presenceByUser[item.userId] ?? { status: item.status, lastSeen: item.lastSeenAt })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center text-cyan-200 transition hover:bg-cyan-500/20"
                      onClick={() => onStartDM(item.userId)}
                      title="DM başlat"
                      type="button"
                    >
                      <MessageCircle className="h-4 w-4" />
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center text-amber-200 transition hover:bg-amber-500/20"
                      onClick={() => onBlockUser(item.userId)}
                      title="Kullanıcıyı engelle"
                      type="button"
                    >
                      <Ban className="h-4 w-4" />
                    </button>
                    <button
                      className="inline-flex h-8 w-8 items-center justify-center text-rose-200 transition hover:bg-rose-500/20"
                      onClick={() => onRemoveFriend(item.userId)}
                      title="Arkadaşı kaldır"
                      type="button"
                    >
                      <UserMinus className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
