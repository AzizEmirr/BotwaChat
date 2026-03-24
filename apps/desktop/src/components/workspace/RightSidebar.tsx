import { Activity, BellOff, Users } from "lucide-react";
import { resolveAvatarURL } from "../../lib/avatar";
import { compactPreviewText } from "../../lib/linkUtils";
import type { DMConversation, PresenceState } from "../../types/chat";
import { ContextMenu, type ContextMenuAction } from "./ContextMenu";
import { avatarTone, displayInitials, formatClock, presenceDotClass } from "./ui";

type RightSidebarProps = {
  conversations: DMConversation[];
  presenceByUser: Record<string, PresenceState>;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  buildConversationActions: (conversation: DMConversation) => ContextMenuAction[];
  isConversationMuted: (conversationId: string) => boolean;
  userNotesById: Record<string, string>;
};

export function RightSidebar({
  conversations,
  presenceByUser,
  selectedConversationId,
  onSelectConversation,
  buildConversationActions,
  isConversationMuted,
  userNotesById
}: RightSidebarProps) {
  const onlineCount = conversations.filter((item) => {
    const status = presenceByUser[item.otherUserId]?.status;
    return status === "online" || status === "idle";
  }).length;

  return (
    <aside className="cw-right-sidebar flex h-full min-h-0 w-full flex-col border-l border-[var(--catwa-border-soft)] bg-[var(--catwa-panel)]">
      <header className="shrink-0 border-b border-[var(--catwa-border-soft)] px-4 py-3">
        <h3 className="text-sm font-semibold text-[var(--catwa-text-main)]">Şimdi Aktif</h3>
        <p className="mt-1 text-xs text-[var(--catwa-text-muted)]">Çevrimiçi: {onlineCount}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <section className="p-0.5">
          <div className="mb-2 flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">
            <Users className="h-3.5 w-3.5" />
            Son DM Hareketleri
          </div>

          <div className="space-y-1">
            {conversations.map((conversation) => {
              const presence = presenceByUser[conversation.otherUserId];
              const active = selectedConversationId === conversation.conversationId;
              const time = conversation.lastMessageAt ? formatClock(conversation.lastMessageAt) : "";
              const avatarSrc = resolveAvatarURL(conversation.otherAvatarPath);
              const muted = isConversationMuted(conversation.conversationId);
              const note = userNotesById[conversation.otherUserId];

              return (
                <ContextMenu actions={buildConversationActions(conversation)} key={conversation.conversationId}>
                  <button
                    className={`cw-right-sidebar-item flex w-full items-start gap-2 border-b border-[var(--catwa-border-soft)] px-2.5 py-2 text-left transition ${
                      active
                        ? "bg-[var(--catwa-accent-softest)]"
                        : "hover:bg-[color:color-mix(in_srgb,var(--catwa-panel)_78%,black_22%)]"
                    }`}
                    onClick={() => onSelectConversation(conversation.conversationId)}
                    type="button"
                  >
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-slate-100"
                      style={{ backgroundColor: avatarTone(conversation.otherUserId || conversation.otherUsername) }}
                    >
                      {avatarSrc ? (
                        <img
                          alt={`${conversation.otherDisplayName} avatar`}
                          className="h-full w-full rounded-[inherit] object-cover"
                          src={avatarSrc}
                        />
                      ) : (
                        displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                      )}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-slate-900 ${presenceDotClass(
                          presence
                        )}`}
                      />
                    </div>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-[var(--catwa-text-main)]">{conversation.otherDisplayName}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {muted ? <BellOff className="h-3.5 w-3.5 text-slate-500" /> : null}
                          {time ? <span className="text-[10px] text-[var(--catwa-text-muted)]">{time}</span> : null}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-[var(--catwa-text-soft)]">
                        {compactPreviewText(conversation.lastMessage ?? "Mesaj yok", 72)}
                      </span>
                      {note ? <span className="mt-1 block truncate text-[11px] text-slate-500">Not: {note}</span> : null}
                    </span>
                  </button>
                </ContextMenu>
              );
            })}
          </div>
        </section>

        <section className="mt-3 border-t border-[var(--catwa-border-soft)] pt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">
            <Activity className="h-3.5 w-3.5" />
            Hızlı Bilgi
          </div>
          <p className="mt-2 text-xs text-[var(--catwa-text-soft)]">
            Sağ paneli konuşma detayları ve aktif kullanıcıları izlemek için kullanabilirsin.
          </p>
        </section>
      </div>
    </aside>
  );
}
