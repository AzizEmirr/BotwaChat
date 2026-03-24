import { Hash, Pin, UserRound } from "lucide-react";
import type { ComponentType } from "react";
import type { DMConversation, PresenceState } from "../../types/chat";
import type { FriendsHomeTab } from "./FriendsHome";
import { formatPresence, presenceDotClass } from "./ui";

type ChatHeaderProps = {
  conversation: DMConversation | null;
  selectedServerName?: string | null;
  selectedChannelName?: string | null;
  presence?: PresenceState;
  onToggleRightSidebar: () => void;
  onOpenPinned: () => void;
  rightSidebarOpen: boolean;
  friendsTab: FriendsHomeTab;
  onFriendsTabChange: (tab: FriendsHomeTab) => void;
};

function IconButton({
  title,
  onClick,
  icon: Icon,
  active = false
}: {
  title: string;
  onClick?: () => void;
  icon: ComponentType<{ className?: string }>;
  active?: boolean;
}) {
  return (
    <button
      className={`inline-flex h-8 w-8 items-center justify-center rounded-xl border border-transparent transition ${
        active
          ? "border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] text-[var(--catwa-text-main)]"
          : "text-[var(--catwa-text-muted)] hover:border-[var(--catwa-border-soft)] hover:bg-black/10 hover:text-[var(--catwa-text-main)]"
      }`}
      onClick={onClick}
      title={title}
      type="button"
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

export function ChatHeader({
  conversation,
  selectedServerName,
  selectedChannelName,
  presence,
  onToggleRightSidebar,
  onOpenPinned,
  rightSidebarOpen,
  friendsTab,
  onFriendsTabChange
}: ChatHeaderProps) {
  const isFriendsHome = !conversation && !selectedServerName && !selectedChannelName;

  const friendsTabButtonClass = (tab: FriendsHomeTab): string => {
    const active = friendsTab === tab;
    return active
      ? "rounded-lg border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] px-3 py-1.5 text-sm font-semibold text-slate-100 transition"
      : "rounded-lg border border-transparent px-3 py-1.5 text-sm text-slate-400 transition hover:border-[var(--catwa-border-soft)] hover:bg-black/10 hover:text-slate-200";
  };

  return (
    <header className="cw-chat-header shrink-0 border-b border-[var(--catwa-border-soft)] px-2 py-2.5 sm:px-4">
      <div className="flex items-center justify-between gap-2 sm:gap-3">
        <div className="min-w-0">
          {isFriendsHome ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--catwa-border-soft)] bg-black/10 px-2.5 py-1.5 text-sm font-semibold text-slate-100">
                  Arkadaşlar
                </span>

                <span className="mx-1 hidden h-5 w-px bg-[var(--catwa-border-soft)] lg:inline-block" />

                <div className="hidden items-center gap-1 rounded-xl border border-[var(--catwa-border-soft)] bg-black/10 p-1 md:flex">
                  <button className={friendsTabButtonClass("online")} onClick={() => onFriendsTabChange("online")} type="button">
                    Çevrim içi
                  </button>
                  <button className={friendsTabButtonClass("all")} onClick={() => onFriendsTabChange("all")} type="button">
                    Tümü
                  </button>
                  <button className={friendsTabButtonClass("pending")} onClick={() => onFriendsTabChange("pending")} type="button">
                    Bekleyen
                  </button>
                  <button className={friendsTabButtonClass("add-friend")} onClick={() => onFriendsTabChange("add-friend")} type="button">
                    Arkadaş Ekle
                  </button>
                </div>
              </div>

              <div className="-mx-1 flex items-center gap-1 overflow-x-auto px-1 md:hidden">
                <button className={friendsTabButtonClass("online")} onClick={() => onFriendsTabChange("online")} type="button">
                  Online
                </button>
                <button className={friendsTabButtonClass("all")} onClick={() => onFriendsTabChange("all")} type="button">
                  Tümü
                </button>
                <button className={friendsTabButtonClass("pending")} onClick={() => onFriendsTabChange("pending")} type="button">
                  Bekleyen
                </button>
                <button className={friendsTabButtonClass("add-friend")} onClick={() => onFriendsTabChange("add-friend")} type="button">
                  Ekle
                </button>
              </div>
            </div>
          ) : conversation ? (
            <>
              <div className="flex items-center gap-2">
                <h2 className="truncate text-[15px] font-semibold tracking-tight text-[var(--catwa-text-main)]">{conversation.otherDisplayName}</h2>
                <span className={`inline-block h-2 w-2 rounded-full ${presenceDotClass(presence)}`} />
              </div>
              <p className="truncate text-xs text-[var(--catwa-text-muted)]">
                @{conversation.otherUsername} • {formatPresence(presence)}
              </p>
            </>
          ) : selectedServerName && selectedChannelName ? (
            <>
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4 text-[var(--catwa-text-muted)]" />
                <h2 className="truncate text-[15px] font-semibold tracking-tight text-[var(--catwa-text-main)]">{selectedChannelName}</h2>
              </div>
              <p className="truncate text-xs text-[var(--catwa-text-muted)]">{selectedServerName} sunucusu</p>
            </>
          ) : selectedServerName ? (
            <>
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--catwa-text-main)]">{selectedServerName}</h2>
              <p className="text-xs text-[var(--catwa-text-muted)]">Metin kanalını seçerek sunucuda yazışmaya başla.</p>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold tracking-tight text-[var(--catwa-text-main)]">Arkadaşlar</h2>
              <p className="text-xs text-[var(--catwa-text-muted)]">Soldan bir DM seçerek konuşmaya başla.</p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden sm:block">
            <IconButton icon={Pin} onClick={onOpenPinned} title="Sabitlenenler" />
          </div>
          <IconButton
            active={rightSidebarOpen}
            icon={UserRound}
            onClick={onToggleRightSidebar}
            title={rightSidebarOpen ? "Kullanıcı profilini gizle" : "Kullanıcı profilini göster"}
          />
        </div>
      </div>
    </header>
  );
}
