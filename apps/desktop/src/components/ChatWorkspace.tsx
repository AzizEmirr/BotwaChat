import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ArrowLeft,
  AtSign,
  Bell,
  BellOff,
  BellRing,
  CircleOff,
  House,
  IdCard,
  Link2,
  Mail,
  MessageCircle,
  Plus,
  Search,
  SlidersHorizontal,
  UserCircle2,
  UserMinus,
  UserRoundX,
  Volume2,
  X
} from "lucide-react";
import { resolveAvatarURL } from "../lib/avatar";
import { copyText } from "../lib/clipboard";
import { convertTextEmojiShortcuts } from "../lib/chatPreferencesRuntime";
import { env } from "../lib/env";
import { buildReplyPrefixedMessage, summarizeMessagePreview } from "../lib/messageContent";
import { normalizePresenceState, normalizePresenceStatus, presenceFrom } from "../lib/presence";
import { toPublicID } from "../lib/publicId";
import { applyAppPreferences, loadAppPreferences } from "../lib/uiPreferences";
import { useChatStore } from "../store/chatStore";
import { useDMContextStore, dmMuteDurationLabel, type DMMuteDuration } from "../store/dmContextStore";
import { toastError, toastInfo, toastSuccess } from "../store/toastStore";
import type { InviteServerMemberResponse, Message, PresenceState } from "../types/chat";
import { AppShell } from "./workspace/AppShell";
import { ChatHeader } from "./workspace/ChatHeader";
import { ConversationSearchModal } from "./workspace/ConversationSearchModal";
import { ConfirmModal } from "./workspace/ConfirmModal";
import { ConversationSidebar } from "./workspace/ConversationSidebar";
import type { ContextMenuAction } from "./workspace/ContextMenu";
import { FriendProfileModal } from "./workspace/FriendProfileModal";
import { FriendProfileSidebar, type ProfileQuickAction } from "./workspace/FriendProfileSidebar";
import { FriendsHome, type FriendsHomeTab } from "./workspace/FriendsHome";
import { InboxModal, type InboxNotificationItem, type InboxUnreadItem } from "./workspace/InboxModal";
import { PinnedMessagesModal, type PinnedMessageItem } from "./workspace/PinnedMessagesModal";
import { MessageComposer } from "./workspace/MessageComposer";
import { MessageList } from "./workspace/MessageList";
import { RightSidebar } from "./workspace/RightSidebar";
import { ScreenSharePickerModal } from "./workspace/ScreenSharePickerModal";
import { ScreenShareStage } from "./workspace/ScreenShareStage";
import { ServerMembersSidebar } from "./workspace/ServerMembersSidebar";
import { ServerRail, type ServerRailMenuAction } from "./workspace/ServerRail";
import { ServerSettingsModal } from "./workspace/ServerSettingsModal";
import { SettingsModal, type SettingsSectionId } from "./workspace/SettingsModal";
import type { InputPromptField } from "./workspace/InputPromptModal";
import { InputPromptModal } from "./workspace/InputPromptModal";
import { TextEditModal } from "./workspace/TextEditModal";
import { UserPanel, type SelfPresenceStatus } from "./workspace/UserPanel";
import { avatarTone, displayInitials, formatClock, presenceDotClass } from "./workspace/ui";
import { WindowTitleBar } from "./workspace/WindowTitleBar";

type ChatWorkspaceProps = {
  appName: string;
  friendsTab?: FriendsHomeTab;
  onFriendsTabChange?: (tab: FriendsHomeTab) => void;
  forcedSettingsSection?: SettingsSectionId | null;
  onRequestOpenSettings?: (section: SettingsSectionId) => void;
  onRequestCloseSettings?: () => void;
};

type DMActionTarget = {
  conversationId: string;
  userId: string;
  username: string;
  displayName: string;
};

type PendingContextConfirm = {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => Promise<void> | void;
  onCancel?: () => void;
};

type PendingInputPrompt = {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  fields: InputPromptField[];
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
};

type MobileRootTab = "home" | "notifications" | "profile" | "search" | "add-friend" | "add-friend-username";

type MobileSearchHistoryEntry = {
  id: string;
  label: string;
  subtitle?: string;
  kind: "query" | "user";
  userId?: string;
  username?: string;
  avatarPath?: string;
};

const SELF_PRESENCE_STORAGE_KEY = "catwa.selfPresenceStatus";
const MOBILE_SEARCH_HISTORY_STORAGE_KEY = "catwa.mobile.searchHistory.v1";
const PINS_CHANGED_EVENT_NAME = "catwa:pins.changed";

function readSelfPresenceStatus(): SelfPresenceStatus {
  const raw = window.localStorage.getItem(SELF_PRESENCE_STORAGE_KEY);
  if (raw === "idle" || raw === "dnd" || raw === "invisible") {
    return raw;
  }
  return "online";
}

function readMobileSearchHistory(): MobileSearchHistoryEntry[] {
  try {
    const raw = window.localStorage.getItem(MOBILE_SEARCH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((item): item is MobileSearchHistoryEntry => {
        if (!item || typeof item !== "object") {
          return false;
        }
        if (typeof item.id !== "string" || typeof item.label !== "string") {
          return false;
        }
        if (item.kind !== "query" && item.kind !== "user") {
          return false;
        }
        return true;
      })
      .slice(0, 12);
  } catch {
    return [];
  }
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  return Boolean(target.closest("input, textarea, [contenteditable='true'], [role='textbox']"));
}

export function ChatWorkspace({
  appName,
  friendsTab,
  onFriendsTabChange,
  forcedSettingsSection = null,
  onRequestOpenSettings,
  onRequestCloseSettings
}: ChatWorkspaceProps) {
  const currentUser = useChatStore((state) => state.currentUser);
  const dms = useChatStore((state) => state.dms);
  const selectedDMID = useChatStore((state) => state.selectedDMId);
  const selectedChannelID = useChatStore((state) => state.selectedChannelId);
  const unreadByDM = useChatStore((state) => state.unreadByDM);
  const messagesByDM = useChatStore((state) => state.messagesByDM);
  const messagesByChannel = useChatStore((state) => state.messagesByChannel);
  const typingByDM = useChatStore((state) => state.typingByDM);
  const presenceByUser = useChatStore((state) => state.presenceByUser);
  const loadingDMs = useChatStore((state) => state.loadingDMs);
  const loadingMessages = useChatStore((state) => state.loadingMessages);
  const sendingMessage = useChatStore((state) => state.sendingMessage);
  const userSearchLoading = useChatStore((state) => state.userSearchLoading);
  const userSearchResults = useChatStore((state) => state.userSearchResults);
  const friends = useChatStore((state) => state.friends);
  const friendRequestsIncoming = useChatStore((state) => state.friendRequestsIncoming);
  const friendRequestsOutgoing = useChatStore((state) => state.friendRequestsOutgoing);
  const serverInvitesIncoming = useChatStore((state) => state.serverInvitesIncoming);
  const friendPrivacySettings = useChatStore((state) => state.friendPrivacySettings);
  const blockedUsers = useChatStore((state) => state.blockedUsers);
  const loadingFriends = useChatStore((state) => state.loadingFriends);
  const loadingFriendRequests = useChatStore((state) => state.loadingFriendRequests);
  const loadingFriendPrivacy = useChatStore((state) => state.loadingFriendPrivacy);
  const loadingBlockedUsers = useChatStore((state) => state.loadingBlockedUsers);
  const sendingFriendRequest = useChatStore((state) => state.sendingFriendRequest);
  const updatingFriendPrivacy = useChatStore((state) => state.updatingFriendPrivacy);
  const wsConnected = useChatStore((state) => state.wsConnected);
  const error = useChatStore((state) => state.error);
  const profileUpdating = useChatStore((state) => state.profileUpdating);
  const passwordUpdating = useChatStore((state) => state.passwordUpdating);
  const logout = useChatStore((state) => state.logout);
  const updateProfile = useChatStore((state) => state.updateProfile);
  const updateSelfPresenceStatus = useChatStore((state) => state.updateSelfPresenceStatus);
  const changePassword = useChatStore((state) => state.changePassword);
  const selectDM = useChatStore((state) => state.selectDM);
  const clearSelectedDM = useChatStore((state) => state.clearSelectedDM);
  const sendMessage = useChatStore((state) => state.sendMessage);
  const sendMessageToConversation = useChatStore((state) => state.sendMessageToConversation);
  const sendMessageWithAttachments = useChatStore((state) => state.sendMessageWithAttachments);
  const editMessage = useChatStore((state) => state.editMessage);
  const deleteMessage = useChatStore((state) => state.deleteMessage);
  const searchUsers = useChatStore((state) => state.searchUsers);
  const createDM = useChatStore((state) => state.createDM);
  const loadFriends = useChatStore((state) => state.loadFriends);
  const loadFriendRequests = useChatStore((state) => state.loadFriendRequests);
  const loadFriendPrivacySettings = useChatStore((state) => state.loadFriendPrivacySettings);
  const loadBlockedUsers = useChatStore((state) => state.loadBlockedUsers);
  const sendFriendRequest = useChatStore((state) => state.sendFriendRequest);
  const sendFriendRequestByUsername = useChatStore((state) => state.sendFriendRequestByUsername);
  const acceptFriendRequest = useChatStore((state) => state.acceptFriendRequest);
  const rejectFriendRequest = useChatStore((state) => state.rejectFriendRequest);
  const acceptServerInvite = useChatStore((state) => state.acceptServerInvite);
  const rejectServerInvite = useChatStore((state) => state.rejectServerInvite);
  const removeFriend = useChatStore((state) => state.removeFriend);
  const blockUser = useChatStore((state) => state.blockUser);
  const unblockUser = useChatStore((state) => state.unblockUser);
  const updateFriendPrivacySettings = useChatStore((state) => state.updateFriendPrivacySettings);
  const sendTypingStart = useChatStore((state) => state.sendTypingStart);
  const sendTypingStop = useChatStore((state) => state.sendTypingStop);
  const clearError = useChatStore((state) => state.clearError);
  const markConversationUnread = useChatStore((state) => state.markConversationUnread);
  const clearUnreadForDM = useChatStore((state) => state.clearUnreadForDM);
  const loadDMs = useChatStore((state) => state.loadDMs);

  const userNotesById = useDMContextStore((state) => state.notesByUser);
  const friendNicknamesById = useDMContextStore((state) => state.nicknamesByUser);
  const ignoredUsers = useDMContextStore((state) => state.ignoredUsers);
  const mutedDMs = useDMContextStore((state) => state.mutedDMs);
  const closedDMs = useDMContextStore((state) => state.closedDMs);
  const setUserNote = useDMContextStore((state) => state.setUserNote);
  const setFriendNickname = useDMContextStore((state) => state.setFriendNickname);
  const setIgnoredUser = useDMContextStore((state) => state.setIgnoredUser);
  const closeDM = useDMContextStore((state) => state.closeDM);
  const reopenDM = useDMContextStore((state) => state.reopenDM);
  const setDMMuted = useDMContextStore((state) => state.setDMMuted);
  const clearDMMuted = useDMContextStore((state) => state.clearDMMuted);
  const markConversationRead = useDMContextStore((state) => state.markConversationRead);

  const servers = useChatStore((state) => state.servers);
  const selectedServerId = useChatStore((state) => state.selectedServerId);
  const channelsByServer = useChatStore((state) => state.channelsByServer);
  const serverMembersByServer = useChatStore((state) => state.serverMembersByServer);
  const loadingServers = useChatStore((state) => state.loadingServers);
  const loadingChannels = useChatStore((state) => state.loadingChannels);
  const loadingServerMembers = useChatStore((state) => state.loadingServerMembers);
  const creatingServer = useChatStore((state) => state.creatingServer);
  const creatingTextChannel = useChatStore((state) => state.creatingTextChannel);
  const creatingVoiceChannel = useChatStore((state) => state.creatingVoiceChannel);
  const loadServers = useChatStore((state) => state.loadServers);
  const selectServer = useChatStore((state) => state.selectServer);
  const createServer = useChatStore((state) => state.createServer);
  const loadChannels = useChatStore((state) => state.loadChannels);
  const createTextChannel = useChatStore((state) => state.createTextChannel);
  const updateTextChannel = useChatStore((state) => state.updateTextChannel);
  const deleteTextChannel = useChatStore((state) => state.deleteTextChannel);
  const selectChannel = useChatStore((state) => state.selectChannel);
  const loadServerMembers = useChatStore((state) => state.loadServerMembers);
  const updateServerMemberRole = useChatStore((state) => state.updateServerMemberRole);
  const inviteServerMember = useChatStore((state) => state.inviteServerMember);
  const removeServerMember = useChatStore((state) => state.removeServerMember);
  const updateServerName = useChatStore((state) => state.updateServerName);
  const leaveServer = useChatStore((state) => state.leaveServer);
  const deleteServer = useChatStore((state) => state.deleteServer);

  const voiceChannels = useChatStore((state) => state.voiceChannels);
  const loadingVoiceChannels = useChatStore((state) => state.loadingVoiceChannels);
  const activeVoiceChannelId = useChatStore((state) => state.activeVoiceChannelId);
  const activeVoiceChannelSnapshot = useChatStore((state) => state.activeVoiceChannelSnapshot);
  const voiceMuted = useChatStore((state) => state.voiceMuted);
  const voiceDeafened = useChatStore((state) => state.voiceDeafened);
  const voiceConnecting = useChatStore((state) => state.voiceConnecting);
  const liveKitConnected = useChatStore((state) => state.liveKitConnected);
  const screenShareStarting = useChatStore((state) => state.screenShareStarting);
  const screenShareActive = useChatStore((state) => state.screenShareActive);
  const screenShareSourceLabel = useChatStore((state) => state.screenShareSourceLabel);
  const screenShareQuality = useChatStore((state) => state.screenShareQuality);
  const screenShareFPS = useChatStore((state) => state.screenShareFPS);
  const screenShareIncludeSystemAudio = useChatStore((state) => state.screenShareIncludeSystemAudio);
  const localScreenShareTrack = useChatStore((state) => state.localScreenShareTrack);
  const remoteScreenShares = useChatStore((state) => state.remoteScreenShares);
  const joinVoiceChannel = useChatStore((state) => state.joinVoiceChannel);
  const leaveVoiceChannel = useChatStore((state) => state.leaveVoiceChannel);
  const toggleVoiceMute = useChatStore((state) => state.toggleVoiceMute);
  const toggleVoiceDeafen = useChatStore((state) => state.toggleVoiceDeafen);
  const loadVoiceChannels = useChatStore((state) => state.loadVoiceChannels);
  const createVoiceChannel = useChatStore((state) => state.createVoiceChannel);
  const updateVoiceChannel = useChatStore((state) => state.updateVoiceChannel);
  const deleteVoiceChannel = useChatStore((state) => state.deleteVoiceChannel);
  const setScreenSharePreferences = useChatStore((state) => state.setScreenSharePreferences);
  const startScreenShare = useChatStore((state) => state.startScreenShare);
  const stopScreenShare = useChatStore((state) => state.stopScreenShare);

  const [globalSearch, setGlobalSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [activeFriendsTab, setActiveFriendsTab] = useState<FriendsHomeTab>(friendsTab ?? "all");
  const [sidebarCollapsed] = useState(false);
  const [rightSidebarOpen, setRightSidebarOpen] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth >= 1200 : true
  );
  const [viewportWidth, setViewportWidth] = useState(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  const [mobileRootTab, setMobileRootTab] = useState<MobileRootTab>("home");
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileSearchQuery, setMobileSearchQuery] = useState("");
  const [mobileSearchHistory, setMobileSearchHistory] = useState<MobileSearchHistoryEntry[]>(() => readMobileSearchHistory());
  const [mobileAddFriendUsername, setMobileAddFriendUsername] = useState("");
  const [mobileSendingFriendRequestByUsername, setMobileSendingFriendRequestByUsername] = useState(false);
  const [mobileKeyboardInset, setMobileKeyboardInset] = useState(0);
  const [mobileKeyboardOpen, setMobileKeyboardOpen] = useState(false);
  const [mobileViewportHeight, setMobileViewportHeight] = useState(() =>
    typeof window !== "undefined" ? window.innerHeight : 0
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<SettingsSectionId | undefined>(undefined);
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [logoutRequestedFromSettings, setLogoutRequestedFromSettings] = useState(false);
  const [screenSharePickerOpen, setScreenSharePickerOpen] = useState(false);
  const [compactMode, setCompactMode] = useState(() => {
    const preferences = loadAppPreferences();
    if (preferences.appearance.messageDisplay === "compact") {
      return true;
    }
    return window.localStorage.getItem("catwa.compactMode") === "1";
  });
  const [selfPresenceStatus, setSelfPresenceStatus] = useState<SelfPresenceStatus>(() => readSelfPresenceStatus());
  const [replyTarget, setReplyTarget] = useState<Message | null>(null);
  const [searchTarget, setSearchTarget] = useState<DMActionTarget | null>(null);
  const [noteEditorTarget, setNoteEditorTarget] = useState<DMActionTarget | null>(null);
  const [nicknameEditorTarget, setNicknameEditorTarget] = useState<DMActionTarget | null>(null);
  const [fullProfileConversationId, setFullProfileConversationId] = useState<string | null>(null);
  const [pinnedModalOpen, setPinnedModalOpen] = useState(false);
  const [pinnedMessagesVersion, setPinnedMessagesVersion] = useState(0);
  const [inboxOpen, setInboxOpen] = useState(false);
  const [inboxAnchorRect, setInboxAnchorRect] = useState<DOMRect | null>(null);
  const [contextConfirm, setContextConfirm] = useState<PendingContextConfirm | null>(null);
  const [inputPrompt, setInputPrompt] = useState<PendingInputPrompt | null>(null);
  const isMobileViewport = viewportWidth <= 900;
  const settingsRouteControlled =
    forcedSettingsSection !== null || typeof onRequestOpenSettings === "function" || typeof onRequestCloseSettings === "function";

  const globalSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const mobileAddFriendInputRef = useRef<HTMLInputElement | null>(null);
  const pendingInviteKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    applyAppPreferences(loadAppPreferences());
  }, []);

  useEffect(() => {
    window.localStorage.setItem("catwa.compactMode", compactMode ? "1" : "0");
  }, [compactMode]);

  useEffect(() => {
    const applyResponsiveLayout = () => {
      setViewportWidth(window.innerWidth);
      if (window.innerWidth < 1200) {
        setRightSidebarOpen(false);
      }
    };

    applyResponsiveLayout();
    window.addEventListener("resize", applyResponsiveLayout);
    return () => window.removeEventListener("resize", applyResponsiveLayout);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(SELF_PRESENCE_STORAGE_KEY, selfPresenceStatus);
  }, [selfPresenceStatus]);

  useEffect(() => {
    if (!friendsTab) {
      return;
    }
    if (friendsTab === activeFriendsTab) {
      return;
    }
    setActiveFriendsTab(friendsTab);
  }, [activeFriendsTab, friendsTab]);

  const persistMobileSearchHistory = useCallback((entries: MobileSearchHistoryEntry[]) => {
    setMobileSearchHistory(entries);
    try {
      window.localStorage.setItem(MOBILE_SEARCH_HISTORY_STORAGE_KEY, JSON.stringify(entries));
    } catch {
      // no-op
    }
  }, []);

  const pushMobileSearchHistory = useCallback(
    (entry: MobileSearchHistoryEntry) => {
      persistMobileSearchHistory([
        entry,
        ...mobileSearchHistory.filter((item) => item.id !== entry.id).slice(0, 11)
      ]);
    },
    [mobileSearchHistory, persistMobileSearchHistory]
  );

  const clearMobileSearchHistory = useCallback(() => {
    persistMobileSearchHistory([]);
  }, [persistMobileSearchHistory]);

  const removeMobileSearchHistoryItem = useCallback(
    (id: string) => {
      persistMobileSearchHistory(mobileSearchHistory.filter((item) => item.id !== id));
    },
    [mobileSearchHistory, persistMobileSearchHistory]
  );

  useEffect(() => {
    const visualViewport = window.visualViewport;
    if (!visualViewport) {
      return;
    }

    const updateViewportMetrics = () => {
      const nextViewportHeight = Math.round(visualViewport.height);
      const keyboardInset = Math.max(0, Math.round(window.innerHeight - visualViewport.height - visualViewport.offsetTop));
      setMobileViewportHeight(nextViewportHeight);
      setMobileKeyboardInset(keyboardInset);
      setMobileKeyboardOpen(keyboardInset > 84);
    };

    updateViewportMetrics();
    visualViewport.addEventListener("resize", updateViewportMetrics);
    visualViewport.addEventListener("scroll", updateViewportMetrics);
    window.addEventListener("resize", updateViewportMetrics);
    return () => {
      visualViewport.removeEventListener("resize", updateViewportMetrics);
      visualViewport.removeEventListener("scroll", updateViewportMetrics);
      window.removeEventListener("resize", updateViewportMetrics);
    };
  }, []);

  useEffect(() => {
    if (window.visualViewport) {
      return;
    }
    const handleResize = () => {
      setMobileViewportHeight(window.innerHeight);
      setMobileKeyboardInset(0);
      setMobileKeyboardOpen(false);
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const handleFriendsTabChange = useCallback(
    (tab: FriendsHomeTab) => {
      setActiveFriendsTab(tab);
      onFriendsTabChange?.(tab);
    },
    [onFriendsTabChange]
  );

  useEffect(() => {
    const userId = currentUser?.id?.trim();
    if (!userId) {
      return;
    }

    useChatStore.setState((state) => ({
      presenceByUser: {
        ...state.presenceByUser,
        [userId]: {
          status: normalizePresenceStatus(selfPresenceStatus),
          lastSeen: selfPresenceStatus === "invisible" ? new Date().toISOString() : undefined
        }
      }
    }));
    void updateSelfPresenceStatus(normalizePresenceStatus(selfPresenceStatus));
  }, [currentUser?.id, selfPresenceStatus, updateSelfPresenceStatus]);

  const selectedServer = useMemo(
    () => servers.find((item) => item.id === selectedServerId) ?? null,
    [servers, selectedServerId]
  );

  const selectedChannels = useMemo(
    () => (selectedServerId ? channelsByServer[selectedServerId] ?? [] : []),
    [channelsByServer, selectedServerId]
  );

  const selectedChannel = useMemo(
    () => selectedChannels.find((channel) => channel.id === selectedChannelID) ?? null,
    [selectedChannels, selectedChannelID]
  );

  const selectedMembers = useMemo(
    () => (selectedServerId ? serverMembersByServer[selectedServerId] ?? [] : []),
    [selectedServerId, serverMembersByServer]
  );

  const friendUserIdSet = useMemo(() => new Set(friends.map((item) => item.userId)), [friends]);
  const blockedUserIdSet = useMemo(() => new Set(blockedUsers.map((item) => item.userId)), [blockedUsers]);
  const incomingFriendRequestsCount = friendRequestsIncoming.length;
  const incomingServerInvitesCount = serverInvitesIncoming.length;
  const outgoingFriendRequestsCount = friendRequestsOutgoing.length;
  const invitableServers = useMemo(
    () =>
      servers.map((server) => ({
        ...server,
        canInvite: server.role.toLowerCase() === "owner" || server.role.toLowerCase() === "admin"
      })),
    [servers]
  );

  const resolveServerOnlineCount = useCallback(
    (serverId: string) => {
      const members = serverMembersByServer[serverId] ?? [];
      return members.reduce((count, member) => {
        const status = normalizePresenceStatus(member.status);
        return status === "online" || status === "idle" || status === "dnd" ? count + 1 : count;
      }, 0);
    },
    [serverMembersByServer]
  );

  const buildServerInviteLink = useCallback(
    (server: { id: string; name: string; memberCount: number }, invite: InviteServerMemberResponse["invite"]) => {
      const params = new URLSearchParams();
      params.set("sid", server.id);
      params.set("s", server.name);
      params.set("m", String(Math.max(0, Math.round(server.memberCount || 0))));
      params.set("o", String(resolveServerOnlineCount(server.id)));
      if (invite.createdAt) {
        params.set("c", invite.createdAt);
      }
      return `https://catwa.chat/invite/${encodeURIComponent(invite.id)}?${params.toString()}`;
    },
    [resolveServerOnlineCount]
  );

  const sendInviteAsDMMessage = useCallback(
    async (conversationId: string, server: { id: string; name: string; memberCount: number }, invite: InviteServerMemberResponse["invite"]) => {
      const normalizedConversationId = conversationId.trim();
      if (!normalizedConversationId) {
        return;
      }

      const inviteLink = buildServerInviteLink(server, invite);
      const content = `${server.name} sunucusuna davet bağlantısı:\n${inviteLink}`;
      const sent = await sendMessageToConversation("dm", normalizedConversationId, content);
      if (!sent) {
        toastInfo("Davet DM'e eklenemedi", "Bağlantıyı manuel paylaşabilirsin.");
      }
    },
    [buildServerInviteLink, sendMessageToConversation]
  );

  const friendsByUserID = useMemo(() => {
    const map = new Map<string, (typeof friends)[number]>();
    for (const item of friends) {
      map.set(item.userId, item);
    }
    return map;
  }, [friends]);

  const selectedMembersByUserID = useMemo(() => {
    const map = new Map<string, (typeof selectedMembers)[number]>();
    for (const member of selectedMembers) {
      map.set(member.userId, member);
    }
    return map;
  }, [selectedMembers]);

  const resolvePreferredDisplayName = useCallback(
    (userId: string, fallback: string) => {
      const nickname = friendNicknamesById[userId]?.trim();
      return nickname || fallback;
    },
    [friendNicknamesById]
  );

  const decoratedDMs = useMemo(
    () =>
      dms.map((conversation) => ({
        ...conversation,
        otherDisplayName: resolvePreferredDisplayName(conversation.otherUserId, conversation.otherDisplayName)
      })),
    [dms, resolvePreferredDisplayName]
  );

  const isConversationMuted = useCallback(
    (conversationId: string) => {
      const entry = mutedDMs[conversationId];
      if (!entry) {
        return false;
      }
      if (!entry.mutedUntil) {
        return true;
      }
      const expiresAt = new Date(entry.mutedUntil).getTime();
      if (!Number.isFinite(expiresAt)) {
        return true;
      }
      if (expiresAt <= Date.now()) {
        clearDMMuted(conversationId);
        return false;
      }
      return true;
    },
    [clearDMMuted, mutedDMs]
  );

  const isConversationClosed = useCallback(
    (conversationId: string, lastMessageAt?: string) => {
      const closedAtRaw = closedDMs[conversationId];
      if (!closedAtRaw) {
        return false;
      }
      const closedAt = new Date(closedAtRaw).getTime();
      if (!Number.isFinite(closedAt)) {
        return false;
      }
      const lastMessageTime = lastMessageAt ? new Date(lastMessageAt).getTime() : 0;
      return !Number.isFinite(lastMessageTime) || lastMessageTime <= closedAt;
    },
    [closedDMs]
  );

  useEffect(() => {
    for (const conversation of dms) {
      const closedAtRaw = closedDMs[conversation.conversationId];
      if (!closedAtRaw || !conversation.lastMessageAt) {
        continue;
      }

      const closedAt = new Date(closedAtRaw).getTime();
      const messageAt = new Date(conversation.lastMessageAt).getTime();
      if (Number.isFinite(closedAt) && Number.isFinite(messageAt) && messageAt > closedAt) {
        reopenDM(conversation.conversationId);
      }
    }
  }, [closedDMs, dms, reopenDM]);

  const visibleDMs = useMemo(
    () => decoratedDMs.filter((conversation) => !isConversationClosed(conversation.conversationId, conversation.lastMessageAt)),
    [decoratedDMs, isConversationClosed]
  );

  const resolvedPresenceByUser = useMemo(() => {
    const next: Record<string, PresenceState> = {};

    for (const [userID, presence] of Object.entries(presenceByUser)) {
      next[userID] = normalizePresenceState(presence);
    }

    for (const friend of friends) {
      if (!next[friend.userId]) {
        next[friend.userId] = presenceFrom(friend.status, friend.lastSeenAt);
      }
    }

    for (const member of selectedMembers) {
      if (!next[member.userId]) {
        next[member.userId] = presenceFrom(member.status, member.lastSeenAt);
      }
    }

    if (currentUser?.id) {
      next[currentUser.id] = normalizePresenceState({
        status: selfPresenceStatus,
        lastSeen: selfPresenceStatus === "invisible" ? new Date().toISOString() : undefined
      });
    }

    return next;
  }, [currentUser?.id, friends, presenceByUser, selfPresenceStatus, selectedMembers]);

  const resolvePresenceForUser = useCallback(
    (userID: string) => {
      const normalizedID = userID.trim();
      if (!normalizedID) {
        return normalizePresenceState(undefined);
      }

      return (
        resolvedPresenceByUser[normalizedID] ??
        normalizePresenceState({
          status:
            friendsByUserID.get(normalizedID)?.status ??
            selectedMembersByUserID.get(normalizedID)?.status ??
            "unknown",
          lastSeen: friendsByUserID.get(normalizedID)?.lastSeenAt ?? selectedMembersByUserID.get(normalizedID)?.lastSeenAt
        })
      );
    },
    [friendsByUserID, resolvedPresenceByUser, selectedMembersByUserID]
  );

  const resolveParticipantLabel = useCallback(
    (userID: string, fallback: string) => {
      const normalizedID = userID.trim();
      if (!normalizedID) {
        return fallback;
      }
      if (currentUser?.id === normalizedID) {
        return "Sen";
      }
      const friend = friendsByUserID.get(normalizedID);
      if (friend) {
        return resolvePreferredDisplayName(friend.userId, friend.displayName);
      }
      const member = selectedMembersByUserID.get(normalizedID);
      if (member) {
        return resolvePreferredDisplayName(member.userId, member.displayName);
      }
      return fallback || normalizedID;
    },
    [currentUser?.id, friendsByUserID, resolvePreferredDisplayName, selectedMembersByUserID]
  );

  const selectedConversation = useMemo(() => {
    if (selectedServer) {
      return null;
    }
    return decoratedDMs.find((conversation) => conversation.conversationId === selectedDMID) ?? null;
  }, [decoratedDMs, selectedDMID, selectedServer]);

  const selectedConversationIsFriend = useMemo(() => {
    if (!selectedConversation) {
      return false;
    }
    return friends.some((item) => item.userId === selectedConversation.otherUserId);
  }, [friends, selectedConversation]);

  const getMutualServerCount = useCallback(
    (targetUserID: string) =>
      Object.values(serverMembersByServer).reduce((count, members) => {
        if (members.some((member) => member.userId === targetUserID)) {
          return count + 1;
        }
        return count;
      }, 0),
    [serverMembersByServer]
  );

  const selectedConversationMutualServerCount = useMemo(() => {
    if (!selectedConversation) {
      return 0;
    }
    return getMutualServerCount(selectedConversation.otherUserId);
  }, [getMutualServerCount, selectedConversation]);

  const fullProfileConversation = useMemo(
    () => (fullProfileConversationId ? decoratedDMs.find((item) => item.conversationId === fullProfileConversationId) ?? null : null),
    [decoratedDMs, fullProfileConversationId]
  );

  const fullProfileConversationIsFriend = useMemo(() => {
    if (!fullProfileConversation) {
      return false;
    }
    return friends.some((item) => item.userId === fullProfileConversation.otherUserId);
  }, [friends, fullProfileConversation]);

  const fullProfileConversationMutualServerCount = useMemo(() => {
    if (!fullProfileConversation) {
      return 0;
    }
    return getMutualServerCount(fullProfileConversation.otherUserId);
  }, [fullProfileConversation, getMutualServerCount]);

  const selectedMessages = useMemo(() => {
    if (selectedServer && selectedChannel) {
      return messagesByChannel[selectedChannel.id] ?? [];
    }
    if (selectedConversation) {
      return selectedDMID ? messagesByDM[selectedDMID] ?? [] : [];
    }
    return [];
  }, [messagesByChannel, messagesByDM, selectedChannel, selectedConversation, selectedDMID, selectedServer]);

  const pinnedConversationId = useMemo(() => {
    if (selectedServer && selectedChannel) {
      return selectedChannel.id;
    }
    return selectedConversation?.conversationId ?? null;
  }, [selectedChannel, selectedConversation, selectedServer]);

  useEffect(() => {
    if (!pinnedConversationId) {
      return;
    }

    const storageKey = `catwa.pins.${pinnedConversationId}`;
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== storageKey) {
        return;
      }
      setPinnedMessagesVersion((current) => current + 1);
    };

    const handlePinsChanged = (event: Event) => {
      const customEvent = event as CustomEvent<{ conversationId?: string }>;
      if (customEvent.detail?.conversationId !== pinnedConversationId) {
        return;
      }
      setPinnedMessagesVersion((current) => current + 1);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener(PINS_CHANGED_EVENT_NAME, handlePinsChanged as EventListener);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener(PINS_CHANGED_EVENT_NAME, handlePinsChanged as EventListener);
    };
  }, [pinnedConversationId]);

  const pinnedMessageItems = useMemo<PinnedMessageItem[]>(() => {
    if (!pinnedConversationId) {
      return [];
    }

    let pinnedIds: string[] = [];
    try {
      const raw = window.localStorage.getItem(`catwa.pins.${pinnedConversationId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) {
        pinnedIds = parsed.filter((value): value is string => typeof value === "string");
      }
    } catch {
      pinnedIds = [];
    }

    if (pinnedIds.length === 0) {
      return [];
    }

    const messagesById = new Map(selectedMessages.map((message) => [message.id, message] as const));
    return pinnedIds
      .map((id) => messagesById.get(id))
      .filter((message): message is Message => !!message)
      .map((message) => ({
        id: message.id,
        sender: message.senderDisplayName ?? message.senderUsername,
        content: message.content,
        createdAt: message.createdAt
      }));
  }, [pinnedConversationId, pinnedMessagesVersion, selectedMessages]);

  const typingUserIDs = selectedServer ? [] : selectedDMID ? typingByDM[selectedDMID] ?? [] : [];

  const filteredConversations = useMemo(() => {
    const query = globalSearch.trim().toLocaleLowerCase("tr-TR");
    if (!query) {
      return visibleDMs;
    }

    return visibleDMs.filter((conversation) => {
      const haystack = `${conversation.otherDisplayName} ${conversation.otherUsername} ${conversation.lastMessage ?? ""}`;
      return haystack.toLocaleLowerCase("tr-TR").includes(query);
    });
  }, [globalSearch, visibleDMs]);

  const mobileSearchQueryNormalized = mobileSearchQuery.trim().toLocaleLowerCase("tr-TR");
  const mobileSearchConversationResults = useMemo(() => {
    if (!mobileSearchQueryNormalized) {
      return visibleDMs.slice(0, 8);
    }
    return visibleDMs
      .filter((conversation) => {
        const haystack = `${conversation.otherDisplayName} ${conversation.otherUsername} ${conversation.lastMessage ?? ""}`;
        return haystack.toLocaleLowerCase("tr-TR").includes(mobileSearchQueryNormalized);
      })
      .slice(0, 12);
  }, [mobileSearchQueryNormalized, visibleDMs]);

  const mobileSearchUsers = useMemo(() => {
    if (!mobileSearchQueryNormalized) {
      return userSearchResults.slice(0, 8);
    }
    return userSearchResults
      .filter((item) => {
        const haystack = `${item.displayName} ${item.username}`;
        return haystack.toLocaleLowerCase("tr-TR").includes(mobileSearchQueryNormalized);
      })
      .slice(0, 10);
  }, [mobileSearchQueryNormalized, userSearchResults]);

  const mobileSuggestedUsers = useMemo(() => {
    if (mobileSearchUsers.length > 0) {
      return mobileSearchUsers;
    }
    return friends
      .slice(0, 6)
      .map((friend) => ({
        id: friend.userId,
        username: friend.username,
        displayName: friend.displayName,
        avatarPath: friend.avatarPath
      }));
  }, [friends, mobileSearchUsers]);

  const handleMobileSelectSearchHistoryItem = useCallback(
    async (entry: MobileSearchHistoryEntry) => {
      setMobileSearchQuery(entry.label);
      if (entry.kind === "user" && entry.userId) {
        await createDM(entry.userId);
        setMobileRootTab("home");
        setMobileChatOpen(true);
        return;
      }
      void searchUsers(entry.label);
    },
    [createDM, searchUsers]
  );

  const inboxUnreadItems = useMemo<InboxUnreadItem[]>(
    () =>
      decoratedDMs
        .map((conversation) => ({
          conversationId: conversation.conversationId,
          displayName: conversation.otherDisplayName,
          username: conversation.otherUsername,
          lastMessage: conversation.lastMessage,
          lastMessageAt: conversation.lastMessageAt,
          unreadCount: unreadByDM[conversation.conversationId] ?? 0
        }))
        .filter((item) => item.unreadCount > 0)
        .sort((a, b) => {
          if (a.unreadCount !== b.unreadCount) {
            return b.unreadCount - a.unreadCount;
          }
          const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
          const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
          return bTime - aTime;
        }),
    [decoratedDMs, unreadByDM]
  );

  const inboxNotifications = useMemo<InboxNotificationItem[]>(() => {
    const notifications: InboxNotificationItem[] = [];

    if (!wsConnected) {
      notifications.push({
        id: "ws-disconnected",
        title: "Bağlantı kesildi",
        description: "Gerçek zamanlı bağlantı kapalı. Mesajlar gecikmeli gelebilir."
      });
    }

    if (error) {
      notifications.push({
        id: `error-${error}`,
        title: "Uygulama uyarısı",
        description: error
      });
    }

    if (activeVoiceChannelId && !liveKitConnected && !voiceConnecting) {
      notifications.push({
        id: "voice-disconnected",
        title: "Ses bağlantısı yeniden bağlanıyor",
        description: "Ses kanalındasın ancak bağlantı şu an aktif değil."
      });
    }

    if (incomingFriendRequestsCount > 0) {
      notifications.push({
        id: "incoming-request",
        title: "Yeni arkadaşlık isteği",
        description: `${incomingFriendRequestsCount} gelen istek var.`
      });
    }

    if (incomingServerInvitesCount > 0) {
      notifications.push({
        id: "incoming-server-invite",
        title: "Sunucu daveti var",
        description: `${incomingServerInvitesCount} sunucu daveti bekliyor.`
      });
    }

    if (outgoingFriendRequestsCount > 0) {
      notifications.push({
        id: "outgoing-request",
        title: "Bekleyen gönderdiğin istekler",
        description: `${outgoingFriendRequestsCount} giden istek beklemede.`
      });
    }

    return notifications;
  }, [
    activeVoiceChannelId,
    error,
    incomingFriendRequestsCount,
    incomingServerInvitesCount,
    liveKitConnected,
    outgoingFriendRequestsCount,
    voiceConnecting,
    wsConnected
  ]);

  const inboxCount = useMemo(() => {
    const unreadTotal = inboxUnreadItems.reduce((sum, item) => sum + item.unreadCount, 0);
    return unreadTotal + incomingFriendRequestsCount + incomingServerInvitesCount;
  }, [incomingFriendRequestsCount, incomingServerInvitesCount, inboxUnreadItems]);

  const typingText = useMemo(() => {
    if (!selectedConversation || typingUserIDs.length === 0) {
      return "";
    }

    const names = typingUserIDs.map((userID) => {
      if (userID === selectedConversation.otherUserId) {
        return selectedConversation.otherDisplayName;
      }
      return "Bir kullanıcı";
    });
    return `${names.join(", ")} yazıyor...`;
  }, [selectedConversation, typingUserIDs]);

  useEffect(() => {
    if (!selectedDMID) {
      return;
    }
    const target = decoratedDMs.find((conversation) => conversation.conversationId === selectedDMID);
    if (!target) {
      return;
    }
    if (!isConversationClosed(target.conversationId, target.lastMessageAt)) {
      return;
    }
    clearSelectedDM();
    setReplyTarget(null);
  }, [clearSelectedDM, decoratedDMs, isConversationClosed, selectedDMID]);

  const resolveMessageSenderMeta = useCallback(
    (message: Message) => {
      if (currentUser?.id && message.senderId === currentUser.id) {
        return {
          name: "Sen",
          username: currentUser.username,
          avatarPath: currentUser.avatarPath ?? message.senderAvatarPath
        };
      }

      if (selectedConversation && message.senderId === selectedConversation.otherUserId) {
        return {
          name: resolvePreferredDisplayName(selectedConversation.otherUserId, selectedConversation.otherDisplayName),
          username: selectedConversation.otherUsername,
          avatarPath: selectedConversation.otherAvatarPath ?? message.senderAvatarPath
        };
      }

      const friend = friendsByUserID.get(message.senderId);
      if (friend) {
        return {
          name: resolvePreferredDisplayName(friend.userId, friend.displayName),
          username: friend.username,
          avatarPath: friend.avatarPath ?? message.senderAvatarPath
        };
      }

      const member = selectedMembersByUserID.get(message.senderId);
      if (member) {
        return {
          name: resolvePreferredDisplayName(member.userId, member.displayName),
          username: member.username,
          avatarPath: member.avatarPath ?? message.senderAvatarPath
        };
      }

      return {
        name: message.senderDisplayName ?? `@${message.senderUsername}`,
        username: message.senderUsername,
        avatarPath: message.senderAvatarPath
      };
    },
    [
      currentUser?.avatarPath,
      currentUser?.id,
      currentUser?.username,
      friendsByUserID,
      resolvePreferredDisplayName,
      selectedConversation,
      selectedMembersByUserID
    ]
  );

  const windowContext = useMemo(() => {
    if (selectedServer && selectedChannel) {
      return {
        context: "server" as const,
        title: `#${selectedChannel.name}`,
        subtitle: selectedServer.name
      };
    }

    if (selectedServer) {
      return {
        context: "server" as const,
        title: "Sunucu",
        subtitle: selectedServer.name
      };
    }

    if (selectedConversation) {
      return {
        context: "dm" as const,
        title: "Direkt Mesaj",
        subtitle: selectedConversation.otherDisplayName
      };
    }

    return {
      context: "friends" as const,
      title: "Arkadaşlar",
      subtitle: "Direkt Mesajlar"
    };
  }, [selectedConversation, selectedServer, selectedChannel]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void searchUsers(globalSearch);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [globalSearch, searchUsers]);

  useEffect(() => {
    if (!isMobileViewport || mobileRootTab !== "search") {
      return;
    }
    const timer = window.setTimeout(() => {
      void searchUsers(mobileSearchQuery);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [isMobileViewport, mobileRootTab, mobileSearchQuery, searchUsers]);

  const submitCurrentMessage = async (): Promise<boolean> => {
    const autoEmojiConvert = loadAppPreferences().chat.autoEmojiConvert;
    const preparedDraft = autoEmojiConvert ? convertTextEmojiShortcuts(draft) : draft;
    const normalized = preparedDraft.trim();
    if (!normalized) {
      return false;
    }
    if (preparedDraft !== draft) {
      setDraft(preparedDraft);
    }
    clearError();
    const payload = replyTarget
      ? buildReplyPrefixedMessage(
          replyTarget.senderUsername,
          summarizeMessagePreview(replyTarget.content),
          normalized
        )
      : normalized;
    const ok = await sendMessage(payload);
    if (!ok) {
      return false;
    }
    setDraft("");
    setReplyTarget(null);
    if (selectedConversation) {
      sendTypingStop();
    }
    return true;
  };

  const submitCurrentMessageWithFiles = async (files: File[]): Promise<boolean> => {
    const selectedDMID = useChatStore.getState().selectedDMId;
    const selectedChannelID = useChatStore.getState().selectedChannelId;
    const conversationType = selectedDMID ? "dm" : "channel";
    const conversationID = selectedDMID ?? selectedChannelID ?? "";

    if (!conversationID || files.length === 0) {
      return false;
    }

    const autoEmojiConvert = loadAppPreferences().chat.autoEmojiConvert;
    const preparedDraft = autoEmojiConvert ? convertTextEmojiShortcuts(draft) : draft;
    const normalized = preparedDraft.trim();
    if (preparedDraft !== draft) {
      setDraft(preparedDraft);
    }
    const payload = replyTarget
      ? buildReplyPrefixedMessage(
          replyTarget.senderUsername,
          summarizeMessagePreview(replyTarget.content),
          normalized
        )
      : normalized;

    const ok = await sendMessageWithAttachments(conversationType, conversationID, payload, files);
    if (!ok) {
      return false;
    }

    setDraft("");
    setReplyTarget(null);
    if (selectedConversation) {
      sendTypingStop();
    }
    return true;
  };

  const handleSelectConversation = (conversationID: string) => {
    reopenDM(conversationID);
    void selectDM(conversationID);
    setRightSidebarOpen(true);
    setMobileRootTab("home");
    setMobileChatOpen(true);
    setReplyTarget(null);
    clearError();
  };

  const handleSelectChannel = (channelID: string) => {
    void selectChannel(channelID);
    setRightSidebarOpen(true);
    setMobileRootTab("home");
    setMobileChatOpen(true);
    setReplyTarget(null);
    clearError();
  };

  const handleSelectServerFromRail = (serverId: string) => {
    setRightSidebarOpen(true);
    setMobileRootTab("home");
    setMobileChatOpen(false);
    setReplyTarget(null);
    clearError();
    void selectServer(serverId);
  };

  const openMobileSearch = useCallback(() => {
    setMobileRootTab("search");
    setMobileChatOpen(false);
    setMobileSearchQuery((current) => (current || globalSearch ? current || globalSearch : ""));
    window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus();
    });
  }, [globalSearch]);

  const openMobileAddFriend = useCallback(() => {
    setMobileRootTab("add-friend");
    setMobileChatOpen(false);
  }, []);

  const openMobileAddFriendByUsername = useCallback(() => {
    setMobileRootTab("add-friend-username");
    window.requestAnimationFrame(() => {
      mobileAddFriendInputRef.current?.focus();
    });
  }, []);

  const focusGlobalSearch = useCallback(() => {
    if (isMobileViewport) {
      openMobileSearch();
      return;
    }
    globalSearchInputRef.current?.focus();
  }, [isMobileViewport, openMobileSearch]);

  const openFriendsHome = async () => {
    clearSelectedDM();
    await selectChannel(null);
    await selectServer(null);
    setMobileRootTab("home");
    setMobileChatOpen(false);
    setMobileSearchQuery("");
    setMobileAddFriendUsername("");
    setReplyTarget(null);
    setRightSidebarOpen(true);
  };

  const handleMobileSendFriendRequestByUsername = useCallback(async () => {
    const normalized = mobileAddFriendUsername.trim();
    if (!normalized || mobileSendingFriendRequestByUsername) {
      return;
    }
    setMobileSendingFriendRequestByUsername(true);
    try {
      const ok = await sendFriendRequestByUsername(normalized);
      if (ok) {
        toastSuccess("Arkadaşlık isteği gönderildi", `@${normalized}`);
        pushMobileSearchHistory({
          id: `query:${normalized.toLocaleLowerCase("tr-TR")}`,
          kind: "query",
          label: normalized
        });
        setMobileAddFriendUsername("");
        setMobileRootTab("home");
      } else {
        toastError("Arkadaşlık isteği gönderilemedi");
      }
    } finally {
      setMobileSendingFriendRequestByUsername(false);
    }
  }, [mobileAddFriendUsername, mobileSendingFriendRequestByUsername, pushMobileSearchHistory, sendFriendRequestByUsername]);

  const handleCopyMessageLink = async (message: Message) => {
    const link = `catwa://conversation/${message.conversationType}/${message.conversationId}/message/${message.id}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // noop
    }
  };

  const handleForwardMessage = async (message: Message) => {
    const dmTargets = visibleDMs.map((dm) => ({
      type: "dm" as const,
      id: dm.conversationId,
      label: `DM • ${dm.otherDisplayName}`
    }));
    const channelTargets = Object.values(channelsByServer)
      .flat()
      .map((channel) => ({
        type: "channel" as const,
        id: channel.id,
        label: `#${channel.name}`
      }));
    const targets = [...dmTargets, ...channelTargets].filter((item) => item.id !== message.conversationId);
    if (targets.length === 0) {
      return;
    }

    const menuText = targets.map((target, index) => `${index + 1}. ${target.label}`).join("\n");
    setInputPrompt({
      title: "Mesajı İlet",
      description: `İletmek için hedef numarasını seç:\n${menuText}`,
      confirmLabel: "İlet",
      fields: [
        {
          key: "targetIndex",
          label: "Hedef Numarası",
          initialValue: "1",
          type: "number"
        }
      ],
      onConfirm: async (values) => {
        const index = Number.parseInt((values.targetIndex ?? "").trim(), 10) - 1;
        if (!Number.isFinite(index) || index < 0 || index >= targets.length) {
          toastError("Geçersiz hedef seçimi");
          return;
        }
        const target = targets[index];
        await sendMessageToConversation(target.type, target.id, `[İletildi • @${message.senderUsername}]\n${message.content}`);
        setInputPrompt(null);
      }
    });
  };

  const handleCreateServer = async () => {
    setInputPrompt({
      title: "Yeni Sunucu Oluştur",
      fields: [
        {
          key: "name",
          label: "Sunucu Adı",
          initialValue: "Yeni Sunucu",
          maxLength: 64
        }
      ],
      confirmLabel: "Oluştur",
      onConfirm: async (values) => {
        const name = (values.name ?? "").trim();
        if (!name) {
          return;
        }
        const created = await createServer(name);
        if (!created) {
          return;
        }

        setInputPrompt(null);
        await selectServer(created.id);
      }
    });
  };

  const handleCreateTextChannel = async () => {
    if (!selectedServerId) {
      return;
    }
    setInputPrompt({
      title: "Metin Kanalı Oluştur",
      fields: [
        {
          key: "name",
          label: "Kanal Adı",
          initialValue: "genel",
          maxLength: 64
        }
      ],
      confirmLabel: "Oluştur",
      onConfirm: async (values) => {
        const name = (values.name ?? "").trim();
        if (!name) {
          return;
        }
        await createTextChannel(selectedServerId, name, "text");
        setInputPrompt(null);
      }
    });
  };

  const handleCreateVoiceChannel = async () => {
    if (!selectedServerId) {
      await handleCreateServer();
      return;
    }
    setInputPrompt({
      title: "Ses Kanalı Oluştur",
      fields: [
        {
          key: "name",
          label: "Ses Kanalı Adı",
          initialValue: "Genel Ses",
          maxLength: 64
        },
        {
          key: "maxParticipants",
          label: "Maksimum Katılımcı (1-100)",
          initialValue: "10",
          type: "number"
        }
      ],
      confirmLabel: "Oluştur",
      onConfirm: async (values) => {
        const name = (values.name ?? "").trim();
        if (!name) {
          return;
        }
        const parsedMax = Number.parseInt((values.maxParticipants ?? "").trim(), 10);
        const maxParticipants = Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax <= 100 ? parsedMax : undefined;

        const created = await createVoiceChannel({
          workspaceId: selectedServerId,
          name,
          maxParticipants
        });

        if (!created) {
          return;
        }
        setInputPrompt(null);
        await loadVoiceChannels(selectedServerId);
      }
    });
  };

  const handleUpdateTextChannel = async (channelId: string) => {
    const channel = selectedChannels.find((item) => item.id === channelId);
    if (!channel) {
      return;
    }
    setInputPrompt({
      title: "Kanalı Güncelle",
      fields: [
        {
          key: "name",
          label: "Kanal Adı",
          initialValue: channel.name,
          maxLength: 64
        }
      ],
      confirmLabel: "Kaydet",
      onConfirm: async (values) => {
        const name = (values.name ?? "").trim();
        if (!name) {
          return;
        }
        await updateTextChannel(channelId, { name });
        setInputPrompt(null);
      }
    });
  };

  const handleUpdateVoiceChannel = async (channelId: string) => {
    const channel = voiceChannels.find((item) => item.id === channelId);
    if (!channel) {
      return;
    }
    setInputPrompt({
      title: "Ses Kanalını Güncelle",
      fields: [
        {
          key: "name",
          label: "Ses Kanalı",
          initialValue: channel.name,
          maxLength: 64
        },
        {
          key: "maxParticipants",
          label: "Maksimum Katılımcı (1-100)",
          initialValue: String(channel.maxParticipants),
          type: "number"
        }
      ],
      confirmLabel: "Kaydet",
      onConfirm: async (values) => {
        const nextName = (values.name ?? "").trim();
        if (!nextName) {
          return;
        }
        const parsedMax = Number.parseInt((values.maxParticipants ?? "").trim(), 10);
        const nextMax = Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax <= 100 ? parsedMax : channel.maxParticipants;
        const updated = await updateVoiceChannel(channelId, { name: nextName, maxParticipants: nextMax });
        if (updated && selectedServerId) {
          await loadVoiceChannels(selectedServerId);
        }
        if (updated) {
          setInputPrompt(null);
        }
      }
    });
  };

  const handleDeleteVoiceChannel = async (channelId: string) => {
    const channel = voiceChannels.find((item) => item.id === channelId);
    if (!channel) {
      return;
    }
    setContextConfirm({
      title: "Ses Kanalı Silinsin mi?",
      description: `"${channel.name}" ses kanalını silmek istediğine emin misin?`,
      confirmLabel: "Sil",
      onConfirm: async () => {
        const deleted = await deleteVoiceChannel(channelId);
        if (deleted && selectedServerId) {
          await loadVoiceChannels(selectedServerId);
        }
      }
    });
  };

  const resetUI = () => {
    setRightSidebarOpen(true);
    setGlobalSearch("");
    setDraft("");
    setReplyTarget(null);
    setCompactMode(false);
  };

  const requestLogout = (fromSettings: boolean) => {
    setLogoutRequestedFromSettings(fromSettings);
    setLogoutConfirmOpen(true);
  };

  const openSettings = useCallback(
    (section?: SettingsSectionId, options?: { syncRoute?: boolean }) => {
      const syncRoute = options?.syncRoute !== false;
      if (settingsRouteControlled && syncRoute) {
        onRequestOpenSettings?.(section ?? "appearance");
        return;
      }
      setSettingsInitialSection(section);
      setSettingsOpen(true);
      if (syncRoute) {
        onRequestOpenSettings?.(section ?? "appearance");
      }
    },
    [onRequestOpenSettings, settingsRouteControlled]
  );

  useEffect(() => {
    if (!settingsRouteControlled) {
      return;
    }

    if (forcedSettingsSection) {
      if (!settingsOpen || settingsInitialSection !== forcedSettingsSection) {
        setSettingsInitialSection(forcedSettingsSection);
        setSettingsOpen(true);
      }
      return;
    }

    if (settingsOpen) {
      setSettingsOpen(false);
      setSettingsInitialSection(undefined);
    }
  }, [forcedSettingsSection, settingsInitialSection, settingsOpen, settingsRouteControlled]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const withMeta = event.ctrlKey || event.metaKey;
      const editable = isEditableTarget(event.target);

      if (withMeta && key === "k") {
        event.preventDefault();
        focusGlobalSearch();
        return;
      }

      if (withMeta && key === ",") {
        event.preventDefault();
        openSettings();
        return;
      }

      if (!editable && withMeta && event.shiftKey && key === "m" && activeVoiceChannelId) {
        event.preventDefault();
        void toggleVoiceMute();
        return;
      }

      if (event.key === "Escape") {
        if (logoutConfirmOpen) {
          setLogoutConfirmOpen(false);
          setLogoutRequestedFromSettings(false);
          return;
        }
        if (serverSettingsOpen) {
          setServerSettingsOpen(false);
          return;
        }
        if (settingsOpen) {
          if (settingsRouteControlled) {
            onRequestCloseSettings?.();
          } else {
            setSettingsOpen(false);
            setSettingsInitialSection(undefined);
          }
          return;
        }
        if (replyTarget) {
          setReplyTarget(null);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    activeVoiceChannelId,
    logoutConfirmOpen,
    replyTarget,
    serverSettingsOpen,
    settingsRouteControlled,
    settingsOpen,
    focusGlobalSearch,
    onRequestCloseSettings,
    openSettings,
    toggleVoiceMute
  ]);

  useEffect(() => {
    if (activeVoiceChannelId) {
      return;
    }
    setScreenSharePickerOpen(false);
  }, [activeVoiceChannelId]);

  const handleServerMenuAction = async (serverId: string, action: ServerRailMenuAction) => {
    const normalizedServerId = serverId.trim();
    if (!normalizedServerId) {
      return;
    }

    if (selectedServerId !== normalizedServerId) {
      await selectServer(normalizedServerId);
    }

    switch (action) {
      case "invite": {
        setRightSidebarOpen(true);
        setGlobalSearch("");
        break;
      }
      case "notifications": {
        setServerSettingsOpen(true);
        break;
      }
      case "settings": {
        setServerSettingsOpen(true);
        break;
      }
      case "privacy": {
        openSettings("privacy");
        break;
      }
      case "create-event": {
        const defaultName = `etkinlik-${new Date().toLocaleDateString("tr-TR").replace(/\./g, "-")}`;
        setInputPrompt({
          title: "Etkinlik Kanalı Oluştur",
          fields: [
            {
              key: "name",
              label: "Etkinlik Kanalı Adı",
              initialValue: defaultName,
              maxLength: 64
            }
          ],
          confirmLabel: "Oluştur",
          onConfirm: async (values) => {
            const name = (values.name ?? "").trim();
            if (!name) {
              return;
            }
            await createTextChannel(normalizedServerId, name, "announcement");
            setInputPrompt(null);
          }
        });
        break;
      }
      case "leave": {
        setContextConfirm({
          title: "Sunucudan Ayrıl",
          description: "Bu sunucudan ayrılmak istediğine emin misin?",
          confirmLabel: "Ayrıl",
          onConfirm: async () => {
            await leaveServer(normalizedServerId);
          }
        });
        break;
      }
      default:
        break;
    }
  };

  const copyWithToast = useCallback(async (value: string, successMessage: string, failureMessage: string) => {
    const ok = await copyText(value);
    if (ok) {
      toastSuccess(successMessage);
      return;
    }
    toastError(failureMessage);
  }, []);

  const markConversationAsRead = useCallback(
    (conversationId: string) => {
      clearUnreadForDM(conversationId);
      const latestMessage = (messagesByDM[conversationId] ?? [])[messagesByDM[conversationId]?.length - 1];
      markConversationRead(conversationId, latestMessage?.id ?? new Date().toISOString());
      toastSuccess("Okunmuş olarak işaretlendi");
    },
    [clearUnreadForDM, markConversationRead, messagesByDM]
  );

  const handleCloseDM = useCallback(
    (conversationId: string) => {
      closeDM(conversationId);
      if (selectedDMID === conversationId) {
        clearSelectedDM();
        setReplyTarget(null);
      }
      toastInfo("DM kapatıldı", "Konuşma listeden gizlendi.");
    },
    [clearSelectedDM, closeDM, selectedDMID]
  );

  const openConversationProfile = useCallback(
    (target: DMActionTarget) => {
      void selectDM(target.conversationId);
      setRightSidebarOpen(true);
      setSearchTarget(null);
      setFullProfileConversationId(target.conversationId);
    },
    [selectDM]
  );

  const openConversationSearch = useCallback(
    (target: DMActionTarget) => {
      void selectDM(target.conversationId);
      setSearchTarget(target);
    },
    [selectDM]
  );

  const requestRemoveFriend = useCallback(
    (target: DMActionTarget) => {
      setContextConfirm({
        title: "Arkadaşı kaldır",
        description: `${target.displayName} arkadaş listesinden kaldırılacak.`,
        confirmLabel: "Arkadaşı çıkar",
        onConfirm: async () => {
          const ok = await removeFriend(target.userId);
          if (ok) {
            toastSuccess("Arkadaş kaldırıldı");
            await loadDMs();
          } else {
            toastError("Arkadaş kaldırılamadı");
          }
        }
      });
    },
    [loadDMs, removeFriend]
  );

  const requestBlockToggle = useCallback(
    (target: DMActionTarget, blocked: boolean) => {
      if (blocked) {
        setContextConfirm({
          title: "Engeli kaldır",
          description: `${target.displayName} ile yeniden etkileşim kurabileceksin.`,
          confirmLabel: "Engeli Kaldır",
          onConfirm: async () => {
            const ok = await unblockUser(target.userId);
            if (ok) {
              toastSuccess("Kullanıcı engeli kaldırıldı");
            } else {
              toastError("Kullanıcı engeli kaldırılamadı");
            }
          }
        });
        return;
      }

      setContextConfirm({
        title: "Kullanıcıyı engelle",
        description: `${target.displayName} engellendiğinde DM ve arkadaşlık etkileşimi kısıtlanır.`,
        confirmLabel: "Engelle",
        onConfirm: async () => {
          const ok = await blockUser(target.userId);
          if (ok) {
            toastSuccess("Kullanıcı engellendi");
          } else {
            toastError("Kullanıcı engellenemedi");
          }
        }
      });
    },
    [blockUser, unblockUser]
  );

  const buildConversationActions = useCallback(
    (conversation: (typeof decoratedDMs)[number]): ContextMenuAction[] => {
      const target: DMActionTarget = {
        conversationId: conversation.conversationId,
        userId: conversation.otherUserId,
        username: conversation.otherUsername,
        displayName: conversation.otherDisplayName
      };
      const isFriend = friendUserIdSet.has(target.userId);
      const isBlocked = blockedUserIdSet.has(target.userId);
      const isIgnored = !!ignoredUsers[target.userId];
      const unreadCount = unreadByDM[target.conversationId] ?? 0;
      const muted = isConversationMuted(target.conversationId);
      const muteEntry = mutedDMs[target.conversationId];
      const note = userNotesById[target.userId] ?? "";
      const nickname = friendNicknamesById[target.userId] ?? "";

      const inviteItems: ContextMenuAction[] =
        invitableServers.length === 0
          ? [{ id: `invite-empty-${target.userId}`, label: "Davet için sunucu yok", disabled: true }]
          : invitableServers.map((server) => ({
              id: `invite-${target.userId}-${server.id}`,
              label: server.name,
              disabled: !server.canInvite,
              hint: server.canInvite ? undefined : "Yetki yok",
              onSelect: async () => {
                if (!server.canInvite) {
                  return;
                }
                const inviteKey = `${server.id}:${target.userId}`;
                if (pendingInviteKeysRef.current.has(inviteKey)) {
                  return;
                }
                pendingInviteKeysRef.current.add(inviteKey);
                try {
                  const invited = await inviteServerMember(server.id, target.userId);
                  if (invited) {
                    await sendInviteAsDMMessage(target.conversationId, server, invited.invite);
                    toastSuccess("Davet gönderildi");
                    return;
                  }
                  const latestError = useChatStore.getState().error;
                  toastError("Davet gönderilemedi", latestError ?? "Kullanıcı sunucuya davet edilemedi.");
                } finally {
                  pendingInviteKeysRef.current.delete(inviteKey);
                }
              }
            }));

      const muteDurations: DMMuteDuration[] = ["15m", "1h", "8h", "24h", "forever"];
      const muteItems: ContextMenuAction[] = muted
        ? [
            {
              id: `dm-unmute-${target.conversationId}`,
              label: "Susturmayı kaldır",
              icon: <BellRing className="h-3.5 w-3.5" />,
              onSelect: () => {
                clearDMMuted(target.conversationId);
                toastSuccess("Kanal susturması kaldırıldı");
              }
            }
          ]
        : muteDurations.map((duration) => ({
            id: `dm-mute-${target.conversationId}-${duration}`,
            label: dmMuteDurationLabel(duration),
            checked: muteEntry?.duration === duration,
            onSelect: () => {
              setDMMuted(target.conversationId, duration);
              toastInfo("Kanal susturuldu", `${dmMuteDurationLabel(duration)} boyunca bildirimler susturuldu.`);
            }
          }));

      const appItems: ContextMenuAction[] = [
        {
          id: `apps-open-profile-${target.userId}`,
          label: "Profili Aç",
          onSelect: () => openConversationProfile(target)
        },
        {
          id: `apps-open-search-${target.userId}`,
          label: "Konuşmada Ara",
          onSelect: () => openConversationSearch(target)
        },
        {
          id: `apps-copy-user-${target.userId}`,
          label: "Kullanıcı ID'sini Kopyala",
          onSelect: () => {
            void copyWithToast(toPublicID(target.userId), "Kullanıcı ID'si kopyalandı", "Kullanıcı ID'si kopyalanamadı");
          }
        }
      ];

      const actions: ContextMenuAction[] = [
        {
          id: `mark-read-${target.conversationId}`,
          label: "Okunmuş Olarak İşaretle",
          disabled: unreadCount <= 0,
          onSelect: () => markConversationAsRead(target.conversationId)
        },
        {
          id: `profile-${target.userId}`,
          label: "Profil",
          onSelect: () => openConversationProfile(target)
        },
        {
          id: `search-${target.userId}`,
          label: "Ara",
          icon: <Search className="h-3.5 w-3.5" />,
          onSelect: () => openConversationSearch(target)
        },
        {
          id: `note-${target.userId}`,
          label: "Notu Düzenle",
          hint: note ? "Kayıtlı" : "Sadece sana görünür",
          onSelect: () => setNoteEditorTarget(target)
        },
        {
          id: `nickname-${target.userId}`,
          label: "Arkadaş Takma Adını Değiştir",
          disabled: !isFriend,
          hint: nickname ? "Kayıtlı" : undefined,
          onSelect: () => setNicknameEditorTarget(target)
        },
        {
          id: `close-dm-${target.conversationId}`,
          label: "DM'yi Kapat",
          onSelect: () => handleCloseDM(target.conversationId)
        },
        {
          id: `apps-${target.userId}`,
          label: "Uygulamalar",
          children: appItems
        },
        {
          id: `invite-${target.userId}`,
          label: "Sunucuya Davet Et",
          children: inviteItems
        }
      ];

      if (isFriend) {
        actions.push({
          id: `remove-friend-${target.userId}`,
          label: "Arkadaşı çıkar",
          icon: <UserMinus className="h-3.5 w-3.5" />,
          separatorBefore: true,
          onSelect: () => requestRemoveFriend(target)
        });
      }

      actions.push(
        {
          id: `ignore-${target.userId}`,
          label: isIgnored ? "Yok Saymayı Kaldır" : "Yok Say",
          checked: isIgnored,
          onSelect: () => {
            setIgnoredUser(target.userId, !isIgnored);
            toastInfo(isIgnored ? "Yok sayma kaldırıldı" : "Kullanıcı yok sayıldı");
          }
        },
        {
          id: `block-${target.userId}`,
          label: isBlocked ? "Engeli Kaldır" : "Engelle",
          icon: <UserRoundX className="h-3.5 w-3.5" />,
          danger: !isBlocked,
          onSelect: () => requestBlockToggle(target, isBlocked)
        },
        {
          id: `mute-${target.conversationId}`,
          label: muted ? `Susturmayı Kaldır (${dmMuteDurationLabel(muteEntry?.duration ?? "forever")})` : `@${target.username} kanalını sustur`,
          icon: muted ? <BellRing className="h-3.5 w-3.5" /> : <BellOff className="h-3.5 w-3.5" />,
          children: muteItems
        },
        {
          id: `copy-user-id-${target.userId}`,
          label: "Kullanıcı ID'sini Kopyala",
          icon: <IdCard className="h-3.5 w-3.5" />,
          separatorBefore: true,
          onSelect: () => {
            void copyWithToast(toPublicID(target.userId), "Kullanıcı ID'si kopyalandı", "Kullanıcı ID'si kopyalanamadı");
          }
        },
        {
          id: `copy-channel-id-${target.conversationId}`,
          label: "Kanal ID'sini Kopyala",
          icon: <IdCard className="h-3.5 w-3.5" />,
          onSelect: () => {
            void copyWithToast(toPublicID(target.conversationId), "Kanal ID'si kopyalandı", "Kanal ID'si kopyalanamadı");
          }
        }
      );

      return actions;
    },
    [
      blockedUserIdSet,
      clearDMMuted,
      copyWithToast,
      friendNicknamesById,
      friendUserIdSet,
      handleCloseDM,
      ignoredUsers,
      inviteServerMember,
      invitableServers,
      isConversationMuted,
      markConversationAsRead,
      mutedDMs,
      openConversationProfile,
      openConversationSearch,
      requestBlockToggle,
      requestRemoveFriend,
      sendInviteAsDMMessage,
      setDMMuted,
      setIgnoredUser,
      unreadByDM,
      userNotesById
    ]
  );

  const buildProfileQuickActions = useCallback(
    (conversation: (typeof decoratedDMs)[number]): ProfileQuickAction[] => {
      const target: DMActionTarget = {
        conversationId: conversation.conversationId,
        userId: conversation.otherUserId,
        username: conversation.otherUsername,
        displayName: conversation.otherDisplayName
      };
      const isBlocked = blockedUserIdSet.has(target.userId);
      const isIgnored = !!ignoredUsers[target.userId];

      return [
        {
          id: `profile-quick-invite-${target.userId}`,
          label: "Sunucuya Davet Et",
          onSelect: async () => {
            const targetServer = invitableServers.find((server) => server.canInvite);
            if (!targetServer) {
              toastInfo("Davet için yetkili sunucu bulunamadı");
              return;
            }
            const invited = await inviteServerMember(targetServer.id, target.userId);
            if (invited) {
              await sendInviteAsDMMessage(target.conversationId, targetServer, invited.invite);
              toastSuccess("Davet gönderildi", targetServer.name);
            } else {
              const latestError = useChatStore.getState().error;
              toastError("Davet gönderilemedi", latestError ?? "Kullanıcı sunucuya davet edilemedi.");
            }
          }
        },
        {
          id: `profile-quick-ignore-${target.userId}`,
          label: isIgnored ? "Yok Saymayı Kaldır" : "Yok Say",
          onSelect: () => {
            setIgnoredUser(target.userId, !isIgnored);
            toastInfo(isIgnored ? "Yok sayma kaldırıldı" : "Kullanıcı yok sayıldı");
          }
        },
        {
          id: `profile-quick-block-${target.userId}`,
          label: isBlocked ? "Engeli Kaldır" : "Engelle",
          danger: !isBlocked,
          onSelect: () => requestBlockToggle(target, isBlocked)
        },
        {
          id: `profile-quick-report-${target.userId}`,
          label: "Kullanıcı Profilini Bildir",
          onSelect: () => {
            toastInfo("Rapor alındı", "Profil bildirimi kayıt altına alındı.");
          }
        },
        {
          id: `profile-quick-copy-${target.userId}`,
          label: "Kullanıcı ID'sini Kopyala",
          separatorBefore: true,
          onSelect: () => {
            void copyWithToast(toPublicID(target.userId), "Kullanıcı ID'si kopyalandı", "Kullanıcı ID'si kopyalanamadı");
          }
        }
      ];
    },
    [blockedUserIdSet, copyWithToast, ignoredUsers, inviteServerMember, invitableServers, requestBlockToggle, sendInviteAsDMMessage, setIgnoredUser]
  );

  useEffect(() => {
    if (!isMobileViewport) {
      setMobileRootTab("home");
      setMobileChatOpen(false);
      return;
    }
    if (!selectedConversation && !selectedServer) {
      setMobileChatOpen(false);
    }
  }, [isMobileViewport, selectedConversation, selectedServer]);

  useEffect(() => {
    if (mobileRootTab !== "search") {
      return;
    }
    window.requestAnimationFrame(() => {
      mobileSearchInputRef.current?.focus();
    });
  }, [mobileRootTab]);

  useEffect(() => {
    if (mobileRootTab !== "add-friend-username") {
      return;
    }
    window.requestAnimationFrame(() => {
      mobileAddFriendInputRef.current?.focus();
    });
  }, [mobileRootTab]);

  const mobileHasActiveConversation = !!selectedConversation || !!selectedServer;
  const mobileShowChatPanel = mobileRootTab === "home" && mobileChatOpen && mobileHasActiveConversation;
  const mobileRailServers = servers.slice(0, 10);
  const mobileFeaturedConversations = filteredConversations.slice(0, 3);
  const mobileCurrentUserPresence = currentUser ? resolvePresenceForUser(currentUser.id) : normalizePresenceState(undefined);
  const mobileBottomNavHidden =
    mobileKeyboardOpen || mobileShowChatPanel || mobileRootTab === "search" || mobileRootTab === "add-friend" || mobileRootTab === "add-friend-username";
  const mobileShellStyle = useMemo<CSSProperties>(
    () => ({
      ["--cw-mobile-keyboard-inset" as string]: `${mobileKeyboardInset}px`,
      ["--cw-mobile-viewport-height" as string]: `${Math.max(0, mobileViewportHeight)}px`
    }),
    [mobileKeyboardInset, mobileViewportHeight]
  );

  return (
    <div className="catwa-themed-app cw-workspace fixed inset-0">
      {isMobileViewport ? (
        <div
          className="cw-mobile-shell"
          data-keyboard-open={mobileKeyboardOpen ? "1" : "0"}
          data-nav-hidden={mobileBottomNavHidden ? "1" : "0"}
          style={mobileShellStyle}
        >
          {mobileRootTab === "home" ? (
            mobileShowChatPanel ? (
              <section className="cw-mobile-chat-view">
                <header className="cw-mobile-chat-topbar">
                  <button
                    className="cw-mobile-icon-btn"
                    onClick={() => {
                      setMobileChatOpen(false);
                    }}
                    type="button"
                  >
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <div className="min-w-0 flex-1">
                    {selectedServer ? (
                      <>
                        <p className="truncate text-xs text-slate-400">{selectedServer.name}</p>
                        <p className="truncate text-base font-semibold text-slate-100">#{selectedChannel?.name ?? "Kanal Seçilmedi"}</p>
                      </>
                    ) : selectedConversation ? (
                      <>
                        <p className="truncate text-base font-semibold text-slate-100">{selectedConversation.otherDisplayName}</p>
                        <p className="truncate text-xs text-slate-400">@{selectedConversation.otherUsername}</p>
                      </>
                    ) : null}
                  </div>
                  <button
                    className="cw-mobile-icon-btn"
                    onClick={() => setRightSidebarOpen((current) => !current)}
                    type="button"
                  >
                    <UserCircle2 className="h-5 w-5" />
                  </button>
                </header>

                <div className="cw-mobile-chat-content min-h-0 flex-1">
                  <ScreenShareStage
                    localSourceLabel={screenShareSourceLabel}
                    localTrack={localScreenShareTrack}
                    onChangeLocalShare={() => setScreenSharePickerOpen(true)}
                    onStopLocalShare={() => {
                      void stopScreenShare();
                    }}
                    remoteShares={remoteScreenShares}
                    resolveParticipantLabel={resolveParticipantLabel}
                  />

                  {selectedServer ? (
                    <div className="flex h-full min-h-0 flex-col">
                      <MessageList
                        activeConversationId={selectedChannel?.id ?? null}
                        conversationType="channel"
                        currentUser={currentUser}
                        emptyDescription="Bir metin kanalı seçerek yazışmaya başlayabilirsin."
                        emptyTitle="Metin Kanalı Seçilmedi"
                        loadingMessages={loadingMessages}
                        messages={selectedMessages}
                        onCopyMessageLink={(message) => {
                          void handleCopyMessageLink(message);
                        }}
                        onDeleteMessage={async (message) => {
                          setContextConfirm({
                            title: "Mesaj Silinsin mi?",
                            description: "Bu mesajı silmek istiyor musun?",
                            confirmLabel: "Sil",
                            onConfirm: async () => {
                              await deleteMessage(message.id);
                            }
                          });
                        }}
                        onEditMessage={async (message, content) => {
                          await editMessage(message.id, content);
                        }}
                        onForwardMessage={(message) => {
                          void handleForwardMessage(message);
                        }}
                        onMarkUnreadMessage={(message) => {
                          markConversationUnread(message.conversationId);
                        }}
                        onReplyMessage={(message) => {
                          setReplyTarget(message);
                          if (!draft.trim()) {
                            setDraft(`@${message.senderUsername} `);
                          }
                        }}
                        resolveSenderMeta={resolveMessageSenderMeta}
                        resolveSenderName={(message) => (message.senderId === currentUser?.id ? "Sen" : `@${message.senderUsername}`)}
                        typingText=""
                      />

                      <MessageComposer
                        draft={draft}
                        enabled={!!selectedChannel}
                        error={error}
                        onDraftChange={setDraft}
                        onSubmit={submitCurrentMessage}
                        onSubmitWithFiles={submitCurrentMessageWithFiles}
                        onTypingStart={() => {}}
                        onTypingStop={() => {}}
                        onCancelReply={() => setReplyTarget(null)}
                        replyPreview={
                          replyTarget
                            ? {
                                sender: `@${replyTarget.senderUsername}`,
                                content: replyTarget.content
                              }
                            : null
                        }
                        sending={sendingMessage}
                      />
                    </div>
                  ) : selectedConversation ? (
                    <div className="flex h-full min-h-0 flex-col">
                      <MessageList
                        activeConversationId={selectedConversation.conversationId}
                        conversationType="dm"
                        currentUser={currentUser}
                        emptyDescription="Bu sohbette henüz mesaj yok."
                        emptyTitle="Sohbet seçilmedi"
                        loadingMessages={loadingMessages}
                        messages={selectedMessages}
                        onCopyMessageLink={(message) => {
                          void handleCopyMessageLink(message);
                        }}
                        onDeleteMessage={async (message) => {
                          setContextConfirm({
                            title: "Mesaj Silinsin mi?",
                            description: "Bu mesajı silmek istiyor musun?",
                            confirmLabel: "Sil",
                            onConfirm: async () => {
                              await deleteMessage(message.id);
                            }
                          });
                        }}
                        onEditMessage={async (message, content) => {
                          await editMessage(message.id, content);
                        }}
                        onForwardMessage={(message) => {
                          void handleForwardMessage(message);
                        }}
                        onMarkUnreadMessage={(message) => {
                          markConversationUnread(message.conversationId);
                        }}
                        onReplyMessage={(message) => {
                          setReplyTarget(message);
                          if (!draft.trim()) {
                            setDraft(`@${message.senderUsername} `);
                          }
                        }}
                        resolveSenderMeta={resolveMessageSenderMeta}
                        resolveSenderName={(message) => (message.senderId === currentUser?.id ? "Sen" : selectedConversation.otherDisplayName)}
                        isDMConversationWithFriend={selectedConversationIsFriend}
                        showTyping
                        typingText={typingText}
                      />

                      <MessageComposer
                        draft={draft}
                        enabled={!!selectedConversation}
                        error={error}
                        onDraftChange={setDraft}
                        onSubmit={submitCurrentMessage}
                        onSubmitWithFiles={submitCurrentMessageWithFiles}
                        onTypingStart={sendTypingStart}
                        onTypingStop={sendTypingStop}
                        onCancelReply={() => setReplyTarget(null)}
                        replyPreview={
                          replyTarget
                            ? {
                                sender: `@${replyTarget.senderUsername}`,
                                content: replyTarget.content
                              }
                            : null
                        }
                        sending={sendingMessage}
                      />
                    </div>
                  ) : null}
                </div>
              </section>
            ) : (
              <section className="cw-mobile-home-view">
                <header className="cw-mobile-home-header">
                  <h1>Messages</h1>
                  <button
                    className="cw-mobile-icon-btn"
                    onClick={() => setInboxOpen(true)}
                    type="button"
                  >
                    <Bell className="h-5 w-5" />
                  </button>
                </header>

                <div className="cw-mobile-search-row">
                  <button
                    className="cw-mobile-search-icon-btn"
                    onClick={focusGlobalSearch}
                    type="button"
                  >
                    <Search className="h-5 w-5" />
                  </button>
                  <label className="cw-mobile-search-field">
                    <input
                      className="cw-mobile-search-input"
                      onClick={openMobileSearch}
                      onFocus={openMobileSearch}
                      placeholder="Sohbet bul ya da başlat"
                      ref={globalSearchInputRef}
                      readOnly
                      value={mobileSearchQuery || globalSearch}
                    />
                  </label>
                  <button
                    className="cw-mobile-chip-btn"
                    onClick={openMobileAddFriend}
                    type="button"
                  >
                    <Plus className="h-4 w-4" />
                    Add Friends
                  </button>
                </div>

                <div className="cw-mobile-main-grid">
                  <aside className="cw-mobile-rail">
                    <button
                      className={`cw-mobile-rail-btn ${selectedServerId ? "" : "is-active"}`}
                      onClick={() => {
                        void openFriendsHome();
                      }}
                      type="button"
                    >
                      <House className="h-5 w-5" />
                    </button>
                    {mobileRailServers.map((server) => (
                      <button
                        className={`cw-mobile-rail-btn ${server.id === selectedServerId ? "is-active" : ""}`}
                        key={`mobile-rail-${server.id}`}
                        onClick={() => handleSelectServerFromRail(server.id)}
                        title={server.name}
                        type="button"
                      >
                        {displayInitials(server.name, server.name)}
                      </button>
                    ))}
                    <button
                      className="cw-mobile-rail-btn"
                      onClick={() => {
                        void handleCreateServer();
                      }}
                      type="button"
                    >
                      <Plus className="h-5 w-5" />
                    </button>
                  </aside>

                  <div className="cw-mobile-conversation-pane">
                    {selectedServer ? (
                      <>
                        <div className="cw-mobile-pane-head">
                          <div>
                            <h2>{selectedServer.name}</h2>
                            <p>Metin kanalları</p>
                          </div>
                          <button
                            className="cw-mobile-pane-switch"
                            onClick={() => {
                              void openFriendsHome();
                            }}
                            type="button"
                          >
                            DM
                          </button>
                        </div>

                        <div className="cw-mobile-channel-list">
                          {selectedChannels.map((channel) => (
                            <button
                              className={`cw-mobile-channel-item ${channel.id === selectedChannelID ? "is-active" : ""}`}
                              key={`mobile-channel-${channel.id}`}
                              onClick={() => handleSelectChannel(channel.id)}
                              type="button"
                            >
                              <span>#{channel.name}</span>
                            </button>
                          ))}
                          {selectedChannels.length === 0 ? (
                            <p className="cw-mobile-muted-text">Bu sunucuda henüz metin kanalı yok.</p>
                          ) : null}
                        </div>
                      </>
                    ) : (
                      <>
                        {mobileFeaturedConversations.length > 0 ? (
                          <div className="cw-mobile-story-row">
                            {mobileFeaturedConversations.map((conversation) => {
                              const avatar = resolveAvatarURL(conversation.otherAvatarPath);
                              return (
                                <button
                                  className="cw-mobile-story-card"
                                  key={`mobile-feature-${conversation.conversationId}`}
                                  onClick={() => handleSelectConversation(conversation.conversationId)}
                                  type="button"
                                >
                                  <div
                                    className="cw-mobile-story-avatar"
                                    style={{ backgroundColor: avatarTone(conversation.otherUserId || conversation.otherUsername) }}
                                  >
                                    {avatar ? (
                                      <img alt={`${conversation.otherDisplayName} avatar`} src={avatar} />
                                    ) : (
                                      displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                                    )}
                                  </div>
                                  <div className="cw-mobile-story-meta">
                                    <strong>{conversation.otherDisplayName}</strong>
                                    <span>{conversation.lastMessage || "Mesaj yok"}</span>
                                  </div>
                                  <span className="cw-mobile-story-audio">
                                    <Volume2 className="h-4 w-4" />
                                  </span>
                                </button>
                              );
                            })}
                          </div>
                        ) : null}

                        <div className="cw-mobile-pane-head cw-mobile-pane-head--spaced">
                          <h2>Direkt Mesajlar</h2>
                          <span className="cw-mobile-conversation-count">{filteredConversations.length}</span>
                        </div>

                        <div className="cw-mobile-dm-list cw-mobile-dm-list--flush">
                          {filteredConversations.map((conversation) => {
                            const avatar = resolveAvatarURL(conversation.otherAvatarPath);
                            const unreadCount = unreadByDM[conversation.conversationId] ?? 0;
                            const presence = resolvePresenceForUser(conversation.otherUserId);
                            return (
                              <button
                                className={`cw-mobile-dm-item ${conversation.conversationId === selectedDMID ? "is-active" : ""}`}
                                key={`mobile-dm-${conversation.conversationId}`}
                                onClick={() => handleSelectConversation(conversation.conversationId)}
                                type="button"
                              >
                                <div
                                  className="cw-mobile-avatar"
                                  style={{ backgroundColor: avatarTone(conversation.otherUserId || conversation.otherUsername) }}
                                >
                                  {avatar ? (
                                    <img alt={`${conversation.otherDisplayName} avatar`} src={avatar} />
                                  ) : (
                                    displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                                  )}
                                  <span className={`cw-mobile-avatar-dot ${presenceDotClass(presence)}`} />
                                </div>

                                <div className="cw-mobile-dm-meta">
                                  <div className="cw-mobile-dm-top">
                                    <strong>{conversation.otherDisplayName}</strong>
                                    <span>{conversation.lastMessageAt ? formatClock(conversation.lastMessageAt) : ""}</span>
                                  </div>
                                  <p>{conversation.lastMessage || "Henüz mesaj yok."}</p>
                                </div>

                                {unreadCount > 0 ? <span className="cw-mobile-unread">{unreadCount}</span> : null}
                              </button>
                            );
                          })}
                          {filteredConversations.length === 0 ? <p className="cw-mobile-muted-text">Eşleşen konuşma bulunamadı.</p> : null}
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <button
                  className="cw-mobile-fab"
                  onClick={openMobileAddFriend}
                  type="button"
                >
                  <Plus className="h-6 w-6" />
                </button>
              </section>
            )
          ) : mobileRootTab === "search" ? (
            <section className="cw-mobile-search-view">
              <header className="cw-mobile-search-head">
                <button
                  className="cw-mobile-icon-btn"
                  onClick={() => setMobileRootTab("home")}
                  type="button"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <label className="cw-mobile-search-head-field">
                  <Search className="h-5 w-5" />
                  <input
                    className="cw-mobile-search-head-input"
                    onChange={(event) => {
                      const next = event.target.value;
                      setMobileSearchQuery(next);
                      setGlobalSearch(next);
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter") {
                        return;
                      }
                      const normalized = mobileSearchQuery.trim();
                      if (!normalized) {
                        return;
                      }
                      pushMobileSearchHistory({
                        id: `query:${normalized.toLocaleLowerCase("tr-TR")}`,
                        kind: "query",
                        label: normalized
                      });
                    }}
                    placeholder="Ara"
                    ref={mobileSearchInputRef}
                    value={mobileSearchQuery}
                  />
                </label>
                <button className="cw-mobile-icon-btn" type="button">
                  <SlidersHorizontal className="h-5 w-5" />
                </button>
              </header>

              <div className="cw-mobile-search-tabs">
                <button className="is-active" type="button">
                  Yeni
                </button>
                <button type="button">Kişiler</button>
                <button type="button">Medya</button>
                <button type="button">Sabitlemeler</button>
                <button type="button">Bağlantılar</button>
              </div>

              <div className="cw-mobile-search-list">
                <div className="cw-mobile-search-section-head">
                  <h3>Geçmişte Ara</h3>
                  <button onClick={clearMobileSearchHistory} type="button">
                    Tümünü temizle
                  </button>
                </div>

                {mobileSearchHistory.length === 0 ? (
                  <p className="cw-mobile-muted-text">Henüz arama geçmişin yok.</p>
                ) : (
                  <div className="cw-mobile-search-result-list">
                    {mobileSearchHistory.map((entry) => {
                      const avatar = entry.avatarPath ? resolveAvatarURL(entry.avatarPath) : null;
                      return (
                        <article className="cw-mobile-search-result-item" key={entry.id}>
                          <button
                            className="cw-mobile-search-result-main"
                            onClick={() => {
                              void handleMobileSelectSearchHistoryItem(entry);
                            }}
                            type="button"
                          >
                            <span className="cw-mobile-search-result-icon">
                              {entry.kind === "user" ? (
                                avatar ? (
                                  <img alt={entry.label} src={avatar} />
                                ) : (
                                  <UserCircle2 className="h-5 w-5" />
                                )
                              ) : (
                                <Search className="h-5 w-5" />
                              )}
                            </span>
                            <span className="cw-mobile-search-result-meta">
                              <strong>{entry.label}</strong>
                              {entry.subtitle ? <small>{entry.subtitle}</small> : null}
                            </span>
                          </button>
                          <button
                            className="cw-mobile-search-result-remove"
                            onClick={() => removeMobileSearchHistoryItem(entry.id)}
                            type="button"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </article>
                      );
                    })}
                  </div>
                )}

                <div className="cw-mobile-search-section-head">
                  <h3>Önerilen</h3>
                </div>

                <div className="cw-mobile-search-result-list">
                  {mobileSearchConversationResults.map((conversation) => {
                    const avatar = resolveAvatarURL(conversation.otherAvatarPath);
                    return (
                      <button
                        className="cw-mobile-search-result-user"
                        key={`mobile-search-conversation-${conversation.conversationId}`}
                        onClick={() => {
                          pushMobileSearchHistory({
                            id: `user:${conversation.otherUserId}`,
                            kind: "user",
                            label: conversation.otherDisplayName,
                            subtitle: conversation.otherUsername,
                            userId: conversation.otherUserId,
                            username: conversation.otherUsername,
                            avatarPath: conversation.otherAvatarPath
                          });
                          handleSelectConversation(conversation.conversationId);
                        }}
                        type="button"
                      >
                        <span className="cw-mobile-avatar">
                          {avatar ? (
                            <img alt={`${conversation.otherDisplayName} avatar`} src={avatar} />
                          ) : (
                            displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                          )}
                        </span>
                        <span className="cw-mobile-search-result-meta">
                          <strong>{conversation.otherDisplayName}</strong>
                          <small>@{conversation.otherUsername}</small>
                        </span>
                      </button>
                    );
                  })}
                  {mobileSuggestedUsers.map((item) => {
                    const avatar = resolveAvatarURL(item.avatarPath);
                    return (
                      <button
                        className="cw-mobile-search-result-user"
                        key={`mobile-search-user-${item.id}`}
                        onClick={() => {
                          void (async () => {
                            await createDM(item.id);
                            pushMobileSearchHistory({
                              id: `user:${item.id}`,
                              kind: "user",
                              label: item.displayName,
                              subtitle: item.username,
                              userId: item.id,
                              username: item.username,
                              avatarPath: item.avatarPath
                            });
                            setMobileRootTab("home");
                            setMobileChatOpen(true);
                          })();
                        }}
                        type="button"
                      >
                        <span className="cw-mobile-avatar">
                          {avatar ? (
                            <img alt={`${item.displayName} avatar`} src={avatar} />
                          ) : (
                            displayInitials(item.displayName, item.username)
                          )}
                        </span>
                        <span className="cw-mobile-search-result-meta">
                          <strong>{item.displayName}</strong>
                          <small>@{item.username}</small>
                        </span>
                      </button>
                    );
                  })}
                  {mobileSearchQuery.trim() && !userSearchLoading && mobileSearchConversationResults.length === 0 && mobileSuggestedUsers.length === 0 ? (
                    <p className="cw-mobile-muted-text">Sonuç bulunamadı.</p>
                  ) : null}
                </div>
              </div>
            </section>
          ) : mobileRootTab === "add-friend" ? (
            <section className="cw-mobile-add-friend-view">
              <header className="cw-mobile-add-friend-head">
                <button
                  className="cw-mobile-icon-btn"
                  onClick={() => setMobileRootTab("home")}
                  type="button"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1>Arkadaş Ekle</h1>
              </header>

              <div className="cw-mobile-share-row">
                <button
                  onClick={() => {
                    const shareUrl = "https://catwa.chat";
                    if (navigator.share) {
                      void navigator.share({ title: "Catwa", text: "Catwa'ya katıl", url: shareUrl }).catch(() => {
                        // no-op
                      });
                      return;
                    }
                    void copyText(shareUrl).then((ok) => {
                      if (ok) {
                        toastSuccess("Davet bağlantısı kopyalandı");
                      }
                    });
                  }}
                  type="button"
                >
                  <Plus className="h-5 w-5" />
                  <span>Davet Paylaş</span>
                </button>
                <button
                  onClick={() => {
                    void copyText("https://catwa.chat").then((ok) => {
                      if (ok) {
                        toastSuccess("Bağlantı kopyalandı");
                      }
                    });
                  }}
                  type="button"
                >
                  <Link2 className="h-5 w-5" />
                  <span>Bağlantıyı Kopyala</span>
                </button>
                <button type="button">
                  <MessageCircle className="h-5 w-5" />
                  <span>Mesajlar</span>
                </button>
                <button type="button">
                  <Mail className="h-5 w-5" />
                  <span>E-posta</span>
                </button>
              </div>

              <button className="cw-mobile-add-friend-entry" onClick={openMobileAddFriendByUsername} type="button">
                <span className="cw-mobile-add-friend-entry-icon">
                  <AtSign className="h-5 w-5" />
                </span>
                <span className="cw-mobile-add-friend-entry-text">Kullanıcı adıyla ekle</span>
                <span className="cw-mobile-add-friend-entry-arrow">›</span>
              </button>

              <article className="cw-mobile-add-friend-card">
                <div className="cw-mobile-add-friend-card-visual">✨</div>
                <h2>Arkadaşlarını bul</h2>
                <p>Rehberdeki kişileri eşitleyerek Catwa'da arkadaşlarını bulabilirsin.</p>
                <button type="button">Find friends</button>
              </article>
            </section>
          ) : mobileRootTab === "add-friend-username" ? (
            <section className="cw-mobile-add-friend-username-view">
              <header className="cw-mobile-add-friend-head">
                <button
                  className="cw-mobile-icon-btn"
                  onClick={() => setMobileRootTab("add-friend")}
                  type="button"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <h1>Kullanıcı adıyla ekle</h1>
              </header>

              <form
                className="cw-mobile-add-friend-username-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleMobileSendFriendRequestByUsername();
                }}
              >
                <p>Arkadaşın olarak kimi eklemek istersin?</p>
                <label className="cw-mobile-add-friend-username-field">
                  <input
                    onChange={(event) => setMobileAddFriendUsername(event.target.value)}
                    placeholder="Bir kullanıcı adı gir"
                    ref={mobileAddFriendInputRef}
                    value={mobileAddFriendUsername}
                  />
                </label>
                <small>
                  Bu arada senin kullanıcı adın <strong>{currentUser?.username ?? "unknown"}</strong>.
                </small>
                <button disabled={!mobileAddFriendUsername.trim() || mobileSendingFriendRequestByUsername} type="submit">
                  {mobileSendingFriendRequestByUsername ? "Gönderiliyor..." : "Arkadaşlık İsteği Gönder"}
                </button>
              </form>
            </section>
          ) : mobileRootTab === "notifications" ? (
            <section className="cw-mobile-notifications-view">
              <header className="cw-mobile-home-header">
                <h1>Bildirimler</h1>
                <button className="cw-mobile-icon-btn" onClick={() => setInboxOpen(true)} type="button">
                  <Bell className="h-5 w-5" />
                </button>
              </header>
              <div className="cw-mobile-notification-list">
                {inboxNotifications.length === 0 && inboxUnreadItems.length === 0 ? (
                  <p className="cw-mobile-muted-text">Yeni bildirim yok.</p>
                ) : null}
                {inboxNotifications.map((notification) => (
                  <article className="cw-mobile-notification-item" key={`mobile-notify-${notification.id}`}>
                    <h3>{notification.title}</h3>
                    <p>{notification.description}</p>
                  </article>
                ))}
                {inboxUnreadItems.map((item) => (
                  <article className="cw-mobile-notification-item" key={`mobile-unread-${item.conversationId}`}>
                    <h3>{item.displayName}</h3>
                    <p>{item.lastMessage || "Yeni mesajın var."}</p>
                    <span>{item.unreadCount} okunmamış</span>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="cw-mobile-profile-view">
              <header className="cw-mobile-home-header">
                <h1>Sen</h1>
              </header>
              <article className="cw-mobile-profile-card">
                <div className="cw-mobile-profile-head">
                  <div className="cw-mobile-profile-avatar">
                    {resolveAvatarURL(currentUser?.avatarPath) ? (
                      <img alt={`${currentUser?.displayName ?? "Kullanıcı"} avatar`} src={resolveAvatarURL(currentUser?.avatarPath) ?? ""} />
                    ) : (
                      displayInitials(currentUser?.displayName ?? "Kullanıcı", currentUser?.username ?? "me")
                    )}
                    <span className={`cw-mobile-avatar-dot ${presenceDotClass(mobileCurrentUserPresence)}`} />
                  </div>
                  <div className="cw-mobile-profile-meta">
                    <h2>{currentUser?.displayName ?? "Kullanıcı"}</h2>
                    <p>@{currentUser?.username ?? "unknown"}</p>
                  </div>
                </div>
                <p className="cw-mobile-profile-bio">{currentUser?.bio?.trim() || "Profil bilgini ekleyerek hesabını tamamlayabilirsin."}</p>
                <button
                  className="cw-mobile-chip-btn"
                  onClick={() => openSettings("account")}
                  type="button"
                >
                  Profili Düzenle
                </button>
              </article>
            </section>
          )}

          {!mobileBottomNavHidden ? (
            <nav className="cw-mobile-bottom-nav">
              <button
                className={`cw-mobile-tab-btn ${mobileRootTab === "home" ? "is-active" : ""}`}
                onClick={() => {
                  setMobileRootTab("home");
                }}
                type="button"
              >
                <House className="h-5 w-5" />
                <span>Ana Sayfa</span>
              </button>
              <button
                className={`cw-mobile-tab-btn ${mobileRootTab === "notifications" ? "is-active" : ""}`}
                onClick={() => {
                  setMobileRootTab("notifications");
                  setMobileChatOpen(false);
                }}
                type="button"
              >
                <Bell className="h-5 w-5" />
                <span>Bildirimler</span>
              </button>
              <button
                className={`cw-mobile-tab-btn ${mobileRootTab === "profile" ? "is-active" : ""}`}
                onClick={() => {
                  setMobileRootTab("profile");
                  setMobileChatOpen(false);
                }}
                type="button"
              >
                <UserCircle2 className="h-5 w-5" />
                <span>Sen</span>
              </button>
            </nav>
          ) : null}
        </div>
      ) : null}

      {!isMobileViewport ? (
      <AppShell
        compactMode={compactMode}
        topBar={
          <WindowTitleBar
            context={windowContext.context}
            inboxCount={inboxCount}
            onOpenInbox={(anchorRect) => {
              setInboxAnchorRect(anchorRect);
              setInboxOpen(true);
            }}
            subtitle={windowContext.subtitle}
            title={windowContext.title}
            wsConnected={wsConnected}
          />
        }
        main={
          <div className="flex h-full min-h-0 flex-col">
            <ChatHeader
              conversation={selectedConversation}
              friendsTab={activeFriendsTab}
              onFriendsTabChange={handleFriendsTabChange}
              onOpenPinned={() => setPinnedModalOpen(true)}
              onToggleRightSidebar={() => setRightSidebarOpen((current) => !current)}
              presence={selectedConversation ? resolvePresenceForUser(selectedConversation.otherUserId) : undefined}
              rightSidebarOpen={rightSidebarOpen}
              selectedChannelName={selectedChannel?.name}
              selectedServerName={selectedServer?.name}
            />

            <ScreenShareStage
              localSourceLabel={screenShareSourceLabel}
              localTrack={localScreenShareTrack}
              onChangeLocalShare={() => setScreenSharePickerOpen(true)}
              onStopLocalShare={() => {
                void stopScreenShare();
              }}
              remoteShares={remoteScreenShares}
              resolveParticipantLabel={resolveParticipantLabel}
            />

            {selectedServer ? (
              <>
                <MessageList
                  activeConversationId={selectedChannel?.id ?? null}
                  conversationType="channel"
                  currentUser={currentUser}
                  emptyDescription="Sol panelden bir metin kanalı seçerek sunucu sohbetine katıl."
                  emptyTitle="Metin Kanalı Seçilmedi"
                  loadingMessages={loadingMessages}
                  messages={selectedMessages}
                  onCopyMessageLink={(message) => {
                    void handleCopyMessageLink(message);
                  }}
                  onDeleteMessage={async (message) => {
                    setContextConfirm({
                      title: "Mesaj Silinsin mi?",
                      description: "Bu mesajı silmek istiyor musun?",
                      confirmLabel: "Sil",
                      onConfirm: async () => {
                        await deleteMessage(message.id);
                      }
                    });
                  }}
                  onEditMessage={async (message, content) => {
                    await editMessage(message.id, content);
                  }}
                  onForwardMessage={(message) => {
                    void handleForwardMessage(message);
                  }}
                  onMarkUnreadMessage={(message) => {
                    markConversationUnread(message.conversationId);
                  }}
                  onReplyMessage={(message) => {
                    setReplyTarget(message);
                    if (!draft.trim()) {
                      setDraft(`@${message.senderUsername} `);
                    }
                  }}
                  resolveSenderMeta={resolveMessageSenderMeta}
                  resolveSenderName={(message) => (message.senderId === currentUser?.id ? "Sen" : `@${message.senderUsername}`)}
                  typingText=""
                />

                <MessageComposer
                  draft={draft}
                  enabled={!!selectedChannel}
                  error={error}
                  onDraftChange={setDraft}
                  onSubmit={submitCurrentMessage}
                  onSubmitWithFiles={submitCurrentMessageWithFiles}
                  onTypingStart={() => {
                    // Sunucu kanallarında typing event henüz gösterilmiyor.
                  }}
                  onTypingStop={() => {
                    // Sunucu kanallarında typing event henüz gösterilmiyor.
                  }}
                  onCancelReply={() => setReplyTarget(null)}
                  replyPreview={
                    replyTarget
                      ? {
                          sender: `@${replyTarget.senderUsername}`,
                          content: replyTarget.content
                        }
                      : null
                  }
                  sending={sendingMessage}
                />
              </>
            ) : selectedConversation ? (
              <>
                <MessageList
                  activeConversationId={selectedConversation.conversationId}
                  conversationType="dm"
                  currentUser={currentUser}
                  emptyDescription="Sol panelden bir DM seçerek gerçek zamanlı mesaja başlayabilirsin."
                  emptyTitle="Sohbet seçilmedi"
                  loadingMessages={loadingMessages}
                  messages={selectedMessages}
                  onCopyMessageLink={(message) => {
                    void handleCopyMessageLink(message);
                  }}
                  onDeleteMessage={async (message) => {
                    setContextConfirm({
                      title: "Mesaj Silinsin mi?",
                      description: "Bu mesajı silmek istiyor musun?",
                      confirmLabel: "Sil",
                      onConfirm: async () => {
                        await deleteMessage(message.id);
                      }
                    });
                  }}
                  onEditMessage={async (message, content) => {
                    await editMessage(message.id, content);
                  }}
                  onForwardMessage={(message) => {
                    void handleForwardMessage(message);
                  }}
                  onMarkUnreadMessage={(message) => {
                    markConversationUnread(message.conversationId);
                  }}
                  onReplyMessage={(message) => {
                    setReplyTarget(message);
                    if (!draft.trim()) {
                      setDraft(`@${message.senderUsername} `);
                    }
                  }}
                  resolveSenderMeta={resolveMessageSenderMeta}
                  resolveSenderName={(message) => (message.senderId === currentUser?.id ? "Sen" : selectedConversation.otherDisplayName)}
                  isDMConversationWithFriend={selectedConversationIsFriend}
                  showTyping
                  typingText={typingText}
                />

                <MessageComposer
                  draft={draft}
                  enabled={!!selectedConversation}
                  error={error}
                  onDraftChange={setDraft}
                  onSubmit={submitCurrentMessage}
                  onSubmitWithFiles={submitCurrentMessageWithFiles}
                  onTypingStart={sendTypingStart}
                  onTypingStop={sendTypingStop}
                  onCancelReply={() => setReplyTarget(null)}
                  replyPreview={
                    replyTarget
                      ? {
                          sender: `@${replyTarget.senderUsername}`,
                          content: replyTarget.content
                        }
                      : null
                  }
                  sending={sendingMessage}
                />
              </>
            ) : (
              <FriendsHome
                activeTab={activeFriendsTab}
                conversations={visibleDMs}
                friends={friends}
                incomingRequests={friendRequestsIncoming}
                loadingFriends={loadingFriends}
                loadingRequests={loadingFriendRequests}
                sendingFriendRequest={sendingFriendRequest}
                onAcceptRequest={(requestID) => {
                  void acceptFriendRequest(requestID);
                }}
                onCancelRequest={(requestID) => {
                  const target = friendRequestsOutgoing.find((item) => item.id === requestID);
                  setContextConfirm({
                    title: "İsteği iptal et",
                    description: `${target?.displayName ?? "Bu kullanıcı"} için gönderdiğin arkadaşlık isteği iptal edilsin mi?`,
                    confirmLabel: "İptal Et",
                    onConfirm: async () => {
                      await rejectFriendRequest(requestID);
                    }
                  });
                }}
                onRejectRequest={(requestID) => {
                  const target = friendRequestsIncoming.find((item) => item.id === requestID);
                  setContextConfirm({
                    title: "İsteği reddet",
                    description: `${target?.displayName ?? "Bu kullanıcı"} tarafından gelen arkadaşlık isteği reddedilsin mi?`,
                    confirmLabel: "Reddet",
                    onConfirm: async () => {
                      await rejectFriendRequest(requestID);
                    }
                  });
                }}
                onRemoveFriend={(friendUserID) => {
                  const friend = friends.find((item) => item.userId === friendUserID);
                  setContextConfirm({
                    title: "Arkadaşı çıkar",
                    description: `${friend?.displayName ?? "Bu kullanıcı"} arkadaş listenden kaldırılacak.`,
                    confirmLabel: "Arkadaşı Çıkar",
                    onConfirm: async () => {
                      const ok = await removeFriend(friendUserID);
                      if (!ok) {
                        toastError("Arkadaş kaldırılamadı");
                      }
                    }
                  });
                }}
                onBlockUser={(friendUserID) => {
                  const friend = friends.find((item) => item.userId === friendUserID);
                  setContextConfirm({
                    title: "Kullanıcıyı engelle",
                    description: `${friend?.displayName ?? "Bu kullanıcı"} engellendiğinde DM ve arkadaşlık etkileşimi kısıtlanır.`,
                    confirmLabel: "Engelle",
                    onConfirm: async () => {
                      const ok = await blockUser(friendUserID);
                      if (!ok) {
                        toastError("Kullanıcı engellenemedi");
                      }
                    }
                  });
                }}
                onSendFriendRequestByUsername={async (username) => {
                  const normalized = username.trim();
                  if (!normalized) {
                    return false;
                  }

                  return new Promise<boolean>((resolve) => {
                    setContextConfirm({
                      title: "Arkadaşlık isteği gönder",
                      description: `@${normalized} kullanıcısına arkadaşlık isteği gönderilsin mi?`,
                      confirmLabel: "Gönder",
                      onCancel: () => resolve(false),
                      onConfirm: async () => {
                        const ok = await sendFriendRequestByUsername(normalized);
                        resolve(ok);
                      }
                    });
                  });
                }}
                onSelectConversation={handleSelectConversation}
                onStartDM={(userID) => {
                  void createDM(userID);
                }}
                onTabChange={handleFriendsTabChange}
                outgoingRequests={friendRequestsOutgoing}
                presenceByUser={resolvedPresenceByUser}
              />
            )}
          </div>
        }
        rightSidebar={
          selectedServer ? (
            <ServerMembersSidebar
              currentUserId={currentUser?.id}
              loading={loadingServerMembers}
              members={selectedMembers}
              presenceByUser={resolvedPresenceByUser}
              onStartDM={(userId) => {
                void createDM(userId);
                setRightSidebarOpen(false);
              }}
            />
          ) : selectedConversation ? (
            <FriendProfileSidebar
              conversation={selectedConversation}
              ignored={!!ignoredUsers[selectedConversation.otherUserId]}
              isFriend={selectedConversationIsFriend}
              mutualFriendCount={selectedConversationIsFriend ? 1 : 0}
              mutualServerCount={selectedConversationMutualServerCount}
              note={userNotesById[selectedConversation.otherUserId]}
              onToggleFriend={() => {
                if (selectedConversationIsFriend) {
                  setContextConfirm({
                    title: "Arkadaşı çıkar",
                    description: `${selectedConversation.otherDisplayName} arkadaş listenden kaldırılacak.`,
                    confirmLabel: "Arkadaşı Çıkar",
                    onConfirm: async () => {
                      const ok = await removeFriend(selectedConversation.otherUserId);
                      if (!ok) {
                        toastError("Arkadaş kaldırılamadı");
                      }
                    }
                  });
                  return;
                }
                setContextConfirm({
                  title: "Arkadaşlık isteği gönder",
                  description: `${selectedConversation.otherDisplayName} kullanıcısına arkadaşlık isteği gönderilsin mi?`,
                  confirmLabel: "Gönder",
                  onConfirm: async () => {
                    const ok = await sendFriendRequest(selectedConversation.otherUserId);
                    if (!ok) {
                      toastError("Arkadaşlık isteği gönderilemedi");
                    }
                  }
                });
              }}
              onOpenFullProfile={() => setFullProfileConversationId(selectedConversation.conversationId)}
              presence={resolvePresenceForUser(selectedConversation.otherUserId)}
              quickActions={buildProfileQuickActions(selectedConversation)}
            />
          ) : (
            <RightSidebar
              buildConversationActions={buildConversationActions}
              conversations={visibleDMs}
              isConversationMuted={isConversationMuted}
              onSelectConversation={handleSelectConversation}
              presenceByUser={resolvedPresenceByUser}
              selectedConversationId={selectedDMID}
              userNotesById={userNotesById}
            />
          )
        }
        rightSidebarOpen={rightSidebarOpen}
        serverRail={
          <ServerRail
            appName={appName}
            creatingServer={creatingServer}
            currentUser={currentUser}
            onCreateServer={() => {
              void handleCreateServer();
            }}
            onServerMenuAction={(serverId, action) => {
              void handleServerMenuAction(serverId, action);
            }}
            onOpenHome={() => {
              void openFriendsHome();
            }}
            onSelectServer={(serverId) => {
              handleSelectServerFromRail(serverId);
            }}
            onToggleSidebar={() => {}}
            selectedServerId={selectedServerId}
            servers={servers}
            sidebarCollapsed={sidebarCollapsed}
          />
        }
        sidebar={
          <ConversationSidebar
            activeVoiceChannelId={activeVoiceChannelId}
            activeVoiceChannelSnapshot={activeVoiceChannelSnapshot}
            buildConversationActions={buildConversationActions}
            channels={selectedChannels}
            conversations={filteredConversations}
            creatingTextChannel={creatingTextChannel}
            creatingVoiceChannel={creatingVoiceChannel}
            footer={
              <UserPanel
                currentUser={currentUser}
                hasActiveVoiceChannel={!!activeVoiceChannelId}
                liveKitConnected={liveKitConnected}
                selfPresenceStatus={selfPresenceStatus}
                onChangeSelfPresenceStatus={setSelfPresenceStatus}
                onLogout={() => {
                  requestLogout(false);
                }}
                onOpenSettings={(section) => {
                  openSettings(section);
                }}
                onToggleMute={() => {
                  void toggleVoiceMute();
                }}
                onToggleDeafen={() => {
                  void toggleVoiceDeafen();
                }}
                voiceDeafened={voiceDeafened}
                voiceMuted={voiceMuted}
                wsConnected={wsConnected}
              />
            }
            globalSearch={globalSearch}
            loadingChannels={loadingChannels}
            loadingDMs={loadingDMs}
            sendingFriendRequest={sendingFriendRequest}
            loadingServers={loadingServers}
            loadingVoiceChannels={loadingVoiceChannels}
            liveKitConnected={liveKitConnected}
            onCreateDM={(userID) => {
              void createDM(userID);
              setGlobalSearch("");
            }}
            onSendFriendRequest={(userID) => {
              void sendFriendRequest(userID);
            }}
            onCreateServer={() => {
              void handleCreateServer();
            }}
            onCreateTextChannel={() => {
              void handleCreateTextChannel();
            }}
            onUpdateTextChannel={(channelID) => {
              void handleUpdateTextChannel(channelID);
            }}
            onCreateVoiceChannel={() => {
              void handleCreateVoiceChannel();
            }}
            onUpdateVoiceChannel={(channelID) => {
              void handleUpdateVoiceChannel(channelID);
            }}
            onDeleteVoiceChannel={(channelID) => {
              void handleDeleteVoiceChannel(channelID);
            }}
            onDeleteTextChannel={(channelID) => {
              void deleteTextChannel(channelID);
            }}
            onGlobalSearchChange={setGlobalSearch}
            onInviteToServer={(userID) => {
              if (selectedServerId) {
                void inviteServerMember(selectedServerId, userID);
              }
            }}
            onJoinVoice={(channelID) => {
              void joinVoiceChannel(channelID);
            }}
            onLeaveVoice={() => {
              void leaveVoiceChannel();
            }}
            onOpenFriends={() => {
              void openFriendsHome();
            }}
            onOpenServerSettings={() => setServerSettingsOpen(true)}
            onOpenScreenSharePicker={() => {
              setScreenSharePickerOpen(true);
            }}
            onRefreshVoice={() => {
              void loadVoiceChannels(selectedServerId ?? undefined);
            }}
            onSelectChannel={handleSelectChannel}
            onSelectConversation={handleSelectConversation}
            presenceByUser={resolvedPresenceByUser}
            selfUserId={currentUser?.id}
            searchInputRef={globalSearchInputRef}
            selectedChannelId={selectedChannelID}
            selectedConversationId={selectedServer ? null : selectedDMID}
            selectedServer={selectedServer}
            screenShareActive={screenShareActive}
            screenShareSourceLabel={screenShareSourceLabel}
            screenShareStarting={screenShareStarting}
            isConversationMuted={isConversationMuted}
            unreadByDM={unreadByDM}
            userNotesById={userNotesById}
            userSearchLoading={userSearchLoading}
            userSearchResults={userSearchResults}
            voiceChannels={voiceChannels}
            voiceConnecting={voiceConnecting}
            onStopScreenShare={() => {
              void stopScreenShare();
            }}
            wsConnected={wsConnected}
          />
        }
        sidebarCollapsed={sidebarCollapsed}
      />
      ) : null}

      <ScreenSharePickerModal
        defaultFPS={screenShareFPS}
        defaultIncludeSystemAudio={screenShareIncludeSystemAudio}
        defaultQuality={screenShareQuality}
        onClose={() => setScreenSharePickerOpen(false)}
        onPreferencesChange={(preferences) => {
          setScreenSharePreferences(preferences);
        }}
        onStart={async (payload) => startScreenShare(payload)}
        open={screenSharePickerOpen}
        starting={screenShareStarting}
      />

      <InboxModal
        anchorRect={inboxAnchorRect}
        incomingRequests={friendRequestsIncoming}
        incomingServerInvites={serverInvitesIncoming}
        notifications={inboxNotifications}
        onAcceptRequest={(requestId) => {
          void acceptFriendRequest(requestId);
        }}
        onAcceptServerInvite={(inviteId) => {
          void acceptServerInvite(inviteId);
        }}
        onClose={() => setInboxOpen(false)}
        onOpenConversation={(conversationId) => {
          setInboxOpen(false);
          setReplyTarget(null);
          setSearchTarget(null);
          void handleSelectConversation(conversationId);
        }}
        onRejectRequest={(requestId) => {
          void rejectFriendRequest(requestId);
        }}
        onRejectServerInvite={(inviteId) => {
          void rejectServerInvite(inviteId);
        }}
        open={inboxOpen}
        unreadItems={inboxUnreadItems}
      />

      <PinnedMessagesModal
        compactMode={compactMode}
        items={pinnedMessageItems}
        onClose={() => setPinnedModalOpen(false)}
        open={pinnedModalOpen}
        rightSidebarOpen={rightSidebarOpen}
      />

      <FriendProfileModal
        conversation={fullProfileConversation}
        ignored={fullProfileConversation ? !!ignoredUsers[fullProfileConversation.otherUserId] : false}
        isFriend={fullProfileConversationIsFriend}
        mutualFriendCount={fullProfileConversationIsFriend ? 1 : 0}
        mutualServerCount={fullProfileConversationMutualServerCount}
        note={fullProfileConversation ? userNotesById[fullProfileConversation.otherUserId] : undefined}
        onClose={() => setFullProfileConversationId(null)}
        onOpenSearch={() => {
          if (!fullProfileConversation) {
            return;
          }
          openConversationSearch({
            conversationId: fullProfileConversation.conversationId,
            userId: fullProfileConversation.otherUserId,
            username: fullProfileConversation.otherUsername,
            displayName: fullProfileConversation.otherDisplayName
          });
        }}
        open={!!fullProfileConversation}
        presence={fullProfileConversation ? resolvePresenceForUser(fullProfileConversation.otherUserId) : undefined}
      />

      <ConversationSearchModal
        conversationName={searchTarget?.displayName ?? "Konuşma"}
        messages={searchTarget ? messagesByDM[searchTarget.conversationId] ?? [] : []}
        onClose={() => setSearchTarget(null)}
        open={!!searchTarget}
      />

      <TextEditModal
        clearLabel="Notu Sil"
        description={`${noteEditorTarget?.displayName ?? "Kullanıcı"} için bu not sadece sana görünür.`}
        initialValue={noteEditorTarget ? userNotesById[noteEditorTarget.userId] ?? "" : ""}
        label="Kullanıcı Notu"
        onClear={() => {
          if (!noteEditorTarget) {
            return;
          }
          setUserNote(noteEditorTarget.userId, "");
          toastInfo("Not temizlendi");
          setNoteEditorTarget(null);
        }}
        onClose={() => setNoteEditorTarget(null)}
        onSubmit={(value) => {
          if (!noteEditorTarget) {
            return;
          }
          setUserNote(noteEditorTarget.userId, value);
          toastSuccess("Not kaydedildi");
          setNoteEditorTarget(null);
        }}
        open={!!noteEditorTarget}
        placeholder="Bu kullanıcı hakkında kısa not..."
        title="Notu Düzenle"
      />

      <TextEditModal
        clearLabel="Takma Adı Sıfırla"
        description="Arkadaş takma adı sadece senin görünümünde kullanılır."
        initialValue={nicknameEditorTarget ? friendNicknamesById[nicknameEditorTarget.userId] ?? "" : ""}
        label="Arkadaş Takma Adı"
        maxLength={64}
        onClear={() => {
          if (!nicknameEditorTarget) {
            return;
          }
          setFriendNickname(nicknameEditorTarget.userId, "");
          toastInfo("Takma ad kaldırıldı");
          setNicknameEditorTarget(null);
        }}
        onClose={() => setNicknameEditorTarget(null)}
        onSubmit={(value) => {
          if (!nicknameEditorTarget) {
            return;
          }
          setFriendNickname(nicknameEditorTarget.userId, value);
          toastSuccess("Arkadaş takma adı güncellendi");
          setNicknameEditorTarget(null);
        }}
        open={!!nicknameEditorTarget}
        placeholder="Örn: Oyun Partneri"
        title="Arkadaş Takma Adını Değiştir"
      />

      <ConfirmModal
        cancelLabel="Vazgeç"
        confirmLabel={contextConfirm?.confirmLabel ?? "Onayla"}
        description={contextConfirm?.description ?? ""}
        onClose={() => {
          if (contextConfirm?.onCancel) {
            contextConfirm.onCancel();
          }
          setContextConfirm(null);
        }}
        onConfirm={async () => {
          const pending = contextConfirm;
          setContextConfirm(null);
          if (!pending) {
            return;
          }
          await pending.onConfirm();
        }}
        open={!!contextConfirm}
        title={contextConfirm?.title ?? "Emin misin?"}
      />

      <InputPromptModal
        cancelLabel={inputPrompt?.cancelLabel}
        confirmLabel={inputPrompt?.confirmLabel}
        description={inputPrompt?.description}
        fields={inputPrompt?.fields ?? []}
        onClose={() => setInputPrompt(null)}
        onConfirm={async (values) => {
          const pending = inputPrompt;
          if (!pending) {
            return;
          }
          await pending.onConfirm(values);
        }}
        open={!!inputPrompt}
        title={inputPrompt?.title ?? "Bilgi Gir"}
      />

      <SettingsModal
        apiBaseURL={env.apiBaseUrl}
        appName={appName}
        compactMode={compactMode}
        currentUser={currentUser}
        error={error}
        initialSection={settingsInitialSection}
        wsBaseURL={env.wsBaseUrl}
        onClose={() => {
          if (settingsRouteControlled) {
            onRequestCloseSettings?.();
            return;
          }
          setSettingsOpen(false);
          setSettingsInitialSection(undefined);
        }}
        onClearError={clearError}
        onChangePassword={async (currentPassword, newPassword) => changePassword(currentPassword, newPassword)}
        onCompactModeChange={setCompactMode}
        onLogout={() => {
          requestLogout(true);
        }}
        onResetUI={resetUI}
        onUpdateProfile={async (input) => updateProfile(input)}
        friendPrivacySettings={friendPrivacySettings}
        blockedUsers={blockedUsers}
        loadingFriendPrivacy={loadingFriendPrivacy}
        loadingBlockedUsers={loadingBlockedUsers}
        updatingFriendPrivacy={updatingFriendPrivacy}
        onUpdateFriendPrivacy={async (patch) => updateFriendPrivacySettings(patch)}
        onUnblockUser={async (userID) => unblockUser(userID)}
        open={settingsOpen}
        passwordUpdating={passwordUpdating}
        profileUpdating={profileUpdating}
      />

      <ConfirmModal
        cancelLabel="Vazgeç"
        confirmLabel="Çıkış Yap"
        description="Oturumun kapatılacak ve giriş ekranına dönülecek."
        onClose={() => {
          setLogoutConfirmOpen(false);
          setLogoutRequestedFromSettings(false);
        }}
        onConfirm={async () => {
          setLogoutConfirmOpen(false);
          if (logoutRequestedFromSettings) {
            if (settingsRouteControlled) {
              onRequestCloseSettings?.();
            } else {
              setSettingsOpen(false);
            }
          }
          setLogoutRequestedFromSettings(false);
          await logout();
        }}
        open={logoutConfirmOpen}
        title="Çıkış yapmak istediğine emin misin?"
      />

      <ServerSettingsModal
        currentUserId={currentUser?.id}
        members={selectedMembers}
        onClose={() => setServerSettingsOpen(false)}
        onDeleteServer={async () => {
          if (!selectedServerId) {
            return;
          }
          setContextConfirm({
            title: "Sunucu Kalıcı Olarak Silinsin mi?",
            description: "Bu sunucuyu kalıcı olarak silmek istediğine emin misin?",
            confirmLabel: "Sil",
            onConfirm: async () => {
              const deleted = await deleteServer(selectedServerId);
              if (deleted) {
                setServerSettingsOpen(false);
              }
            }
          });
        }}
        onLeaveServer={async () => {
          if (!selectedServerId) {
            return;
          }
          setContextConfirm({
            title: "Sunucudan Ayrıl",
            description: "Bu sunucudan ayrılmak istiyor musun?",
            confirmLabel: "Ayrıl",
            onConfirm: async () => {
              const left = await leaveServer(selectedServerId);
              if (left) {
                setServerSettingsOpen(false);
              }
            }
          });
        }}
        onRemoveMember={async (userId) => {
          if (!selectedServerId) {
            return;
          }
          await removeServerMember(selectedServerId, userId);
          await loadServerMembers(selectedServerId);
        }}
        onUpdateMemberRole={async (userId, role) => {
          if (!selectedServerId) {
            return;
          }
          await updateServerMemberRole(selectedServerId, userId, role);
          await loadServerMembers(selectedServerId);
        }}
        channels={selectedChannels}
        voiceChannels={voiceChannels}
        onUpdateTextChannel={async (channelId, patch) => {
          await updateTextChannel(channelId, patch);
          if (selectedServerId) {
            await loadChannels(selectedServerId);
          }
        }}
        onDeleteTextChannel={async (channelId) => {
          await deleteTextChannel(channelId);
        }}
        onUpdateVoiceChannel={async (channelId, patch) => {
          await updateVoiceChannel(channelId, patch);
          if (selectedServerId) {
            await loadVoiceChannels(selectedServerId);
          }
        }}
        onDeleteVoiceChannel={async (channelId) => {
          await deleteVoiceChannel(channelId);
          if (selectedServerId) {
            await loadVoiceChannels(selectedServerId);
          }
        }}
        onUpdateName={async (name) => {
          if (!selectedServerId) {
            return;
          }
          const updated = await updateServerName(selectedServerId, name);
          if (updated) {
            await loadServers();
          }
        }}
        open={serverSettingsOpen}
        server={selectedServer}
      />
    </div>
  );
}





