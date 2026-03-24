import { BellOff } from "lucide-react";
import { resolveAvatarURL } from "../../lib/avatar";
import { compactPreviewText } from "../../lib/linkUtils";
import type { DMConversation, PresenceState } from "../../types/chat";
import { ContextMenu, type ContextMenuAction } from "./ContextMenu";
import { avatarTone, displayInitials, formatClock, presenceDotClass } from "./ui";

type ConversationItemProps = {
  conversation: DMConversation;
  selected: boolean;
  presence?: PresenceState;
  unreadCount?: number;
  muted?: boolean;
  note?: string;
  actions: ContextMenuAction[];
  onSelect: (conversationId: string) => void;
};

export function ConversationItem({
  conversation,
  selected,
  presence,
  unreadCount = 0,
  muted = false,
  note,
  actions,
  onSelect
}: ConversationItemProps) {
  const initials = displayInitials(conversation.otherDisplayName, conversation.otherUsername);
  const avatarSrc = resolveAvatarURL(conversation.otherAvatarPath);
  const lastMessageTime = conversation.lastMessageAt ? formatClock(conversation.lastMessageAt) : null;
  const previewMessage = conversation.lastMessage ? compactPreviewText(conversation.lastMessage, 84) : "Henüz mesaj yok.";
  const unreadLabel = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <ContextMenu actions={actions}>
      <button
        className={`cw-conversation-item group w-full rounded-xl px-2.5 py-2 text-left transition ${
          selected
            ? "bg-[linear-gradient(135deg,rgba(var(--catwa-accent-rgb),0.3),rgba(var(--catwa-accent-rgb),0.12))] shadow-[inset_0_0_0_1px_rgba(var(--catwa-accent-rgb),0.22)]"
            : "bg-transparent hover:bg-white/[0.035]"
        }`}
        onClick={() => onSelect(conversation.conversationId)}
        type="button"
      >
        <div className="flex items-start gap-2.5">
          <div
            className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[11px] font-semibold text-slate-100"
            style={{ backgroundColor: avatarTone(conversation.otherUserId || conversation.otherUsername) }}
          >
            {avatarSrc ? (
              <img alt={`${conversation.otherDisplayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
            ) : (
              initials
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-slate-900 ${presenceDotClass(presence)}`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <p className={`catwa-personal-info truncate text-sm ${selected ? "font-semibold text-slate-100" : "font-medium text-slate-200"}`}>
                {conversation.otherDisplayName}
              </p>
              <div className="flex shrink-0 items-center gap-1">
                {muted ? <BellOff className="h-3.5 w-3.5 text-slate-500" /> : null}
                {lastMessageTime ? <span className="text-[11px] text-[var(--catwa-text-muted)]">{lastMessageTime}</span> : null}
                {unreadCount > 0 ? (
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--catwa-accent)] px-1.5 py-0.5 text-[10px] font-semibold text-slate-950">
                    {unreadLabel}
                  </span>
                ) : null}
              </div>
            </div>

            <p className="catwa-personal-info mt-0.5 truncate text-xs text-[var(--catwa-text-muted)]">@{conversation.otherUsername}</p>
            <p className="mt-0.5 truncate text-xs text-[var(--catwa-text-soft)]">{previewMessage}</p>
            {note ? <p className="mt-1 truncate text-[11px] text-slate-500">Not: {note}</p> : null}
          </div>
        </div>
      </button>
    </ContextMenu>
  );
}

