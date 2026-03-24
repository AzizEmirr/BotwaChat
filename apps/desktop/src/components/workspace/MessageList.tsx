import { useEffect, useMemo, useState } from "react";
import { isSensitiveMessageContent, shouldHideMessageByDMSpamFilter } from "../../lib/chatPreferencesRuntime";
import { useAppPreferences } from "../../lib/useAppPreferences";
import { useConversationScroll } from "../../lib/useConversationScroll";
import { toPublicID } from "../../lib/publicId";
import { useChatStore } from "../../store/chatStore";
import { toastSuccess } from "../../store/toastStore";
import type { Message, MessageReactionState, UserProfile } from "../../types/chat";
import { EmptyState } from "./EmptyState";
import { MessageRow } from "./MessageRow";
import { TypingIndicator } from "./TypingIndicator";

type ResolvedSenderMeta = {
  name: string;
  username: string;
  avatarPath?: string | null;
};

type MessageListProps = {
  activeConversationId: string | null;
  emptyTitle: string;
  emptyDescription: string;
  currentUser: UserProfile | null;
  messages: Message[];
  loadingMessages: boolean;
  typingText: string;
  showTyping?: boolean;
  resolveSenderName?: (message: Message) => string;
  resolveSenderMeta?: (message: Message) => ResolvedSenderMeta;
  onReplyMessage?: (message: Message) => void;
  onForwardMessage?: (message: Message) => void;
  onEditMessage?: (message: Message, content: string) => Promise<void>;
  onDeleteMessage?: (message: Message) => Promise<void>;
  onMarkUnreadMessage?: (message: Message) => void;
  onCopyMessageLink?: (message: Message) => void;
  conversationType?: "dm" | "channel";
  isDMConversationWithFriend?: boolean;
};

type StoredReactions = Record<string, MessageReactionState[]>;
type ReactionsChangedDetail = {
  conversationId: string;
  reactionsByMessage: StoredReactions;
};
type PinsChangedDetail = {
  conversationId: string;
  pinnedMessageIds: string[];
};

const REACTIONS_CHANGED_EVENT_NAME = "catwa:reactions.changed";
const PINS_CHANGED_EVENT_NAME = "catwa:pins.changed";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function parseStoredReactions(raw: unknown): StoredReactions {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }

  const result: StoredReactions = {};
  for (const [messageID, value] of Object.entries(raw)) {
    if (!Array.isArray(value)) {
      continue;
    }

    const normalized = value
      .map((item) => {
        if (typeof item === "string") {
          const emoji = item.trim();
          if (!emoji) {
            return null;
          }
          return { emoji, count: 1, reacted: true } satisfies MessageReactionState;
        }
        if (!item || typeof item !== "object") {
          return null;
        }
        const entry = item as Partial<MessageReactionState>;
        if (
          typeof entry.emoji !== "string" ||
          !entry.emoji.trim() ||
          typeof entry.count !== "number" ||
          !Number.isFinite(entry.count) ||
          entry.count <= 0 ||
          typeof entry.reacted !== "boolean"
        ) {
          return null;
        }
        return {
          emoji: entry.emoji.trim(),
          count: Math.max(1, Math.floor(entry.count)),
          reacted: entry.reacted
        } satisfies MessageReactionState;
      })
      .filter((item): item is MessageReactionState => !!item);

    if (normalized.length > 0) {
      result[messageID] = normalized;
    }
  }

  return result;
}

function readStoredReactions(conversationID: string): StoredReactions {
  const raw = readJSON<unknown>(`catwa.reactions.${conversationID}`, {});
  return parseStoredReactions(raw);
}

function readStoredPins(conversationID: string): string[] {
  const raw = readJSON<unknown>(`catwa.pins.${conversationID}`, []);
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

export function MessageList({
  activeConversationId,
  emptyTitle,
  emptyDescription,
  currentUser,
  messages,
  loadingMessages,
  typingText,
  showTyping = false,
  resolveSenderName,
  resolveSenderMeta,
  onReplyMessage,
  onForwardMessage,
  onEditMessage,
  onDeleteMessage,
  onMarkUnreadMessage,
  onCopyMessageLink,
  conversationType,
  isDMConversationWithFriend = false
}: MessageListProps) {
  const preferences = useAppPreferences();
  const loadConversationMessageState = useChatStore((state) => state.loadConversationMessageState);
  const toggleMessagePin = useChatStore((state) => state.toggleMessagePin);
  const toggleMessageReaction = useChatStore((state) => state.toggleMessageReaction);
  const [reactionsByMessage, setReactionsByMessage] = useState<StoredReactions>({});
  const [pinnedMessageIDs, setPinnedMessageIDs] = useState<string[]>([]);
  const activeConversationType = conversationType ?? messages[0]?.conversationType ?? "dm";
  const lastMessageID = messages[messages.length - 1]?.id ?? null;
  const { containerRef, contentRef, handleScroll, jumpToLatest, showJumpToLatest, pendingMessageCount } = useConversationScroll({
    conversationId: activeConversationId,
    messageCount: messages.length,
    lastMessageId: lastMessageID,
    tailSignal: showTyping ? typingText : undefined
  });

  useEffect(() => {
    if (!activeConversationId) {
      setReactionsByMessage({});
      setPinnedMessageIDs([]);
      return;
    }
    setReactionsByMessage(readStoredReactions(activeConversationId));
    setPinnedMessageIDs(readStoredPins(activeConversationId));
    void loadConversationMessageState(activeConversationType, activeConversationId);
  }, [activeConversationId, activeConversationType, loadConversationMessageState]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const storageKey = `catwa.reactions.${activeConversationId}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setReactionsByMessage(readStoredReactions(activeConversationId));
    };
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<ReactionsChangedDetail>).detail;
      if (!detail || detail.conversationId !== activeConversationId) {
        return;
      }
      setReactionsByMessage(parseStoredReactions(detail.reactionsByMessage));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(REACTIONS_CHANGED_EVENT_NAME, handleRealtime as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(REACTIONS_CHANGED_EVENT_NAME, handleRealtime as EventListener);
    };
  }, [activeConversationId]);

  useEffect(() => {
    if (!activeConversationId) {
      return;
    }

    const storageKey = `catwa.pins.${activeConversationId}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setPinnedMessageIDs(readStoredPins(activeConversationId));
    };
    const handleRealtime = (event: Event) => {
      const detail = (event as CustomEvent<PinsChangedDetail>).detail;
      if (!detail || detail.conversationId !== activeConversationId) {
        return;
      }
      setPinnedMessageIDs(detail.pinnedMessageIds.filter((item) => typeof item === "string" && item.trim().length > 0));
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(PINS_CHANGED_EVENT_NAME, handleRealtime as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PINS_CHANGED_EVENT_NAME, handleRealtime as EventListener);
    };
  }, [activeConversationId]);

  const rows = useMemo(
    () =>
      messages.map((message, index) => {
        const previous = messages[index - 1];
        const grouped =
          !!previous &&
          previous.senderId === message.senderId &&
          new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() <= 5 * 60 * 1000;

        return { message, grouped };
      }),
    [messages]
  );

  const toggleReaction = (messageID: string, emoji: string) => {
    void toggleMessageReaction(messageID, emoji);
  };

  const togglePin = (messageID: string) => {
    void toggleMessagePin(messageID);
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div className="h-full overflow-y-auto px-4 pb-5 pt-4" onScroll={handleScroll} ref={containerRef}>
        {!activeConversationId && <EmptyState description={emptyDescription} title={emptyTitle} />}

        {activeConversationId && loadingMessages && messages.length === 0 && <p className="px-3 py-5 text-sm text-slate-500">Mesajlar yükleniyor...</p>}

        {activeConversationId && !loadingMessages && messages.length === 0 && (
          <EmptyState description="İlk mesajı göndererek bu sohbeti başlat." title="Henüz mesaj yok" />
        )}

        {activeConversationId && messages.length > 0 && (
          <div className="space-y-0" ref={contentRef}>
            {rows.map(({ message, grouped }) => {
              const senderMeta = resolveSenderMeta?.(message);
              const messageConversationType = conversationType ?? message.conversationType;
              const hideByDMSpamFilter = shouldHideMessageByDMSpamFilter({
                filter: preferences.chat.dmSpamFilter,
                conversationType: messageConversationType,
                isConversationWithFriend: isDMConversationWithFriend,
                senderId: message.senderId,
                currentUserId: currentUser?.id
              });
              const allowSensitiveContent =
                messageConversationType === "dm" ? preferences.chat.allowSensitiveDM : preferences.chat.allowSensitiveServer;
              const hideSensitiveContent = !allowSensitiveContent && isSensitiveMessageContent(message.content);

              return (
                <MessageRow
                  grouped={grouped}
                  hideByDmSpamFilter={hideByDMSpamFilter}
                  hideSensitiveContent={hideSensitiveContent}
                  key={message.id}
                  message={message}
                  mine={message.senderId === currentUser?.id}
                  onCopyLink={(item) => {
                    if (onCopyMessageLink) {
                      onCopyMessageLink(item);
                      toastSuccess("Mesaj bağlantısı kopyalandı");
                      return;
                    }
                    const fallbackLink = `catwa://conversation/${item.conversationType}/${toPublicID(item.conversationId)}/message/${toPublicID(item.id)}`;
                    void navigator.clipboard.writeText(fallbackLink).catch(() => {
                      // noop
                    });
                    toastSuccess("Mesaj bağlantısı kopyalandı");
                  }}
                  onDelete={async (item) => {
                    if (!onDeleteMessage) {
                      return;
                    }
                    await onDeleteMessage(item);
                  }}
                  onEdit={async (item, content) => {
                    if (!onEditMessage) {
                      return;
                    }
                    await onEditMessage(item, content);
                  }}
                  onForward={(item) => {
                    onForwardMessage?.(item);
                  }}
                  onMarkUnread={(item) => {
                    onMarkUnreadMessage?.(item);
                  }}
                  onReply={(item) => {
                    onReplyMessage?.(item);
                  }}
                  onTogglePin={(item) => {
                    togglePin(item.id);
                  }}
                  onToggleReaction={toggleReaction}
                  pinned={pinnedMessageIDs.includes(message.id)}
                  reactions={reactionsByMessage[message.id] ?? []}
                  senderAvatarPath={senderMeta?.avatarPath ?? message.senderAvatarPath}
                  senderName={
                    senderMeta?.name ??
                    (resolveSenderName
                      ? resolveSenderName(message)
                      : message.senderId === currentUser?.id
                        ? "Sen"
                        : message.senderUsername)
                  }
                  senderUsername={senderMeta?.username ?? message.senderUsername}
                  showAltText={preferences.chat.showAltText}
                  showEmbeds={preferences.chat.showEmbeds}
                  showLinkMedia={preferences.chat.showLinkMedia}
                  showReactions={preferences.chat.showEmojiReactions}
                  showUploadedMedia={preferences.chat.showUploadedMedia}
                />
              );
            })}
            {showTyping && <TypingIndicator text={typingText} />}
          </div>
        )}
      </div>

      {activeConversationId && messages.length > 0 && showJumpToLatest ? (
        <div className="pointer-events-none absolute bottom-4 left-0 right-0 flex justify-center">
          <button
            className="pointer-events-auto inline-flex items-center gap-2 rounded-full border border-cyan-400/35 bg-slate-900/95 px-3 py-1.5 text-xs font-medium text-cyan-100 shadow-lg shadow-slate-950/70 transition hover:border-cyan-300/60 hover:bg-slate-900"
            onClick={jumpToLatest}
            type="button"
          >
            {pendingMessageCount > 0 ? `${pendingMessageCount} yeni mesaj` : "En yeni mesaja git"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

