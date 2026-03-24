import {
  AlertTriangle,
  Copy,
  Download,
  Forward,
  ExternalLink,
  Hash,
  Link2,
  MessageCircleReply,
  MoreHorizontal,
  Pencil,
  Pin,
  PinOff,
  Save,
  Smile,
  TextCursorInput,
  Trash2,
  Volume2,
  X
} from "lucide-react";
import { type MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";
import { extractUploadPath, resolveAttachmentURL } from "../../lib/attachmentAccess";
import { resolveAvatarURL } from "../../lib/avatar";
import { copyText as copyToClipboard } from "../../lib/clipboard";
import { extractFirstLink, parseMessageLinks, type LinkToken } from "../../lib/linkUtils";
import { parseMessageContent } from "../../lib/messageContent";
import { toPublicID } from "../../lib/publicId";
import { useChatStore } from "../../store/chatStore";
import type { Message } from "../../types/chat";
import { toastInfo, toastSuccess } from "../../store/toastStore";
import { useLinkGuard } from "../ui/LinkGuardProvider";
import type { ContextMenuAction } from "./ContextMenu";
import { ContextMenu } from "./ContextMenu";
import { LinkifiedText } from "./LinkifiedText";
import { avatarTone, displayInitials, formatClock } from "./ui";

type MessageReaction = {
  emoji: string;
  count: number;
  reacted: boolean;
};

type MessageRowProps = {
  message: Message;
  mine: boolean;
  grouped: boolean;
  senderName: string;
  senderUsername: string;
  senderAvatarPath?: string | null;
  pinned: boolean;
  reactions: MessageReaction[];
  showReactions: boolean;
  showLinkMedia: boolean;
  showUploadedMedia: boolean;
  showAltText: boolean;
  showEmbeds: boolean;
  hideSensitiveContent: boolean;
  hideByDmSpamFilter: boolean;
  onToggleReaction: (messageId: string, emoji: string) => void;
  onReply: (message: Message) => void;
  onForward: (message: Message) => void;
  onEdit: (message: Message, content: string) => Promise<void>;
  onDelete: (message: Message) => Promise<void>;
  onTogglePin: (message: Message) => void;
  onMarkUnread: (message: Message) => void;
  onCopyLink: (message: Message) => void;
};

const QUICK_REACTIONS = ["✨", "👍", "❤️", "🔥"];
const EXTRA_REACTIONS = ["😂", "🎉", "❤️", "😎", "👏", "🚀", "♟️", "❗"];
const IMAGE_LINK_PATTERN = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif|svg)(?:[?#].*)?$/i;
const VIDEO_LINK_PATTERN = /\.(mp4|webm|mov|m4v|ogv)(?:[?#].*)?$/i;
const INVITE_PATH_PATTERN = /^\/invite\/([a-z0-9-]+)$/i;

type LinkPreviewKind = "image" | "video" | "link" | "invite";

type InvitePreviewMeta = {
  inviteId: string;
  serverId?: string;
  serverName: string;
  memberCount: number | null;
  onlineCount: number | null;
  createdAt?: string;
};

type LinkPreviewItem = Omit<LinkToken, "kind"> & {
  kind: LinkPreviewKind;
  label: string;
  invite?: InvitePreviewMeta;
};

function detectLinkPreviewKind(href: string): LinkPreviewKind {
  if (parseInvitePreview(href)) {
    return "invite";
  }

  let pathname = href;
  try {
    pathname = new URL(href).pathname;
  } catch {
    // noop
  }

  if (IMAGE_LINK_PATTERN.test(pathname)) {
    return "image";
  }

  if (VIDEO_LINK_PATTERN.test(pathname)) {
    return "video";
  }

  return "link";
}

function buildLinkPreviewLabel(href: string): string {
  try {
    const parsed = new URL(href);
    const path = decodeURIComponent(parsed.pathname || "/");
    return `${parsed.hostname}${path === "/" ? "" : path}`;
  } catch {
    return href;
  }
}

function parseInvitePreview(href: string): InvitePreviewMeta | null {
  try {
    const parsed = new URL(href, typeof window !== "undefined" ? window.location.origin : "https://catwa.chat");
    const host = parsed.hostname.toLowerCase();
    const sameHost = typeof window !== "undefined" && host === window.location.hostname.toLowerCase();
    const isCatwaHost = host === "catwa.chat" || host === "www.catwa.chat" || sameHost;
    if (!isCatwaHost) {
      return null;
    }

    const match = parsed.pathname.match(INVITE_PATH_PATTERN);
    if (!match) {
      return null;
    }

    const toCount = (value: string | null): number | null => {
      if (!value) {
        return null;
      }
      const parsedValue = Number.parseInt(value, 10);
      return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : null;
    };

    return {
      inviteId: match[1],
      serverId: parsed.searchParams.get("sid") ?? undefined,
      serverName: (parsed.searchParams.get("s") ?? "").trim() || "Sunucu Daveti",
      memberCount: toCount(parsed.searchParams.get("m")),
      onlineCount: toCount(parsed.searchParams.get("o")),
      createdAt: parsed.searchParams.get("c") ?? undefined
    };
  } catch {
    return null;
  }
}

function formatInviteCreatedAt(value?: string): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toLocaleDateString("tr-TR", { month: "short", year: "numeric" });
}

function toAttachmentLinkMeta(url: string): { domain: string; isInternal: boolean; blocked: boolean } {
  if (url.startsWith("blob:")) {
    return {
      domain: "blob.local",
      isInternal: false,
      blocked: false
    };
  }

  try {
    const parsed = new URL(url, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const host = parsed.hostname.toLowerCase();
    const localHost = typeof window !== "undefined" ? window.location.hostname.toLowerCase() : "";
    const sameAppHost = host === localHost || host === "localhost" || host === "127.0.0.1";
    const isKnownAppRoute =
      parsed.pathname === "/" ||
      parsed.pathname === "/login" ||
      parsed.pathname === "/register" ||
      parsed.pathname.startsWith("/channels") ||
      parsed.pathname.startsWith("/settings");
    const isInternal = sameAppHost && isKnownAppRoute;
    return {
      domain: host,
      isInternal,
      blocked: !/^https?:$/i.test(parsed.protocol)
    };
  } catch {
    return {
      domain: "",
      isInternal: false,
      blocked: true
    };
  }
}

function openAttachmentTarget(url: string) {
  if (!url.startsWith("blob:") || typeof window === "undefined") {
    return false;
  }
  const opened = window.open(url, "_blank", "noopener,noreferrer");
  if (!opened) {
    toastInfo("Dosya açılamadı");
  }
  return true;
}

function speakMessage(content: string) {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return;
  }
  if (!content.trim()) {
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = "tr-TR";
    window.speechSynthesis.speak(utterance);
  } catch {
    // noop
  }
}

export function MessageRow({
  message,
  mine,
  grouped,
  senderName,
  senderUsername,
  senderAvatarPath,
  pinned,
  reactions,
  showReactions,
  showLinkMedia,
  showUploadedMedia,
  showAltText,
  showEmbeds,
  hideSensitiveContent,
  hideByDmSpamFilter,
  onToggleReaction,
  onReply,
  onForward,
  onEdit,
  onDelete,
  onTogglePin,
  onMarkUnread,
  onCopyLink
}: MessageRowProps) {
  const { openLink } = useLinkGuard();
  const avatarSeed = mine ? `${message.senderId}-me` : message.senderId;
  const avatarSrc = useMemo(() => resolveAvatarURL(senderAvatarPath ?? message.senderAvatarPath), [message.senderAvatarPath, senderAvatarPath]);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(message.deletedAt ? "" : message.content);
  const [imageViewer, setImageViewer] = useState<{ url: string; name: string } | null>(null);
  const rowRef = useRef<HTMLElement | null>(null);
  const accessToken = useChatStore((state) => state.tokens?.accessToken ?? null);
  const acceptServerInvite = useChatStore((state) => state.acceptServerInvite);
  const selectServer = useChatStore((state) => state.selectServer);
  const joinedServerIds = useChatStore((state) => state.servers.map((item) => item.id));
  const serverIdSet = useMemo(() => new Set(joinedServerIds), [joinedServerIds]);
  const [secureAttachmentURLs, setSecureAttachmentURLs] = useState<Record<string, string>>({});
  const [attachmentAccessFailures, setAttachmentAccessFailures] = useState<Record<string, boolean>>({});
  const [joiningInviteId, setJoiningInviteId] = useState<string | null>(null);
  const firstLink = useMemo(() => extractFirstLink(message.content), [message.content]);
  const parsedContent = useMemo(() => parseMessageContent(message.content), [message.content]);
  const copyableMessageText = useMemo(() => {
    const parts: string[] = [];

    const normalizedText = parsedContent.text.trim();
    if (normalizedText) {
      parts.push(normalizedText);
    }

    if (parsedContent.attachments.length > 0) {
      const attachmentLines = parsedContent.attachments.map((attachment) => `${attachment.name} (${attachment.url})`);
      parts.push(attachmentLines.join("\n"));
    }

    return parts.join("\n\n").trim();
  }, [parsedContent.attachments, parsedContent.text]);

  const deleted = !!message.deletedAt;
  const canEdit = mine && !deleted;
  const canDelete = mine && !deleted;
  const hiddenReason = !deleted
    ? hideByDmSpamFilter
      ? "DM spam filtresi nedeniyle gizli."
      : hideSensitiveContent
        ? "Hassas içerik ayarın nedeniyle gizli."
        : null
    : null;
  const shouldHideBody = !!hiddenReason;
  const linkPreviews = useMemo<LinkPreviewItem[]>(() => {
    if (!showEmbeds || deleted || shouldHideBody || !parsedContent.text.trim()) {
      return [];
    }

    const tokens = parseMessageLinks(parsedContent.text);
    const seen = new Set<string>();
    const previews: LinkPreviewItem[] = [];

    for (const token of tokens) {
      if (token.kind !== "link" || token.blocked || seen.has(token.href)) {
        continue;
      }
      seen.add(token.href);
      const invite = parseInvitePreview(token.href);

      previews.push({
        ...token,
        kind: invite ? "invite" : showLinkMedia ? detectLinkPreviewKind(token.href) : "link",
        label: invite?.serverName ?? buildLinkPreviewLabel(token.href),
        invite: invite ?? undefined
      });

      if (previews.length >= 3) {
        break;
      }
    }

    return previews;
  }, [deleted, parsedContent.text, shouldHideBody, showEmbeds, showLinkMedia]);

  useEffect(() => {
    if (!editing) {
      setEditDraft(deleted ? "" : message.content);
    }
  }, [deleted, editing, message.content]);

  useEffect(() => {
    if (!imageViewer || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setImageViewer(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [imageViewer]);

  useEffect(() => {
    let cancelled = false;

    const attachments = parsedContent.attachments;
    if (attachments.length === 0 || !accessToken) {
      setSecureAttachmentURLs({});
      setAttachmentAccessFailures({});
      return () => {
        cancelled = true;
      };
    }

    const resolveURLs = async () => {
      const resolvedEntries = await Promise.all(
        attachments.map(async (attachment) => {
          const resolved = await resolveAttachmentURL(attachment.url, accessToken);
          if (!resolved) {
            return null;
          }
          return [attachment.id, resolved] as const;
        })
      );

      if (cancelled) {
        return;
      }

      const next: Record<string, string> = {};
      const failed: Record<string, boolean> = {};
      for (const entry of resolvedEntries) {
        if (!entry) {
          continue;
        }
        next[entry[0]] = entry[1];
      }
      for (const attachment of attachments) {
        if (!next[attachment.id]) {
          failed[attachment.id] = true;
        }
      }

      setSecureAttachmentURLs(next);
      setAttachmentAccessFailures(failed);
    };

    void resolveURLs();

    return () => {
      cancelled = true;
    };
  }, [accessToken, parsedContent.attachments]);

  const copyText = async (value: string, toastMessage?: string) => {
    const copied = await copyToClipboard(value);
    if (copied) {
      if (toastMessage) {
        toastSuccess(toastMessage);
      }
      return;
    }
    toastInfo("Panoya kopyalanamadı");
  };

  const submitEdit = async () => {
    const normalized = editDraft.trim();
    if (!normalized || normalized === message.content.trim()) {
      setEditing(false);
      return;
    }
    await onEdit(message, normalized);
    setEditing(false);
  };

  const openViewerInBrowser = () => {
    if (!imageViewer) {
      return;
    }
    if (openAttachmentTarget(imageViewer.url)) {
      return;
    }
    const meta = toAttachmentLinkMeta(imageViewer.url);
    void openLink({
      href: imageViewer.url,
      domain: meta.domain,
      isInternal: meta.isInternal,
      blocked: meta.blocked
    });
  };

  const openContextMenuFromButton = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (typeof window === "undefined") {
      return;
    }
    const target = rowRef.current;
    if (!target) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const contextEvent = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.bottom + 6,
      view: window
    });
    target.dispatchEvent(contextEvent);
  };

  const joinInviteServer = async (invite: InvitePreviewMeta) => {
    if (joiningInviteId === invite.inviteId) {
      return;
    }

    if (invite.serverId && serverIdSet.has(invite.serverId)) {
      await selectServer(invite.serverId);
      return;
    }

    setJoiningInviteId(invite.inviteId);
    try {
      const accepted = await acceptServerInvite(invite.inviteId);
      if ((accepted || invite.serverId) && invite.serverId) {
        await selectServer(invite.serverId);
      }
    } finally {
      setJoiningInviteId(null);
    }
  };

  const reactionHeader = showReactions ? (
    <div className="flex flex-wrap items-center gap-1">
      {QUICK_REACTIONS.map((emoji) => (
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700/80 bg-slate-800/80 text-base transition hover:border-slate-500 hover:bg-slate-700"
          key={`${message.id}-reaction-${emoji}`}
          onClick={() => onToggleReaction(message.id, emoji)}
          type="button"
        >
          {emoji}
        </button>
      ))}
    </div>
  ) : null;

  const actions = useMemo<ContextMenuAction[]>(() => {
    const items: ContextMenuAction[] = [];

    if (showReactions) {
      items.push({
        id: `reaction-${message.id}`,
        icon: <TextCursorInput className="h-3.5 w-3.5" />,
        label: "Tepki Ekle",
        children: EXTRA_REACTIONS.map((emoji) => ({
          id: `reaction-sub-${message.id}-${emoji}`,
          label: `${emoji} Tepki`,
          onSelect: () => onToggleReaction(message.id, emoji)
        }))
      });
    }

    items.push(
      {
        id: `edit-${message.id}`,
        icon: <Pencil className="h-3.5 w-3.5" />,
        label: "Mesajı Düzenle",
        disabled: !canEdit,
        onSelect: () => setEditing(true)
      },
      {
        id: `reply-${message.id}`,
        icon: <MessageCircleReply className="h-3.5 w-3.5" />,
        label: "Yanıtla",
        disabled: deleted,
        onSelect: () => onReply(message)
      },
      {
        id: `forward-${message.id}`,
        icon: <Forward className="h-3.5 w-3.5" />,
        label: "İlet",
        disabled: deleted,
        onSelect: () => onForward(message),
        separatorAfter: true
      },
      {
        id: `copy-content-${message.id}`,
        icon: <Copy className="h-3.5 w-3.5" />,
        label: "Metni Kopyala",
        onSelect: () => {
          if (!copyableMessageText) {
              toastInfo("Kopyalanacak metin bulunamadı");
            return;
          }
          void copyText(copyableMessageText, "Mesaj metni kopyalandı");
        }
      },
      {
        id: `pin-${message.id}`,
        icon: pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />,
        label: pinned ? "Mesaj Sabitlemesini Kaldır" : "Mesajı Sabitle",
        onSelect: () => onTogglePin(message)
      },
      {
        id: `apps-${message.id}`,
        icon: <Hash className="h-3.5 w-3.5" />,
        label: "Uygulamalar",
        children: [
          {
            id: `copy-json-${message.id}`,
            label: "Mesaj JSON Kopyala",
            onSelect: () => {
              void copyText(JSON.stringify(message, null, 2), "Mesaj JSON kopyalandı");
            }
          },
          {
            id: `copy-uppercase-${message.id}`,
            label: "Büyük Harf Kopyala",
            onSelect: () => {
              void copyText(message.content.toLocaleUpperCase("tr-TR"), "Büyük harf metin kopyalandı");
            }
          },
          {
            id: `copy-sender-${message.id}`,
            label: "Göndereni Kopyala",
            onSelect: () => {
              void copyText(`@${message.senderUsername}`, "Gönderen bilgisi kopyalandı");
            }
          }
        ]
      },
      {
        id: `mark-unread-${message.id}`,
        icon: <MessageCircleReply className="h-3.5 w-3.5" />,
        label: "Okunmadı Olarak İşaretle",
        onSelect: () => onMarkUnread(message)
      },
      {
        id: `open-first-link-${message.id}`,
        icon: <Link2 className="h-3.5 w-3.5" />,
        label: "Bağlantıyı Aç",
        disabled: deleted || !firstLink,
        onSelect: () => {
          if (!firstLink) {
            return;
          }
          void openLink({
            href: firstLink.href,
            domain: firstLink.domain,
            isInternal: firstLink.isInternal,
            blocked: firstLink.blocked
          });
        }
      },
      {
        id: `copy-first-link-${message.id}`,
        icon: <Copy className="h-3.5 w-3.5" />,
        label: "Bağlantıyı Kopyala",
        disabled: deleted || !firstLink,
        onSelect: () => {
          if (!firstLink) {
            return;
          }
          void copyText(firstLink.href, "Bağlantı kopyalandı");
        }
      },
      {
        id: `copy-link-${message.id}`,
        icon: <Link2 className="h-3.5 w-3.5" />,
        label: "Mesaj Bağlantısını Kopyala",
        onSelect: () => onCopyLink(message)
      },
      {
        id: `speak-${message.id}`,
        icon: <Volume2 className="h-3.5 w-3.5" />,
        label: "İlet",
        disabled: deleted || !message.content.trim(),
        onSelect: () => speakMessage(message.content),
        separatorAfter: true
      },
      {
        id: `delete-${message.id}`,
        icon: <Trash2 className="h-3.5 w-3.5" />,
        label: "Mesajı Sil",
        danger: true,
        disabled: !canDelete,
        onSelect: () => {
          void onDelete(message);
        },
        separatorAfter: true
      },
      {
        id: `copy-id-${message.id}`,
        icon: <Hash className="h-3.5 w-3.5" />,
        label: "Mesaj ID'sini Kopyala",
        onSelect: () => {
          void copyText(toPublicID(message.id), "Mesaj ID kopyalandı");
        }
      }
    );

    return items;
  }, [
    canDelete,
    canEdit,
    deleted,
    firstLink,
    message,
    onCopyLink,
    onDelete,
    onForward,
    onMarkUnread,
    onReply,
    onTogglePin,
    onToggleReaction,
    copyableMessageText,
    openLink,
    pinned,
    showReactions
  ]);

  const contentNode = editing ? (
    <div className="mt-1.5 rounded-md border border-slate-700/80 bg-slate-900/85 p-2">
      <textarea
        className="h-20 w-full resize-none rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2 text-[13px] text-slate-100 outline-none focus:border-cyan-400/60"
        onChange={(event) => setEditDraft(event.target.value)}
        value={editDraft}
      />
      <div className="mt-2 flex items-center justify-end gap-2">
        <button
          className="inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs text-slate-200 transition hover:border-slate-500"
          onClick={() => {
            setEditing(false);
            setEditDraft(message.content);
          }}
          type="button"
        >
          <X className="h-3.5 w-3.5" />İptal</button>
        <button
          className="inline-flex items-center gap-1 rounded-md border border-cyan-500/45 bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-100 transition hover:bg-cyan-500/25"
          onClick={() => {
            void submitEdit();
          }}
          type="button"
        >
          <Save className="h-3.5 w-3.5" />
          Kaydet
        </button>
      </div>
    </div>
  ) : (
    <div className="mt-0.5 space-y-2">
      {shouldHideBody ? (
        <div className="flex max-w-[520px] items-center gap-2 rounded-md border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>{hiddenReason}</span>
        </div>
      ) : (
        <>
          {!deleted && parsedContent.reply ? (
            <div
              className="max-w-[520px] select-none border-l border-[var(--catwa-border-soft)] pl-2 text-[12px] text-slate-400"
              onCopy={(event) => {
                event.preventDefault();
              }}
              onDragStart={(event) => {
                event.preventDefault();
              }}
            >
              <span className="block whitespace-pre-wrap break-words">{parsedContent.reply.preview}</span>
            </div>
          ) : null}

          {deleted || parsedContent.text ? (
            <p className={`message-row__text whitespace-pre-wrap break-words ${deleted ? "italic text-slate-500" : "text-slate-200"}`}>
              {deleted ? "Bu mesaj silindi." : <LinkifiedText content={parsedContent.text} />}
            </p>
          ) : null}

          {!deleted && linkPreviews.length > 0 ? (
            <div className="space-y-2">
              {linkPreviews.map((preview) => (
                <div key={`${message.id}-preview-${preview.href}`}>
                  {preview.kind === "invite" && preview.invite ? (
                    <article className="w-full max-w-[460px] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900/70 shadow-[0_16px_34px_-24px_rgba(2,6,23,0.9)]">
                      <div className="h-16 bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100" />
                      <div className="space-y-2 px-4 pb-4 pt-3">
                        <p className="text-lg font-semibold text-slate-100">{preview.invite.serverName}</p>
                        <p className="text-sm text-slate-300">
                          {preview.invite.onlineCount ?? 0} Çevrim içi • {preview.invite.memberCount ?? 0} Üye
                        </p>
                        {formatInviteCreatedAt(preview.invite.createdAt) ? (
                          <p className="text-xs text-slate-400">Oluşturulma: {formatInviteCreatedAt(preview.invite.createdAt)}</p>
                        ) : null}
                        <button
                          className="mt-1 inline-flex w-full items-center justify-center rounded-lg border border-emerald-500/60 bg-emerald-500/85 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                          disabled={joiningInviteId === preview.invite.inviteId}
                          onClick={() => {
                            void joinInviteServer(preview.invite!);
                          }}
                          type="button"
                        >
                          {joiningInviteId === preview.invite.inviteId ? "Bağlanıyor..." : "Sunucuya git"}
                        </button>
                      </div>
                    </article>
                  ) : (
                    <button
                      className="block w-full max-w-[460px] overflow-hidden rounded-md border border-slate-700/70 bg-slate-900/60 text-left transition hover:border-slate-500/80"
                      onClick={() => {
                        void openLink({
                          href: preview.href,
                          domain: preview.domain,
                          isInternal: preview.isInternal,
                          blocked: preview.blocked
                        });
                      }}
                      type="button"
                    >
                      {preview.kind === "image" ? (
                        <img
                          alt={preview.label}
                          className="max-h-[240px] w-full object-cover"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          src={preview.href}
                        />
                      ) : null}
                      <div className="space-y-0.5 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-[0.08em] text-slate-400">{preview.domain}</p>
                        <p className="truncate text-xs text-slate-200">{preview.label}</p>
                        {preview.kind === "video" ? <p className="text-[11px] text-slate-400">Video bağlantısı</p> : null}
                        {preview.kind === "image" && showAltText ? (
                          <p className="text-[11px] text-slate-400">Görsel açıklaması: {preview.label}</p>
                        ) : null}
                      </div>
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {!deleted && parsedContent.attachments.length > 0 ? (
            <div className="space-y-2">
              {parsedContent.attachments.map((attachment) => {
                const hasUploadPath = extractUploadPath(attachment.url) !== null;
                const resolvedAttachmentURL = hasUploadPath ? (secureAttachmentURLs[attachment.id] ?? null) : attachment.url;

                if (!resolvedAttachmentURL) {
                  const failed = attachmentAccessFailures[attachment.id] ?? false;
                  return (
                    <div
                      className="flex w-full max-w-[460px] items-center gap-2 px-1 py-1 text-left text-sm text-[var(--catwa-text-soft)]"
                      key={attachment.id}
                    >
                      <Link2 className="h-4 w-4 shrink-0 text-[var(--catwa-accent)]" />
                      <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                      <span className="text-[11px]">{failed ? "Dosyaya erişilemiyor" : "Dosya erişimi doğrulanıyor..."}</span>
                    </div>
                  );
                }

                if (attachment.isImage && showUploadedMedia) {
                  return (
                    <div className="w-full max-w-[460px] space-y-1" key={attachment.id}>
                      <button
                        className="group block w-full overflow-hidden text-left transition"
                        onClick={() => {
                          setImageViewer({
                            url: resolvedAttachmentURL,
                            name: attachment.name
                          });
                        }}
                        type="button"
                      >
                        <img
                          alt={attachment.name}
                          className="max-h-[320px] w-full rounded-md object-contain"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                          src={resolvedAttachmentURL}
                        />
                      </button>
                      {showAltText ? <p className="px-1 text-[11px] text-slate-400">Görsel açıklaması: {attachment.name}</p> : null}
                    </div>
                  );
                }

                return (
                  <button
                    className="flex w-full max-w-[460px] items-center gap-2 py-1 text-left text-sm text-[var(--catwa-text-main)] transition"
                    key={attachment.id}
                    onClick={() => {
                      if (openAttachmentTarget(resolvedAttachmentURL)) {
                        return;
                      }
                      const meta = toAttachmentLinkMeta(resolvedAttachmentURL);
                      void openLink({
                        href: resolvedAttachmentURL,
                        domain: meta.domain,
                        isInternal: meta.isInternal,
                        blocked: meta.blocked
                      });
                    }}
                    type="button"
                  >
                    <Link2 className="h-4 w-4 shrink-0 text-[var(--catwa-accent)]" />
                    <span className="min-w-0 flex-1 truncate">{attachment.name}</span>
                    {attachment.isImage && !showUploadedMedia ? <span className="text-[11px] text-slate-500">Önizleme kapalı</span> : null}
                    <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                  </button>
                );
              })}
            </div>
          ) : null}
        </>
      )}
    </div>
  );

  const reactionsNode =
    showReactions && reactions.length > 0 ? (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {reactions.map((item) => (
          <button
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition ${
              item.reacted
                ? "border-cyan-400/60 bg-cyan-500/20 text-cyan-100"
                : "border-slate-700/90 bg-slate-800/70 text-slate-200 hover:border-slate-500"
            }`}
            key={`${message.id}-${item.emoji}`}
            onClick={() => onToggleReaction(message.id, item.emoji)}
            type="button"
          >
            <span>{item.emoji}</span>
            <span>{item.count}</span>
          </button>
        ))}
      </div>
    ) : null;

  const metaTags = (
    <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
      {message.editedAt && !deleted ? <span>düzenlendi</span> : null}
      {pinned ? (
        <span className="inline-flex items-center gap-1 text-amber-300">
          <Pin className="h-3 w-3" />
          sabitlendi
        </span>
      ) : null}
    </div>
  );

  const hoverActions = (
    <div className="pointer-events-none absolute right-0 top-0 z-[120] flex -translate-y-[78%] items-center gap-1 rounded-md border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_88%,black_12%)] px-1 py-1 opacity-0 shadow-[0_10px_22px_-14px_rgba(2,6,23,0.85)] transition group-hover:pointer-events-auto group-hover:opacity-100">
      <span className="mr-1 px-1 text-[11px] text-slate-500">{formatClock(message.createdAt)}</span>
      {showReactions && !deleted ? (
        <button
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/6 hover:text-white"
          onClick={() => onToggleReaction(message.id, "👍")}
          title="Tepki ekle"
          type="button"
        >
          <Smile className="h-3.5 w-3.5" />
        </button>
      ) : null}
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/6 hover:text-white disabled:opacity-40"
        disabled={deleted}
        onClick={() => onReply(message)}
        title="Yanıtla"
        type="button"
      >
        <MessageCircleReply className="h-3.5 w-3.5" />
      </button>
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/6 hover:text-white disabled:opacity-40"
        disabled={deleted}
        onClick={() => onForward(message)}
        title="İlet"
        type="button"
      >
        <Forward className="h-3.5 w-3.5" />
      </button>
      <button
        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-300 transition hover:bg-white/6 hover:text-white"
        onClick={openContextMenuFromButton}
        title="Daha fazla"
        type="button"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </button>
    </div>
  );
  const imageViewerNode = imageViewer ? (
    <div aria-modal="true" className="fixed inset-0 z-[180] bg-black/92" onClick={() => setImageViewer(null)} role="dialog">
      <div className="absolute left-5 top-4 z-10">
        <p className="text-sm font-semibold text-slate-100">{senderName}</p>
        <p className="text-xs text-slate-400">{formatClock(message.createdAt)}</p>
      </div>
      <div className="absolute right-5 top-4 z-10 flex items-center gap-2">
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-900/70 text-slate-100 transition hover:bg-slate-800"
          onClick={(event) => {
            event.stopPropagation();
            openViewerInBrowser();
          }}
          title="Tarayıcıda aç"
          type="button"
        >
          <Download className="h-4 w-4" />
        </button>
        <button
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/20 bg-slate-900/70 text-slate-100 transition hover:bg-slate-800"
          onClick={(event) => {
            event.stopPropagation();
            setImageViewer(null);
          }}
          title="Kapat"
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex h-full w-full items-center justify-center p-4" onClick={(event) => event.stopPropagation()}>
        <img alt={imageViewer.name} className="h-full w-full select-none object-contain" draggable={false} src={imageViewer.url} />
      </div>
    </div>
  ) : null;

  if (grouped) {
    return (
      <>
        {imageViewerNode}
        <ContextMenu actions={actions} header={reactionHeader ?? undefined}>
          <article className="message-row message-row--grouped cw-message-row group grid grid-cols-[52px_1fr] px-3 py-1" ref={rowRef}>
            <span className="pt-1 text-[10px] text-slate-500 opacity-0 transition group-hover:opacity-100">{formatClock(message.createdAt)}</span>
            <div className="relative min-w-0">
              {hoverActions}
              {contentNode}
              {reactionsNode}
              {metaTags}
            </div>
          </article>
        </ContextMenu>
      </>
    );
  }

  return (
    <>
      {imageViewerNode}
      <ContextMenu actions={actions} header={reactionHeader ?? undefined}>
        <article className="message-row message-row--start cw-message-row group grid grid-cols-[40px_1fr] gap-3 px-3 py-2" ref={rowRef}>
          <div
            className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md text-[11px] font-semibold text-slate-100"
            style={{ backgroundColor: avatarTone(avatarSeed) }}
          >
            {avatarSrc ? (
              <img alt={`${senderName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
            ) : (
              displayInitials(senderName, senderUsername || message.senderUsername)
            )}
          </div>

          <div className="relative min-w-0">
            {hoverActions}
            <header className="flex items-baseline gap-2">
              <span className={`catwa-personal-info text-[14px] font-semibold ${mine ? "text-cyan-200" : "text-slate-100"}`}>
                {senderName}
              </span>
              <time className="text-[11px] text-slate-500 opacity-0 transition group-hover:opacity-100">{formatClock(message.createdAt)}</time>
            </header>
            {contentNode}
            {reactionsNode}
            {metaTags}
          </div>
        </article>
      </ContextMenu>
    </>
  );
}


