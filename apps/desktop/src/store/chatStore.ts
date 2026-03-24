import { ParticipantEvent, Room, RoomEvent, type AudioCaptureOptions } from "livekit-client";
import { create } from "zustand";
import { Track, type LocalTrack, type LocalVideoTrack, type RemoteVideoTrack } from "livekit-client";
import { env } from "../lib/env";
import { clearAttachmentURLCache } from "../lib/attachmentAccess";
import { focusDesktopWindow, requestDesktopAttention, setDesktopBadgeCount } from "../lib/desktopBridge";
import { httpFetch } from "../lib/httpClient";
import { persistTokens, readStoredTokens } from "../lib/tokenStorage";
import { loadAppPreferences, UI_PREFERENCES_EVENT } from "../lib/uiPreferences";
import { isTauriDesktop } from "../lib/runtime";
import { buildMicrophoneConstraints, isEditableTarget, isPushToTalkHotkey } from "../lib/voiceVideoPreferences";
import {
  captureScreenShare,
  mapScreenShareError,
  stopCapturedTracks,
  type ScreenShareFPS,
  type ScreenShareQuality,
  type ScreenShareSelection
} from "../lib/mediaCaptureService";
import { normalizePresenceState, normalizePresenceStatus } from "../lib/presence";
import { useDMContextStore } from "./dmContextStore";
import { toastError, toastInfo, toastSuccess, toastWarning } from "./toastStore";
import { useVoiceAudioStore } from "./voiceAudioStore";
import type {
  AuthResponse,
  AuthTokens,
  BlockedUserItem,
  BlockedUsersResponse,
  Channel,
  ChannelsResponse,
  DeletedChannelResponse,
  CreateVoiceChannelRequest,
  CreateDMResponse,
  DMConversation,
  FriendItem,
  FriendRequestItem,
  FriendRequestsResponse,
  FriendsResponse,
  FriendPrivacySettings,
  FriendPrivacySettingsResponse,
  AcceptServerInviteResponse,
  InviteServerMemberResponse,
  Message,
  MessageReactionState,
  MessageStateResponse,
  PresenceStatus,
  PresenceState,
  RealtimeEnvelope,
  RealtimeFrame,
  SendFriendRequestResponse,
  ServerMember,
  ServerMembersResponse,
  ServerInviteItem,
  ServerInvitesResponse,
  ServerSummary,
  ServersResponse,
  UploadedAttachment,
  UpdateFriendPrivacySettingsRequest,
  UpdateVoiceChannelRequest,
  UpdateProfileRequest,
  ToggleMessagePinResponse,
  ToggleMessageReactionResponse,
  UserProfile,
  UserSearchItem,
  VoiceChannel,
  VoiceChannelsResponse,
  VoiceJoinResponse,
  VoiceMember,
  VoiceState,
  VoiceSpeakingEventPayload
} from "../types/chat";

type AppStatus = "booting" | "unauthenticated" | "authenticated";
type AuthMode = "login" | "register";

export type RemoteScreenShare = {
  key: string;
  participantId: string;
  participantName: string;
  trackSid: string;
  source: "screen" | "camera";
  track: RemoteVideoTrack;
};

export type StartScreenShareInput = {
  selection: ScreenShareSelection;
  quality?: ScreenShareQuality;
  fps?: ScreenShareFPS;
  includeSystemAudio?: boolean;
};

type ChatStore = {
  appStatus: AppStatus;
  authMode: AuthMode;
  authLoading: boolean;
  loadingDMs: boolean;
  loadingMessages: boolean;
  sendingMessage: boolean;
  wsConnected: boolean;
  error: string | null;
  profileUpdating: boolean;
  passwordUpdating: boolean;
  currentUser: UserProfile | null;
  tokens: AuthTokens | null;
  dms: DMConversation[];
  selectedDMId: string | null;
  selectedChannelId: string | null;
  unreadByDM: Record<string, number>;
  totalUnread: number;
  messagesByDM: Record<string, Message[]>;
  messagesByChannel: Record<string, Message[]>;
  typingByDM: Record<string, string[]>;
  presenceByUser: Record<string, PresenceState>;
  userSearchQuery: string;
  userSearchLoading: boolean;
  userSearchResults: UserSearchItem[];
  friends: FriendItem[];
  friendRequestsIncoming: FriendRequestItem[];
  friendRequestsOutgoing: FriendRequestItem[];
  friendPrivacySettings: FriendPrivacySettings;
  blockedUsers: BlockedUserItem[];
  loadingFriends: boolean;
  loadingFriendRequests: boolean;
  loadingFriendPrivacy: boolean;
  loadingBlockedUsers: boolean;
  sendingFriendRequest: boolean;
  updatingFriendPrivacy: boolean;
  blockingUser: boolean;
  servers: ServerSummary[];
  selectedServerId: string | null;
  channelsByServer: Record<string, Channel[]>;
  serverMembersByServer: Record<string, ServerMember[]>;
  serverInvitesIncoming: ServerInviteItem[];
  loadingServers: boolean;
  loadingChannels: boolean;
  loadingServerMembers: boolean;
  loadingServerInvites: boolean;
  creatingServer: boolean;
  creatingTextChannel: boolean;
  creatingVoiceChannel: boolean;
  voiceChannels: VoiceChannel[];
  loadingVoiceChannels: boolean;
  activeVoiceChannelId: string | null;
  activeVoiceChannelSnapshot: VoiceChannel | null;
  voiceMuted: boolean;
  voiceDeafened: boolean;
  voiceConnecting: boolean;
  liveKitConnected: boolean;
  screenShareStarting: boolean;
  screenShareActive: boolean;
  screenShareSourceKind: "application" | "screen" | "device" | null;
  screenShareSourceLabel: string | null;
  screenShareQuality: ScreenShareQuality;
  screenShareFPS: ScreenShareFPS;
  screenShareIncludeSystemAudio: boolean;
  localScreenShareTrack: LocalVideoTrack | null;
  remoteScreenShares: RemoteScreenShare[];
  initialize: () => Promise<void>;
  setAuthMode: (mode: AuthMode) => void;
  login: (emailOrUsername: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (email: string, username: string, password: string, turnstileToken?: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (input: UpdateProfileRequest) => Promise<boolean>;
  updateSelfPresenceStatus: (status: PresenceStatus) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  loadServers: () => Promise<void>;
  createServer: (name: string) => Promise<ServerSummary | null>;
  selectServer: (serverId: string | null) => Promise<void>;
  updateServerName: (serverId: string, name: string) => Promise<ServerSummary | null>;
  leaveServer: (serverId: string) => Promise<boolean>;
  deleteServer: (serverId: string) => Promise<boolean>;
  loadServerMembers: (serverId: string) => Promise<void>;
  updateServerMemberRole: (serverId: string, memberUserId: string, role: "admin" | "member") => Promise<ServerMember | null>;
  inviteServerMember: (serverId: string, userId: string) => Promise<InviteServerMemberResponse | null>;
  loadServerInvites: () => Promise<void>;
  acceptServerInvite: (inviteId: string) => Promise<boolean>;
  rejectServerInvite: (inviteId: string) => Promise<boolean>;
  removeServerMember: (serverId: string, memberUserId: string) => Promise<void>;
  loadChannels: (serverId: string) => Promise<void>;
  createTextChannel: (serverId: string, name: string, kind?: "text" | "announcement") => Promise<Channel | null>;
  updateTextChannel: (channelId: string, patch: { name?: string; kind?: "text" | "announcement" }) => Promise<Channel | null>;
  deleteTextChannel: (channelId: string) => Promise<boolean>;
  selectChannel: (channelId: string | null) => Promise<void>;
  loadDMs: () => Promise<void>;
  clearSelectedDM: () => void;
  clearUnreadForDM: (conversationId: string) => void;
  clearAllUnread: () => void;
  markConversationUnread: (conversationId: string) => void;
  selectDM: (conversationId: string) => Promise<void>;
  sendMessage: (content: string) => Promise<boolean>;
  sendMessageToConversation: (conversationType: "dm" | "channel", conversationId: string, content: string) => Promise<boolean>;
  sendMessageWithAttachments: (
    conversationType: "dm" | "channel",
    conversationId: string,
    content: string,
    files: File[]
  ) => Promise<boolean>;
  editMessage: (messageId: string, content: string) => Promise<boolean>;
  deleteMessage: (messageId: string) => Promise<boolean>;
  loadConversationMessageState: (
    conversationType: "dm" | "channel",
    conversationId: string
  ) => Promise<MessageStateResponse | null>;
  toggleMessagePin: (messageId: string) => Promise<boolean>;
  toggleMessageReaction: (messageId: string, emoji: string) => Promise<boolean>;
  searchUsers: (query: string) => Promise<void>;
  createDM: (userId: string) => Promise<void>;
  loadFriends: () => Promise<void>;
  loadFriendRequests: () => Promise<void>;
  loadFriendPrivacySettings: () => Promise<void>;
  updateFriendPrivacySettings: (patch: UpdateFriendPrivacySettingsRequest) => Promise<boolean>;
  loadBlockedUsers: () => Promise<void>;
  sendFriendRequest: (userId: string) => Promise<boolean>;
  sendFriendRequestByUsername: (username: string) => Promise<boolean>;
  acceptFriendRequest: (requestId: string) => Promise<boolean>;
  rejectFriendRequest: (requestId: string) => Promise<boolean>;
  removeFriend: (friendUserId: string) => Promise<boolean>;
  blockUser: (userId: string) => Promise<boolean>;
  unblockUser: (userId: string) => Promise<boolean>;
  sendTypingStart: () => void;
  sendTypingStop: () => void;
  loadVoiceChannels: (workspaceId?: string) => Promise<void>;
  createVoiceChannel: (req: CreateVoiceChannelRequest) => Promise<VoiceChannel | null>;
  updateVoiceChannel: (channelId: string, req: UpdateVoiceChannelRequest) => Promise<VoiceChannel | null>;
  deleteVoiceChannel: (channelId: string) => Promise<boolean>;
  joinVoiceChannel: (channelId: string) => Promise<void>;
  leaveVoiceChannel: () => Promise<void>;
  toggleVoiceMute: () => Promise<void>;
  toggleVoiceDeafen: () => Promise<void>;
  setScreenSharePreferences: (patch: {
    quality?: ScreenShareQuality;
    fps?: ScreenShareFPS;
    includeSystemAudio?: boolean;
  }) => void;
  startScreenShare: (input: StartScreenShareInput) => Promise<boolean>;
  stopScreenShare: (options?: { silent?: boolean }) => Promise<void>;
  clearError: () => void;
  connectRealtime: () => void;
};

type PendingSocketRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

let socket: WebSocket | null = null;
let subscribedDMRooms = new Set<string>();
let subscribedChannelRoom: string | null = null;
let subscribedServerRoom: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAfterMs = 2000;
let typingStopTimer: ReturnType<typeof setTimeout> | null = null;
let typingStartedRoom: string | null = null;
let userSearchRequestID = 0;
let socketRequestSequence = 0;
const pendingSocketRequests = new Map<string, PendingSocketRequest>();

let liveKitRoom: Room | null = null;
let liveKitChannelId: string | null = null;
let localSpeaking = false;
type RemoteAudioSource = "participant" | "screen-share";
type RemoteAudioEntry = {
  element: HTMLMediaElement;
  participantId: string;
  source: RemoteAudioSource;
};

const remoteAudioElements = new Map<string, RemoteAudioEntry>();
let notificationPermissionRequested = false;
let lastBadgeCount = -1;
let notificationAudioContext: AudioContext | null = null;
let notificationToneElement: HTMLAudioElement | null = null;
let notificationInteractionBridgeBound = false;
let lastNotificationSoundAt = 0;
let hadRealtimeConnection = false;
let wsDisconnectToastTimer: ReturnType<typeof setTimeout> | null = null;
let wsDisconnectToastShown = false;
let lastWSPreOpenRefreshAttemptAt = 0;
let applyLiveKitVoicePreferencesHook: (() => void) | null = null;
let pushToTalkPressed = false;
let pushToTalkHandlersBound = false;
let pushToTalkKeyDownHandler: ((event: KeyboardEvent) => void) | null = null;
let pushToTalkKeyUpHandler: ((event: KeyboardEvent) => void) | null = null;
let pushToTalkWindowBlurHandler: (() => void) | null = null;

if (typeof window !== "undefined") {
  useVoiceAudioStore.subscribe(() => {
    for (const entry of remoteAudioElements.values()) {
      entry.element.volume =
        Math.max(0, Math.min(1, (loadAppPreferences().voiceVideo.outputVolume ?? 100) / 100)) *
        (entry.source === "screen-share"
          ? useVoiceAudioStore.getState().streamVolume / 100
          : useVoiceAudioStore.getState().getParticipantVolume(entry.participantId) / 100);
    }
  });

  window.addEventListener(UI_PREFERENCES_EVENT, () => {
    for (const entry of remoteAudioElements.values()) {
      entry.element.volume =
        Math.max(0, Math.min(1, (loadAppPreferences().voiceVideo.outputVolume ?? 100) / 100)) *
        (entry.source === "screen-share"
          ? useVoiceAudioStore.getState().streamVolume / 100
          : useVoiceAudioStore.getState().getParticipantVolume(entry.participantId) / 100);
      const sinkTarget = entry.element as HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
      const outputDeviceId = loadAppPreferences().voiceVideo.outputDeviceId;
      if (outputDeviceId && outputDeviceId !== "default" && typeof sinkTarget.setSinkId === "function") {
        void sinkTarget.setSinkId(outputDeviceId).catch(() => {
          // noop
        });
      }
    }
    applyLiveKitVoicePreferencesHook?.();
  });

  bindNotificationInteractionBridge();
}
const WS_DISCONNECT_TOAST_DELAY_MS = 4500;
const WS_PREOPEN_REFRESH_COOLDOWN_MS = 15_000;
let localScreenShareTracks: LocalTrack[] = [];
let localScreenShareEndedHandler: ((this: MediaStreamTrack, ev: Event) => unknown) | null = null;
const remoteScreenShareTracks = new Map<string, RemoteScreenShare>();

const DEFAULT_FRIEND_PRIVACY_SETTINGS: FriendPrivacySettings = {
  allowEveryone: true,
  allowFriendsOfFriends: true,
  allowServerMembers: true,
  updatedAt: new Date(0).toISOString()
};

const INVITE_LINK_PATTERN = /https?:\/\/(?:www\.)?(?:discord\.gg|discord\.com\/invite|catwa\.chat\/invite)\/[^\s]+/gi;
const NOTIFICATION_TONE_DATA_URL =
  "data:audio/wav;base64,UklGRlQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTAAAAAA//8AAP//AAD//wAA//8AAP//AAD//wAA//8AAP//AAD//wAA";
const REACTIONS_CHANGED_EVENT_NAME = "catwa:reactions.changed";
const PINS_CHANGED_EVENT_NAME = "catwa:pins.changed";

type StoredReactionsByMessage = Record<string, MessageReactionState[]>;
type ReactionsChangedDetail = {
  conversationId: string;
  reactionsByMessage: StoredReactionsByMessage;
};
type PinsChangedDetail = {
  conversationId: string;
  pinnedMessageIds: string[];
};
type MessagePinRealtimePayload = {
  conversationType: "dm" | "channel";
  conversationId: string;
  messageId: string;
  pinned: boolean;
  userId: string;
  pinnedAt?: string;
};
type MessageReactionRealtimePayload = {
  conversationType: "dm" | "channel";
  conversationId: string;
  messageId: string;
  emoji: string;
  count: number;
  userId: string;
  active: boolean;
};

type NotificationPolicy = {
  helperEnabled: boolean;
  hideSounds: boolean;
  hideNotificationPreview: boolean;
  hidePersonalInfo: boolean;
  hideInviteLinks: boolean;
};

function getNotificationPolicy(): NotificationPolicy {
  const preferences = loadAppPreferences();
  const streamerEnabled = preferences.streamerMode.enabled;
  const helperEnabled = isTauriDesktop() ? preferences.windows.systemHelperEnabled : true;
  return {
    helperEnabled,
    hideSounds: streamerEnabled && preferences.streamerMode.hideSounds,
    hideNotificationPreview: streamerEnabled && preferences.streamerMode.hideNotificationPreview,
    hidePersonalInfo: streamerEnabled && preferences.streamerMode.hidePersonalInfo,
    hideInviteLinks: streamerEnabled && preferences.streamerMode.hideInviteLinks
  };
}

function sanitizeInviteLinks(input: string): string {
  return input.replace(INVITE_LINK_PATTERN, "[davet bağlantısı gizlendi]");
}

function getNotificationToneElement(): HTMLAudioElement | null {
  if (typeof Audio === "undefined") {
    return null;
  }
  if (!notificationToneElement) {
    notificationToneElement = new Audio(NOTIFICATION_TONE_DATA_URL);
    notificationToneElement.preload = "auto";
    notificationToneElement.volume = 0.7;
  }
  return notificationToneElement;
}

function computeTotalUnread(unreadByDM: Record<string, number>): number {
  return Object.values(unreadByDM).reduce((acc, value) => acc + value, 0);
}

function isAppForeground(): boolean {
  const visible = typeof document === "undefined" ? true : document.visibilityState === "visible";
  const focused = typeof document === "undefined" ? true : document.hasFocus();
  return visible && focused;
}

async function updateTaskbarBadge(count: number) {
  const policy = getNotificationPolicy();
  if (!policy.helperEnabled) {
    return;
  }

  if (count === lastBadgeCount) {
    return;
  }
  lastBadgeCount = count;

  try {
    await setDesktopBadgeCount(count > 0 ? count : undefined);
  } catch {
    // noop
  }
}

async function requestDesktopNotificationPermission(): Promise<boolean> {
  const policy = getNotificationPolicy();
  if (!policy.helperEnabled) {
    return false;
  }

  if (typeof Notification === "undefined") {
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "default" || notificationPermissionRequested) {
    return false;
  }

  notificationPermissionRequested = true;
  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch {
    return false;
  } finally {
    notificationPermissionRequested = false;
  }
}

function bindNotificationInteractionBridge() {
  if (typeof window === "undefined" || notificationInteractionBridgeBound) {
    return;
  }
  notificationInteractionBridgeBound = true;

  const unlock = () => {
    void requestDesktopNotificationPermission();

    try {
      const tone = getNotificationToneElement();
      if (tone) {
        tone.load();
      }
    } catch {
      // noop
    }

    if (notificationAudioContext && notificationAudioContext.state === "suspended") {
      void notificationAudioContext.resume().catch(() => {
        // noop
      });
    }
  };

  window.addEventListener("pointerdown", unlock, { once: true, passive: true });
  window.addEventListener("keydown", unlock, { once: true });
  window.addEventListener("touchstart", unlock, { once: true, passive: true });
}

async function playNotificationSound() {
  const policy = getNotificationPolicy();
  if (policy.hideSounds) {
    return;
  }

  const now = Date.now();
  if (now - lastNotificationSoundAt < 180) {
    return;
  }
  lastNotificationSoundAt = now;

  try {
    const AudioContextCtor =
      window.AudioContext || ((window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext ?? null);
    if (!AudioContextCtor) {
      return;
    }

    if (!notificationAudioContext) {
      notificationAudioContext = new AudioContextCtor();
    }
    if (notificationAudioContext.state === "suspended") {
      await notificationAudioContext.resume();
    }

    const ctx = notificationAudioContext;
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();

    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(980, ctx.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(680, ctx.currentTime + 0.15);

    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.22);

    oscillator.connect(gain);
    gain.connect(ctx.destination);

    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.22);
  } catch {
    try {
      const tone = getNotificationToneElement();
      if (!tone) {
        return;
      }
      tone.currentTime = 0;
      tone.volume = 0.7;
      void tone.play();
    } catch {
      // noop
    }
  }
}

async function notifyIncomingDM(params: { title: string; body: string; onClick?: () => void }) {
  const policy = getNotificationPolicy();
  await playNotificationSound();

  if (!policy.helperEnabled) {
    return;
  }

  const title = policy.hidePersonalInfo ? "Catwa" : params.title;
  let body = params.body;
  if (policy.hideInviteLinks) {
    body = sanitizeInviteLinks(body);
  }
  if (policy.hideNotificationPreview) {
    body = "Yeni bir mesaj aldın.";
  }

  const granted = await requestDesktopNotificationPermission();
  if (!granted) {
    return;
  }

  try {
    const notification = new Notification(title, {
      body,
      silent: policy.hideSounds
    });
    notification.onclick = () => {
      params.onClick?.();
    };
  } catch {
    // noop
  }
}

async function requestWindowAttention() {
  const policy = getNotificationPolicy();
  if (!policy.helperEnabled) {
    return;
  }

  try {
    await requestDesktopAttention();
  } catch {
    // noop
  }
}

function makeRemoteAudioKey(participantSID: string, trackSID: string): string {
  return `${participantSID}:${trackSID}`;
}

function makeRemoteScreenShareKey(participantSID: string, trackSID: string): string {
  return `${participantSID}:${trackSID}`;
}

function clearRemoteAudioElements() {
  for (const entry of remoteAudioElements.values()) {
    try {
      entry.element.pause();
    } catch {
      // noop
    }
    entry.element.removeAttribute("src");
    entry.element.srcObject = null;
    entry.element.remove();
  }
  remoteAudioElements.clear();
}

function clearRemoteScreenShareTracks() {
  remoteScreenShareTracks.clear();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function safeParseTokens(payload: unknown): AuthTokens | null {
  if (!isRecord(payload)) {
    return null;
  }

  const accessToken = payload.accessToken;
  const refreshToken = payload.refreshToken;
  const tokenType = payload.tokenType;
  const expiresIn = payload.expiresIn;

  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    typeof tokenType !== "string" ||
    typeof expiresIn !== "number"
  ) {
    return null;
  }

  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresIn
  };
}

function toErrorMessage(payload: unknown, fallback: string): string {
  if (!isRecord(payload)) {
    return fallback;
  }

  const errorText = payload.error;
  if (typeof errorText !== "string" || errorText.trim() === "") {
    return fallback;
  }

  if (errorText === "captcha verification failed") {
    return "Güvenlik doğrulaması başarısız oldu. Lütfen tekrar dene.";
  }

  if (errorText !== "validation_failed") {
    return errorText;
  }

  const details = payload.details;
  if (!isRecord(details)) {
    return errorText;
  }

  const detailEntries = Object.entries(details).filter((entry): entry is [string, string] => typeof entry[1] === "string");
  if (detailEntries.length === 0) {
    return errorText;
  }

  for (const [field, reason] of detailEntries) {
    if (field === "turnstileToken" && reason === "required") {
      return "Güvenlik doğrulaması gerekli. Lütfen doğrulamayı tamamlayıp tekrar dene.";
    }
  }

  return detailEntries.map(([, reason]) => reason).join(", ");
}

function normalizeVoiceJoinError(error: unknown): string {
  const fallback = "Ses kanalına bağlanılamadı.";
  const message = error instanceof Error ? error.message.trim() : "";
  if (!message) {
    return fallback;
  }

  const lower = message.toLowerCase();
  if (
    lower.includes("create livekit room") ||
    lower.includes("livekit.roomservice") ||
    lower.includes("twirp error") ||
    lower.includes("dial tcp") ||
    lower.includes("connection refused")
  ) {
    return "Ses servisine şu anda ulaşılamıyor. Lütfen biraz sonra tekrar dene.";
  }

  return message;
}

function sortedDMs(items: DMConversation[]): DMConversation[] {
  return [...items].sort((a, b) => {
    const left = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
    const right = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
    return right - left;
  });
}

function sortedMessages(items: Message[]): Message[] {
  return [...items].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

function upsertMessage(messages: Message[], incoming: Message): Message[] {
  const index = messages.findIndex((item) => item.id === incoming.id);
  if (index >= 0) {
    const next = [...messages];
    next[index] = incoming;
    return sortedMessages(next);
  }
  return sortedMessages([...messages, incoming]);
}

function sortVoiceChannels(channels: VoiceChannel[]): VoiceChannel[] {
  return [...channels].sort((a, b) => {
    const workspaceCompare = a.workspaceName.localeCompare(b.workspaceName, "tr");
    if (workspaceCompare !== 0) {
      return workspaceCompare;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}

function sortServers(servers: ServerSummary[]): ServerSummary[] {
  return [...servers].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    return left - right;
  });
}

function sortTextChannels(channels: Channel[]): Channel[] {
  return [...channels].sort((a, b) => {
    const left = new Date(a.createdAt).getTime();
    const right = new Date(b.createdAt).getTime();
    if (left !== right) {
      return left - right;
    }
    return a.name.localeCompare(b.name, "tr");
  });
}

function buildAttachmentURL(filePath: string): string {
  const normalizedPath = filePath.trim().replace(/^\/+/, "");
  return `${env.cdnBaseUrl}/uploads/${normalizedPath}`;
}

function mergeMessageWithAttachments(content: string, attachments: UploadedAttachment[]): string {
  const base = content.trim();
  if (attachments.length === 0) {
    return base;
  }

  const attachmentLines = attachments.map((item) => `📎 ${item.originalName}\n${buildAttachmentURL(item.filePath)}`).join("\n\n");
  if (!base) {
    return attachmentLines;
  }
  return `${base}\n\n${attachmentLines}`;
}

async function parseResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204) {
    return undefined;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return undefined;
    }
  }

  const text = await response.text();
  if (!text) {
    return undefined;
  }
  return { error: text };
}
function parseMessagePayload(payload: unknown): Message | null {
  if (!isRecord(payload)) {
    return null;
  }

  const id = payload.id;
  const conversationType = payload.conversationType;
  const conversationId = payload.conversationId;
  const senderId = payload.senderId;
  const senderUsername = payload.senderUsername;
  const senderDisplayName = payload.senderDisplayName;
  const senderAvatarPath = payload.senderAvatarPath;
  const content = payload.content;
  const createdAt = payload.createdAt;

  if (
    typeof id !== "string" ||
    (conversationType !== "dm" && conversationType !== "channel") ||
    typeof conversationId !== "string" ||
    typeof senderId !== "string" ||
    typeof senderUsername !== "string" ||
    typeof content !== "string" ||
    typeof createdAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    conversationType,
    conversationId,
    senderId,
    senderUsername,
    senderDisplayName: typeof senderDisplayName === "string" && senderDisplayName.trim() ? senderDisplayName : undefined,
    senderAvatarPath: typeof senderAvatarPath === "string" && senderAvatarPath.trim() ? senderAvatarPath : undefined,
    content,
    createdAt,
    editedAt: typeof payload.editedAt === "string" ? payload.editedAt : undefined,
    deletedAt: typeof payload.deletedAt === "string" ? payload.deletedAt : undefined
  };
}

function parseTypingPayload(payload: unknown): { conversationType: string; conversationId: string; userId: string } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const conversationType = payload.conversationType;
  const conversationId = payload.conversationId;
  const userId = payload.userId;

  if (typeof conversationType !== "string" || typeof conversationId !== "string" || typeof userId !== "string") {
    return null;
  }

  return { conversationType, conversationId, userId };
}

function parsePresencePayload(payload: unknown): { userId: string; status: string; lastSeen?: string } | null {
  if (!isRecord(payload)) {
    return null;
  }

  const userId = payload.userId;
  const status = payload.status;
  const lastSeen = payload.lastSeen;

  if (typeof userId !== "string" || typeof status !== "string") {
    return null;
  }

  return {
    userId,
    status: normalizePresenceStatus(status),
    lastSeen: typeof lastSeen === "string" ? lastSeen : undefined
  };
}

function parseVoiceSpeakingPayload(payload: unknown): VoiceSpeakingEventPayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const userId = payload.userId;
  const channelId = payload.channelId;
  if (typeof userId !== "string" || typeof channelId !== "string") {
    return null;
  }
  return { userId, channelId };
}

function parseServerInvitePayload(payload: unknown): ServerInviteItem | null {
  if (!isRecord(payload)) {
    return null;
  }

  const id = payload.id;
  const serverId = payload.serverId;
  const serverName = payload.serverName;
  const invitedUserId = payload.invitedUserId;
  const invitedByUserId = payload.invitedByUserId;
  const invitedByUsername = payload.invitedByUsername;
  const invitedByDisplayName = payload.invitedByDisplayName;
  const status = payload.status;
  const createdAt = payload.createdAt;
  const updatedAt = payload.updatedAt;

  if (
    typeof id !== "string" ||
    typeof serverId !== "string" ||
    typeof serverName !== "string" ||
    typeof invitedUserId !== "string" ||
    typeof invitedByUserId !== "string" ||
    typeof invitedByUsername !== "string" ||
    typeof invitedByDisplayName !== "string" ||
    typeof status !== "string" ||
    typeof createdAt !== "string" ||
    typeof updatedAt !== "string"
  ) {
    return null;
  }

  return {
    id,
    serverId,
    serverName,
    invitedUserId,
    invitedByUserId,
    invitedByUsername,
    invitedByDisplayName,
    invitedByAvatarPath: typeof payload.invitedByAvatarPath === "string" ? payload.invitedByAvatarPath : undefined,
    status,
    createdAt,
    updatedAt,
    respondedAt: typeof payload.respondedAt === "string" ? payload.respondedAt : undefined
  };
}

function normalizeStoredReactionEntry(entry: unknown): MessageReactionState | null {
  if (!isRecord(entry)) {
    return null;
  }
  const emoji = entry.emoji;
  const count = entry.count;
  const reacted = entry.reacted;
  if (typeof emoji !== "string" || !emoji.trim()) {
    return null;
  }
  if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) {
    return null;
  }
  if (typeof reacted !== "boolean") {
    return null;
  }
  return {
    emoji: emoji.trim(),
    count: Math.max(1, Math.floor(count)),
    reacted
  };
}

function normalizeStoredReactions(raw: unknown): StoredReactionsByMessage {
  if (!isRecord(raw)) {
    return {};
  }

  const next: StoredReactionsByMessage = {};
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
          return {
            emoji,
            count: 1,
            reacted: true
          } satisfies MessageReactionState;
        }
        return normalizeStoredReactionEntry(item);
      })
      .filter((item): item is MessageReactionState => !!item);

    if (normalized.length > 0) {
      next[messageID] = normalized;
    }
  }

  return next;
}

function readStoredReactionsByConversation(conversationID: string): StoredReactionsByMessage {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(`catwa.reactions.${conversationID}`);
    if (!raw) {
      return {};
    }
    return normalizeStoredReactions(JSON.parse(raw));
  } catch {
    return {};
  }
}

function readStoredPinnedMessageIDs(conversationID: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(`catwa.pins.${conversationID}`);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  } catch {
    return [];
  }
}

function persistReactionState(conversationID: string, reactionsByMessage: StoredReactionsByMessage) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(`catwa.reactions.${conversationID}`, JSON.stringify(reactionsByMessage));
  window.dispatchEvent(
    new CustomEvent<ReactionsChangedDetail>(REACTIONS_CHANGED_EVENT_NAME, {
      detail: {
        conversationId: conversationID,
        reactionsByMessage: { ...reactionsByMessage }
      }
    })
  );
}

function persistPinnedState(conversationID: string, pinnedMessageIDs: string[]) {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(`catwa.pins.${conversationID}`, JSON.stringify(pinnedMessageIDs));
  window.dispatchEvent(
    new CustomEvent<PinsChangedDetail>(PINS_CHANGED_EVENT_NAME, {
      detail: {
        conversationId: conversationID,
        pinnedMessageIds: [...pinnedMessageIDs]
      }
    })
  );
}

function parseMessagePinPayload(payload: unknown): MessagePinRealtimePayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const conversationType = payload.conversationType;
  const conversationId = payload.conversationId;
  const messageId = payload.messageId;
  const pinned = payload.pinned;
  const userId = payload.userId;
  const pinnedAt = payload.pinnedAt;

  if (
    (conversationType !== "dm" && conversationType !== "channel") ||
    typeof conversationId !== "string" ||
    typeof messageId !== "string" ||
    typeof pinned !== "boolean" ||
    typeof userId !== "string"
  ) {
    return null;
  }

  return {
    conversationType,
    conversationId,
    messageId,
    pinned,
    userId,
    pinnedAt: typeof pinnedAt === "string" ? pinnedAt : undefined
  };
}

function parseMessageReactionPayload(payload: unknown): MessageReactionRealtimePayload | null {
  if (!isRecord(payload)) {
    return null;
  }
  const conversationType = payload.conversationType;
  const conversationId = payload.conversationId;
  const messageId = payload.messageId;
  const emoji = payload.emoji;
  const count = payload.count;
  const userId = payload.userId;
  const active = payload.active;

  if (
    (conversationType !== "dm" && conversationType !== "channel") ||
    typeof conversationId !== "string" ||
    typeof messageId !== "string" ||
    typeof emoji !== "string" ||
    !emoji.trim() ||
    typeof count !== "number" ||
    !Number.isFinite(count) ||
    count < 0 ||
    typeof userId !== "string" ||
    typeof active !== "boolean"
  ) {
    return null;
  }

  return {
    conversationType,
    conversationId,
    messageId,
    emoji: emoji.trim(),
    count: Math.max(0, Math.floor(count)),
    userId,
    active
  };
}

export const useChatStore = create<ChatStore>((set, get) => {
  const setStoredTokens = (tokens: AuthTokens | null) => {
    clearAttachmentURLCache();
    set({ tokens });
    void persistTokens(tokens);
  };

  const clearUnreadForConversation = (conversationID: string) => {
    const normalized = conversationID.trim();
    if (!normalized) {
      return;
    }

    let nextTotal = 0;
    set((state) => {
      const currentUnread = state.unreadByDM[normalized] ?? 0;
      if (currentUnread <= 0) {
        nextTotal = state.totalUnread;
        return state;
      }

      const nextUnreadByDM = { ...state.unreadByDM };
      delete nextUnreadByDM[normalized];
      nextTotal = computeTotalUnread(nextUnreadByDM);

      return {
        unreadByDM: nextUnreadByDM,
        totalUnread: nextTotal
      };
    });

    void updateTaskbarBadge(nextTotal);
  };

  const clearAllUnreadState = () => {
    set({
      unreadByDM: {},
      totalUnread: 0
    });
    void updateTaskbarBadge(0);
  };

  const incrementUnreadForConversation = (conversationID: string) => {
    const normalized = conversationID.trim();
    if (!normalized) {
      return;
    }

    let nextTotal = 0;
    set((state) => {
      const nextUnreadByDM = {
        ...state.unreadByDM,
        [normalized]: (state.unreadByDM[normalized] ?? 0) + 1
      };
      nextTotal = computeTotalUnread(nextUnreadByDM);

      return {
        unreadByDM: nextUnreadByDM,
        totalUnread: nextTotal
      };
    });

    void updateTaskbarBadge(nextTotal);
  };

  const clearReconnectTimer = () => {
    if (!reconnectTimer) {
      return;
    }
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  };

  const clearWsDisconnectToastTimer = () => {
    if (!wsDisconnectToastTimer) {
      return;
    }
    clearTimeout(wsDisconnectToastTimer);
    wsDisconnectToastTimer = null;
  };

  const clearTypingTimer = () => {
    if (!typingStopTimer) {
      return;
    }
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
  };

  const rejectPendingSocketRequests = (reason: string) => {
    for (const [requestID, pending] of pendingSocketRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
      pendingSocketRequests.delete(requestID);
    }
  };

  const sendSocketAction = (action: string, data?: unknown, room?: string) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const frame: Record<string, unknown> = { action };
    if (room) {
      frame.room = room;
    }
    if (data !== undefined) {
      frame.data = data;
    }
    socket.send(JSON.stringify(frame));
  };

  const sendSocketRequest = <T>(action: string, data?: unknown, room?: string): Promise<T> => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return Promise.reject(new Error("WebSocket bağlantısı hazır değil."));
    }

    const requestId = `req-${Date.now()}-${++socketRequestSequence}`;
    const frame: Record<string, unknown> = { action, requestId };
    if (room) {
      frame.room = room;
    }
    if (data !== undefined) {
      frame.data = data;
    }

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pendingSocketRequests.delete(requestId);
        reject(new Error("WebSocket isteği zaman aşımına uğradı."));
      }, 10000);

      pendingSocketRequests.set(requestId, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });

      socket?.send(JSON.stringify(frame));
    });
  };

  const closeSocket = () => {
    clearReconnectTimer();
    clearWsDisconnectToastTimer();
    wsDisconnectToastShown = false;
    rejectPendingSocketRequests("WebSocket bağlantısı kapandı.");

    if (socket) {
      socket.onopen = null;
      socket.onclose = null;
      socket.onmessage = null;
      socket.onerror = null;
      if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
        socket.close();
      }
    }

    socket = null;
    subscribedDMRooms = new Set<string>();
    subscribedChannelRoom = null;
    subscribedServerRoom = null;
    set({ wsConnected: false });
  };

  const getRemoteAudioElementVolume = (entry: Pick<RemoteAudioEntry, "participantId" | "source">) => {
    const preferences = loadAppPreferences();
    const masterVolume = Math.max(0, Math.min(1, (preferences.voiceVideo.outputVolume ?? 100) / 100));
    const participantVolume =
      entry.source === "screen-share"
        ? useVoiceAudioStore.getState().streamVolume / 100
        : useVoiceAudioStore.getState().getParticipantVolume(entry.participantId) / 100;
    return Math.max(0, Math.min(1, masterVolume * participantVolume));
  };

  const syncRemoteAudioOutputDevice = async (media: HTMLMediaElement) => {
    const outputDeviceId = loadAppPreferences().voiceVideo.outputDeviceId;
    if (!outputDeviceId || outputDeviceId === "default") {
      return;
    }
    const sinkTarget = media as HTMLMediaElement & { setSinkId?: (deviceId: string) => Promise<void> };
    if (typeof sinkTarget.setSinkId !== "function") {
      return;
    }
    try {
      await sinkTarget.setSinkId(outputDeviceId);
    } catch {
      // Bazı tarayıcılar veya Tauri webview setSinkId desteği vermez.
    }
  };

  const applyRemoteAudioPreferences = () => {
    const muted = get().voiceDeafened;
    for (const entry of remoteAudioElements.values()) {
      entry.element.muted = muted;
      entry.element.volume = getRemoteAudioElementVolume(entry);
      void syncRemoteAudioOutputDevice(entry.element);
    }
  };

  const buildMicrophoneOptions = (): AudioCaptureOptions =>
    buildMicrophoneConstraints(loadAppPreferences().voiceVideo) as AudioCaptureOptions;

  const resolveShouldEnableMicrophone = (voiceState?: { muted: boolean; deafened: boolean }) => {
    const voicePreferences = loadAppPreferences().voiceVideo;
    const muted = voiceState?.muted ?? get().voiceMuted;
    const deafened = voiceState?.deafened ?? get().voiceDeafened;
    if (muted || deafened) {
      return false;
    }
    if (!voicePreferences.pushToTalk) {
      return true;
    }
    return pushToTalkPressed;
  };

  const applyVoiceVideoPreferencesToLiveKit = async (voiceStateOverride?: { muted: boolean; deafened: boolean }) => {
    const room = liveKitRoom;
    if (!room) {
      return;
    }

    const voicePreferences = loadAppPreferences().voiceVideo;
    const microphoneOptions = buildMicrophoneOptions();

    if (voicePreferences.inputDeviceId && voicePreferences.inputDeviceId !== "default") {
      await room.switchActiveDevice("audioinput", voicePreferences.inputDeviceId, true).catch(() => {
        // noop
      });
    } else {
      await room.switchActiveDevice("audioinput", "default").catch(() => {
        // noop
      });
    }

    if (voicePreferences.outputDeviceId && voicePreferences.outputDeviceId !== "default") {
      await room.switchActiveDevice("audiooutput", voicePreferences.outputDeviceId).catch(() => {
        // noop
      });
    } else {
      await room.switchActiveDevice("audiooutput", "default").catch(() => {
        // noop
      });
    }

    const shouldEnableMicrophone = resolveShouldEnableMicrophone(voiceStateOverride);
    await room.localParticipant.setMicrophoneEnabled(shouldEnableMicrophone, microphoneOptions).catch(() => {
      // noop
    });

    applyRemoteAudioPreferences();
  };

  const setPushToTalkPressed = async (pressed: boolean) => {
    if (pushToTalkPressed === pressed) {
      return;
    }
    pushToTalkPressed = pressed;

    if (!loadAppPreferences().voiceVideo.pushToTalk) {
      return;
    }

    await applyVoiceVideoPreferencesToLiveKit();
  };

  const bindPushToTalkHandlers = () => {
    if (typeof window === "undefined" || pushToTalkHandlersBound) {
      return;
    }

    pushToTalkKeyDownHandler = (event: KeyboardEvent) => {
      if (!isPushToTalkHotkey(event)) {
        return;
      }
      if (isEditableTarget(event.target)) {
        return;
      }
      event.preventDefault();
      void setPushToTalkPressed(true);
    };

    pushToTalkKeyUpHandler = (event: KeyboardEvent) => {
      if (!isPushToTalkHotkey(event)) {
        return;
      }
      event.preventDefault();
      void setPushToTalkPressed(false);
    };

    pushToTalkWindowBlurHandler = () => {
      void setPushToTalkPressed(false);
    };

    window.addEventListener("keydown", pushToTalkKeyDownHandler);
    window.addEventListener("keyup", pushToTalkKeyUpHandler);
    window.addEventListener("blur", pushToTalkWindowBlurHandler);
    pushToTalkHandlersBound = true;
  };

  bindPushToTalkHandlers();
  applyLiveKitVoicePreferencesHook = () => {
    void applyVoiceVideoPreferencesToLiveKit();
  };

  const attachRemoteAudioTrack = (participantSID: string, participantId: string, trackSID: string, media: HTMLMediaElement, source: RemoteAudioSource) => {
    const key = makeRemoteAudioKey(participantSID, trackSID);
    const existing = remoteAudioElements.get(key);
    if (existing) {
      existing.element.pause();
      existing.element.removeAttribute("src");
      existing.element.srcObject = null;
      existing.element.remove();
      remoteAudioElements.delete(key);
    }

    media.autoplay = true;
    media.style.display = "none";
    document.body.appendChild(media);

    const entry: RemoteAudioEntry = {
      element: media,
      participantId: participantId.trim() || participantSID,
      source
    };
    remoteAudioElements.set(key, entry);
    applyRemoteAudioPreferences();

    const playPromise = media.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // noop
      });
    }

  };

  const applyRemoteAudioMuted = (muted: boolean) => {
    for (const entry of remoteAudioElements.values()) {
      entry.element.muted = muted;
    }
  };

  const detachRemoteAudioTrack = (participantSID: string, trackSID: string) => {
    const key = makeRemoteAudioKey(participantSID, trackSID);
    const existing = remoteAudioElements.get(key);
    if (!existing) {
      return;
    }

    existing.element.pause();
    existing.element.removeAttribute("src");
    existing.element.srcObject = null;
    existing.element.remove();
    remoteAudioElements.delete(key);
  };

  const syncRemoteScreenShareState = () => {
    const next = Array.from(remoteScreenShareTracks.values()).sort((left, right) => {
      const byName = left.participantName.localeCompare(right.participantName, "tr");
      if (byName !== 0) {
        return byName;
      }
      return left.trackSid.localeCompare(right.trackSid, "tr");
    });
    set({ remoteScreenShares: next });
  };

  const upsertRemoteScreenShare = (participantSID: string, trackSID: string, track: RemoteVideoTrack, participantName: string, participantId: string) => {
    const key = makeRemoteScreenShareKey(participantSID, trackSID);
    remoteScreenShareTracks.set(key, {
      key,
      participantId: participantId.trim() || participantSID,
      participantName: participantName.trim() || participantId.trim() || "Kullanıcı",
      source: track.source === Track.Source.ScreenShare ? "screen" : "camera",
      trackSid: trackSID,
      track
    });
    syncRemoteScreenShareState();
  };

  const removeRemoteScreenShare = (participantSID: string, trackSID: string) => {
    const key = makeRemoteScreenShareKey(participantSID, trackSID);
    if (!remoteScreenShareTracks.delete(key)) {
      return;
    }
    syncRemoteScreenShareState();
  };

  const removeRemoteScreenSharesForParticipant = (participantSID: string) => {
    let mutated = false;
    for (const key of remoteScreenShareTracks.keys()) {
      if (!key.startsWith(`${participantSID}:`)) {
        continue;
      }
      remoteScreenShareTracks.delete(key);
      mutated = true;
    }
    if (mutated) {
      syncRemoteScreenShareState();
    }
  };

  const stopLocalScreenShareInternal = async (options?: { silent?: boolean }) => {
    const activeTracks = [...localScreenShareTracks];
    localScreenShareTracks = [];

    const localTrack = get().localScreenShareTrack;
    const mediaTrack = localTrack?.mediaStreamTrack;
    if (mediaTrack && localScreenShareEndedHandler) {
      mediaTrack.removeEventListener("ended", localScreenShareEndedHandler);
      localScreenShareEndedHandler = null;
    }

    if (activeTracks.length === 0) {
      set({
        screenShareStarting: false,
        screenShareActive: false,
        screenShareSourceKind: null,
        screenShareSourceLabel: null,
        localScreenShareTrack: null
      });
      return;
    }

    if (liveKitRoom) {
      for (const track of activeTracks) {
        try {
          await liveKitRoom.localParticipant.unpublishTrack(track, true);
        } catch {
          // noop
        }
      }
    }

    stopCapturedTracks(activeTracks);
    set({
      screenShareStarting: false,
      screenShareActive: false,
      screenShareSourceKind: null,
      screenShareSourceLabel: null,
      localScreenShareTrack: null
    });

    if (!options?.silent) {
      toastInfo("Ekran paylaşımı durduruldu", "Paylaşım yayını sonlandırıldı.", "screen-share-stopped");
    }
  };

  const disconnectLiveKit = async () => {
    pushToTalkPressed = false;
    await stopLocalScreenShareInternal({ silent: true });

    if (!liveKitRoom) {
      liveKitChannelId = null;
      localSpeaking = false;
      clearRemoteScreenShareTracks();
      syncCurrentUserVoiceState(null, { speaking: false });
      set({ liveKitConnected: false, remoteScreenShares: [] });
      return;
    }

    if (localSpeaking && liveKitChannelId) {
      sendSocketAction("voice.speaking.stop", { channelId: liveKitChannelId });
    }

    localSpeaking = false;
    syncCurrentUserVoiceState(liveKitChannelId, { speaking: false });
    liveKitRoom.removeAllListeners();
    clearRemoteAudioElements();
    clearRemoteScreenShareTracks();
    try {
      await liveKitRoom.disconnect();
    } catch {
      // noop
    }

    liveKitRoom = null;
    liveKitChannelId = null;
    set({ liveKitConnected: false, remoteScreenShares: [] });
  };

  const resetSession = async (error: string | null) => {
    clearTypingTimer();
    typingStartedRoom = null;
    closeSocket();
    await disconnectLiveKit();
    setStoredTokens(null);
    void updateTaskbarBadge(0);

    set({
      appStatus: "unauthenticated",
      currentUser: null,
      dms: [],
      selectedDMId: null,
      selectedChannelId: null,
      unreadByDM: {},
      totalUnread: 0,
      messagesByDM: {},
      messagesByChannel: {},
      typingByDM: {},
      presenceByUser: {},
      userSearchQuery: "",
      userSearchResults: [],
      userSearchLoading: false,
      friends: [],
      friendRequestsIncoming: [],
      friendRequestsOutgoing: [],
      friendPrivacySettings: DEFAULT_FRIEND_PRIVACY_SETTINGS,
      blockedUsers: [],
      loadingFriends: false,
      loadingFriendRequests: false,
      loadingFriendPrivacy: false,
      loadingBlockedUsers: false,
      sendingFriendRequest: false,
      updatingFriendPrivacy: false,
      blockingUser: false,
      servers: [],
      selectedServerId: null,
      channelsByServer: {},
      serverMembersByServer: {},
      serverInvitesIncoming: [],
      loadingServers: false,
      loadingChannels: false,
      loadingServerMembers: false,
      loadingServerInvites: false,
      creatingServer: false,
      creatingTextChannel: false,
      creatingVoiceChannel: false,
      loadingDMs: false,
      loadingMessages: false,
      sendingMessage: false,
      authLoading: false,
      profileUpdating: false,
      passwordUpdating: false,
      voiceChannels: [],
      loadingVoiceChannels: false,
      activeVoiceChannelId: null,
      activeVoiceChannelSnapshot: null,
      voiceMuted: false,
      voiceDeafened: false,
      voiceConnecting: false,
      liveKitConnected: false,
      screenShareStarting: false,
      screenShareActive: false,
      screenShareSourceKind: null,
      screenShareSourceLabel: null,
      screenShareQuality: "1080p",
      screenShareFPS: 30,
      screenShareIncludeSystemAudio: false,
      localScreenShareTrack: null,
      remoteScreenShares: [],
      error
    });
  };

  const normalizeApiBase = (value: string): string | null => {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    return trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed;
  };

  const resolveBrowserOriginApiBase = (): string | null => {
    if (typeof window === "undefined") {
      return null;
    }

    try {
      const locationURL = new URL(window.location.href);
      if (locationURL.protocol !== "http:" && locationURL.protocol !== "https:") {
        return null;
      }
      return normalizeApiBase(locationURL.origin);
    } catch {
      return null;
    }
  };

  const resolveApiBaseCandidates = (): string[] => {
    const candidates = [env.apiBaseUrl, resolveBrowserOriginApiBase() ?? ""]
      .map((value) => normalizeApiBase(value))
      .filter((value): value is string => Boolean(value));

    return Array.from(new Set(candidates));
  };

  const fetchFromApiCandidates = async (path: string, init: RequestInit): Promise<Response> => {
    const candidates = resolveApiBaseCandidates();
    let lastError: unknown = null;

    for (const base of candidates) {
      try {
        return await httpFetch(`${base}${path}`, init);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("api request failed");
  };

  const refreshTokens = async (): Promise<boolean> => {
    const tokens = get().tokens ?? (await readStoredTokens());
    if (!tokens?.refreshToken) {
      return false;
    }

    try {
      const desktopHeaders: Record<string, string> = {};
      if (isTauriDesktop()) {
        desktopHeaders["X-Catwa-Desktop"] = "true";
      }
      const response = await fetchFromApiCandidates("/api/v1/auth/refresh", {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...desktopHeaders
        },
        body: JSON.stringify({ refreshToken: tokens.refreshToken })
      });

      const payload = await parseResponseBody(response);
      if (!response.ok || !isRecord(payload) || !("tokens" in payload)) {
        return false;
      }

      const parsed = safeParseTokens(payload.tokens);
      if (!parsed) {
        return false;
      }

      setStoredTokens(parsed);
      return true;
    } catch {
      return false;
    }
  };

  const requestJSON = async <T>(
    path: string,
    init: RequestInit = {},
    options: { auth?: boolean; retry?: boolean } = {}
  ): Promise<T> => {
    const auth = options.auth ?? true;
    const retry = options.retry ?? true;

    const headers = new Headers(init.headers ?? {});
    if (isTauriDesktop() && !headers.has("X-Catwa-Desktop")) {
      headers.set("X-Catwa-Desktop", "true");
    }
    if (!headers.has("Accept")) {
      headers.set("Accept", "application/json");
    }
    if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    if (auth) {
      const accessToken = get().tokens?.accessToken;
      if (accessToken) {
        headers.set("Authorization", `Bearer ${accessToken}`);
      }
    }

    let response: Response;
    try {
      response = await fetchFromApiCandidates(path, { ...init, headers });
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error("Sunucuya bağlanılamadı. İnternetini, VPN/AdBlock ayarlarını kontrol edip tekrar dene.");
      }
      throw new Error("Sunucuya ulaşılamıyor. Bağlantını kontrol edip tekrar dene.");
    }

    if (response.status === 401 && auth && retry) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return requestJSON<T>(path, init, { auth, retry: false });
      }
      await resetSession("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
      throw new Error("Oturum süresi doldu.");
    }

    const payload = await parseResponseBody(response);
    if (!response.ok) {
      throw new Error(toErrorMessage(payload, "İstek başarısız oldu."));
    }

    return payload as T;
  };
  const syncSelectedDMRoomSubscription = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const nextRooms = new Set<string>();
    for (const conversation of get().dms) {
      if (conversation.conversationId) {
        nextRooms.add(`dm:${conversation.conversationId}`);
      }
    }
    const selectedDMID = get().selectedDMId;
    if (selectedDMID) {
      nextRooms.add(`dm:${selectedDMID}`);
    }

    for (const room of subscribedDMRooms) {
      if (!nextRooms.has(room)) {
        sendSocketAction("unsubscribe", undefined, room);
      }
    }
    for (const room of nextRooms) {
      if (!subscribedDMRooms.has(room)) {
        sendSocketAction("subscribe", undefined, room);
      }
    }

    subscribedDMRooms = nextRooms;
  };

  const syncSelectedChannelRoomSubscription = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const selectedChannelID = get().selectedChannelId;
    const nextRoom = selectedChannelID ? `channel:${selectedChannelID}` : null;

    if (subscribedChannelRoom && subscribedChannelRoom !== nextRoom) {
      sendSocketAction("unsubscribe", undefined, subscribedChannelRoom);
    }
    if (nextRoom && nextRoom !== subscribedChannelRoom) {
      sendSocketAction("subscribe", undefined, nextRoom);
    }

    subscribedChannelRoom = nextRoom;
  };

  const syncSelectedServerRoomSubscription = () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const selectedServerID = get().selectedServerId;
    const nextRoom = selectedServerID ? `server:${selectedServerID}` : null;

    if (subscribedServerRoom && subscribedServerRoom !== nextRoom) {
      sendSocketAction("unsubscribe", undefined, subscribedServerRoom);
    }
    if (nextRoom && nextRoom !== subscribedServerRoom) {
      sendSocketAction("subscribe", undefined, nextRoom);
    }

    subscribedServerRoom = nextRoom;
  };

  const stopTypingForConversation = (conversationID: string) => {
    clearTypingTimer();
    const targetRoom = `dm:${conversationID}`;
    if (typingStartedRoom === targetRoom) {
      sendSocketAction("typing.stop", {
        conversationType: "dm",
        conversationId: conversationID
      });
      typingStartedRoom = null;
    }
  };

  const upsertConversationFromMessage = (state: ChatStore, message: Message): DMConversation[] => {
    const index = state.dms.findIndex((conversation) => conversation.conversationId === message.conversationId);
    if (index < 0) {
      return state.dms;
    }

    const next = [...state.dms];
    next[index] = {
      ...next[index],
      lastMessage: message.content,
      lastMessageAt: message.createdAt
    };
    return sortedDMs(next);
  };

  const updateConversationPreviewFromExistingMessage = (state: ChatStore, message: Message): DMConversation[] => {
    const index = state.dms.findIndex((conversation) => conversation.conversationId === message.conversationId);
    if (index < 0) {
      return state.dms;
    }

    const target = state.dms[index];
    if (!target.lastMessageAt || new Date(target.lastMessageAt).getTime() !== new Date(message.createdAt).getTime()) {
      return state.dms;
    }

    const next = [...state.dms];
    next[index] = {
      ...target,
      lastMessage: message.content
    };
    return sortedDMs(next);
  };

  const applyPinnedMessageUpdate = (payload: MessagePinRealtimePayload) => {
    const current = readStoredPinnedMessageIDs(payload.conversationId);
    const currentSet = new Set(current);
    if (payload.pinned) {
      currentSet.add(payload.messageId);
    } else {
      currentSet.delete(payload.messageId);
    }
    persistPinnedState(payload.conversationId, [...currentSet]);
  };

  const applyReactionUpdate = (payload: MessageReactionRealtimePayload) => {
    const reactionsByMessage = readStoredReactionsByConversation(payload.conversationId);
    const next = { ...reactionsByMessage };
    const currentEntries = [...(next[payload.messageId] ?? [])];
    const index = currentEntries.findIndex((item) => item.emoji === payload.emoji);
    const currentUserID = get().currentUser?.id ?? "";

    if (payload.count <= 0) {
      if (index >= 0) {
        currentEntries.splice(index, 1);
      }
    } else {
      const reacted = payload.userId === currentUserID ? payload.active : index >= 0 ? currentEntries[index].reacted : false;
      const entry: MessageReactionState = {
        emoji: payload.emoji,
        count: payload.count,
        reacted
      };

      if (index >= 0) {
        currentEntries[index] = entry;
      } else {
        currentEntries.push(entry);
      }
      currentEntries.sort((left, right) => left.emoji.localeCompare(right.emoji, "tr"));
    }

    if (currentEntries.length === 0) {
      delete next[payload.messageId];
    } else {
      next[payload.messageId] = currentEntries;
    }

    persistReactionState(payload.conversationId, next);
  };

  const persistConversationMessageState = (conversationID: string, state: MessageStateResponse) => {
    persistPinnedState(conversationID, state.pinnedMessageIds ?? []);
    persistReactionState(conversationID, normalizeStoredReactions(state.reactionsByMessage));
  };

  const updateVoiceParticipant = (channelID: string | null, userID: string, patch: Partial<VoiceMember>) => {
    const normalizedUserID = userID.trim();
    if (!normalizedUserID) {
      return;
    }

    set((state) => {
      const voiceChannels = state.voiceChannels.map((channel) => {
        if (channelID && channel.id !== channelID) {
          return channel;
        }

        let changed = false;
        const participants = channel.participants.map((participant) => {
          if (participant.userId !== normalizedUserID) {
            return participant;
          }

          changed = true;
          return {
            ...participant,
            ...patch
          };
        });

        return changed ? { ...channel, participants } : channel;
      });

      let activeVoiceChannelSnapshot = state.activeVoiceChannelSnapshot;
      if (activeVoiceChannelSnapshot && (!channelID || activeVoiceChannelSnapshot.id === channelID)) {
        let changed = false;
        const participants = activeVoiceChannelSnapshot.participants.map((participant) => {
          if (participant.userId !== normalizedUserID) {
            return participant;
          }

          changed = true;
          return {
            ...participant,
            ...patch
          };
        });

        if (changed) {
          activeVoiceChannelSnapshot = {
            ...activeVoiceChannelSnapshot,
            participants
          };
        }
      }

      return {
        voiceChannels,
        activeVoiceChannelSnapshot
      };
    });
  };

  const setVoiceSpeaking = (payload: VoiceSpeakingEventPayload, speaking: boolean) => {
    updateVoiceParticipant(payload.channelId, payload.userId, { speaking });
  };

  const syncCurrentUserVoiceState = (channelID: string | null, patch: Partial<VoiceMember>) => {
    const currentUserID = get().currentUser?.id?.trim();
    if (!currentUserID) {
      return;
    }

    updateVoiceParticipant(channelID, currentUserID, patch);
  };

  const handleRealtimeEvent = (event: RealtimeEnvelope) => {
    switch (event.type) {
      case "message.created": {
        const message = parseMessagePayload(event.payload);
        if (!message) {
          return;
        }

        if (message.conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[message.conversationId] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [message.conversationId]: upsertMessage(currentMessages, message)
              },
              dms: upsertConversationFromMessage(state, message)
            };
          });

          const me = get().currentUser;
          const incomingFromAnotherUser = !!me && message.senderId !== me.id;
          const dmIsActive = get().selectedDMId === message.conversationId && get().selectedServerId === null;
          const foreground = isAppForeground();
          const conversation = get().dms.find((item) => item.conversationId === message.conversationId);
          const dmContextState = useDMContextStore.getState();
          const muted = dmContextState.isDMMuted(message.conversationId);
          const ignored = !!(conversation && dmContextState.ignoredUsers[conversation.otherUserId]);
          const shouldIncrementUnread = incomingFromAnotherUser && !ignored && (!dmIsActive || !foreground);
          const shouldNotify = incomingFromAnotherUser && !ignored && !muted && (!foreground || !dmIsActive);

          if (shouldIncrementUnread) {
            incrementUnreadForConversation(message.conversationId);
          }

          if (shouldNotify) {
            const title = conversation?.otherDisplayName ?? `@${message.senderUsername}`;
            const body = message.content.trim() || "Yeni mesaj";

            void notifyIncomingDM({
              title: `${title} yeni mesaj`,
              body,
              onClick: () => {
                void focusDesktopWindow().catch(() => {
                  window.focus();
                });
                void get().selectDM(message.conversationId);
              }
            });

            if (!foreground) {
              void requestWindowAttention();
            }
          }
          return;
        }

        set((state) => {
          const currentMessages = state.messagesByChannel[message.conversationId] ?? [];
          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [message.conversationId]: upsertMessage(currentMessages, message)
            }
          };
        });

        const me = get().currentUser;
        const incomingFromAnotherUser = !!me && message.senderId !== me.id;
        const channelIsActive = get().selectedChannelId === message.conversationId && get().selectedServerId !== null;
        const foreground = isAppForeground();
        const shouldNotify = incomingFromAnotherUser && (!foreground || !channelIsActive);

        if (shouldNotify) {
          incrementUnreadForConversation(message.conversationId);

          const channelName = Object.values(get().channelsByServer)
            .flat()
            .find((item) => item.id === message.conversationId)?.name;
          const title = channelName ? `#${channelName}` : "Sunucu mesajı";
          const body = message.content.trim() || "Yeni mesaj";

          void notifyIncomingDM({
            title: `${title} • @${message.senderUsername}`,
            body,
            onClick: () => {
              void focusDesktopWindow().catch(() => {
                window.focus();
              });
              void get().selectChannel(message.conversationId);
            }
          });

          if (!foreground) {
            void requestWindowAttention();
          }
        }
        return;
      }
      case "message.updated":
      case "message.deleted": {
        const message = parseMessagePayload(event.payload);
        if (!message) {
          return;
        }

        if (message.conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[message.conversationId] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [message.conversationId]: upsertMessage(currentMessages, message)
              },
              dms: updateConversationPreviewFromExistingMessage(state, message)
            };
          });
          return;
        }

        set((state) => {
          const currentMessages = state.messagesByChannel[message.conversationId] ?? [];
          return {
            messagesByChannel: {
              ...state.messagesByChannel,
              [message.conversationId]: upsertMessage(currentMessages, message)
            }
          };
        });
        return;
      }
      case "message.pin.updated": {
        const payload = parseMessagePinPayload(event.payload);
        if (!payload) {
          return;
        }
        applyPinnedMessageUpdate(payload);
        return;
      }
      case "message.reaction.updated": {
        const payload = parseMessageReactionPayload(event.payload);
        if (!payload) {
          return;
        }
        applyReactionUpdate(payload);
        return;
      }
      case "dm.created": {
        void get().loadDMs();
        toastInfo("Yeni DM oluşturuldu", "Direkt mesaj listesi güncellendi.", "dm-created");
        return;
      }
      case "channel.created":
      case "channel.updated":
      case "channel.deleted": {
        const serverID = get().selectedServerId;
        if (serverID) {
          void get().loadChannels(serverID);
        }
        if (event.type === "channel.created") {
          toastInfo("Kanal oluşturuldu", "Sunucu kanal listesi güncellendi.", "channel-created-event");
        }
        return;
      }
      case "server.member.updated": {
        const payload = isRecord(event.payload) ? event.payload : null;
        const serverID = typeof payload?.serverId === "string" ? payload.serverId : null;
        const selectedServerID = get().selectedServerId;

        if (selectedServerID && serverID && selectedServerID === serverID) {
          void get().loadServerMembers(selectedServerID);
          void get().loadVoiceChannels(selectedServerID);
        }
        void get().loadServers();
        return;
      }
      case "server.updated":
      case "server.deleted": {
        const payload = isRecord(event.payload) ? event.payload : null;
        const serverID = typeof payload?.serverId === "string" ? payload.serverId : null;
        const selectedServerID = get().selectedServerId;
        if (selectedServerID && serverID && selectedServerID === serverID && event.type === "server.updated") {
          void get().loadChannels(selectedServerID);
          void get().loadServerMembers(selectedServerID);
          void get().loadVoiceChannels(selectedServerID);
        }
        void get().loadServers();
        return;
      }
      case "server.invite.created":
      case "server.invite.updated": {
        const invite = parseServerInvitePayload(event.payload);
        if (!invite) {
          return;
        }

        void get().loadServerInvites();

        if (event.type === "server.invite.created") {
          const me = get().currentUser;
          if (!me || invite.invitedUserId !== me.id) {
            return;
          }

          toastInfo(
            "Sunucu daveti geldi",
            `${invite.invitedByDisplayName} seni ${invite.serverName} sunucusuna davet etti.`,
            `server-invite-created-${invite.id}`
          );
        }
        return;
      }
      case "friend.request.created":
      case "friend.request.updated":
      case "friendship.updated":
      case "friendship.removed": {
        void get().loadFriendRequests();
        void get().loadFriends();
        return;
      }
      case "user.typing.started":
      case "user.typing.stopped": {
        const typing = parseTypingPayload(event.payload);
        const me = get().currentUser;
        if (!typing || typing.conversationType !== "dm" || (me && typing.userId === me.id)) {
          return;
        }

        set((state) => {
          const existing = state.typingByDM[typing.conversationId] ?? [];
          if (event.type === "user.typing.started") {
            if (existing.includes(typing.userId)) {
              return state;
            }
            return {
              typingByDM: {
                ...state.typingByDM,
                [typing.conversationId]: [...existing, typing.userId]
              }
            };
          }

          return {
            typingByDM: {
              ...state.typingByDM,
              [typing.conversationId]: existing.filter((id) => id !== typing.userId)
            }
          };
        });
        return;
      }
      case "user.presence.updated": {
        const presence = parsePresencePayload(event.payload);
        if (!presence) {
          return;
        }
        set((state) => ({
          presenceByUser: {
            ...state.presenceByUser,
            [presence.userId]: normalizePresenceState({
              status: presence.status,
              lastSeen: presence.lastSeen
            })
          }
        }));
        return;
      }
      case "voice.join":
      case "voice.leave":
      case "voice.mute":
      case "voice.unmute":
      case "voice.channel.created":
      case "voice.channel.updated":
      case "voice.channel.deleted": {
        void get().loadVoiceChannels(get().selectedServerId ?? undefined);
        return;
      }
      case "voice.speaking.start": {
        const payload = parseVoiceSpeakingPayload(event.payload);
        if (payload) {
          setVoiceSpeaking(payload, true);
        }
        return;
      }
      case "voice.speaking.stop": {
        const payload = parseVoiceSpeakingPayload(event.payload);
        if (payload) {
          setVoiceSpeaking(payload, false);
        }
        return;
      }
      default:
        return;
    }
  };

  const scheduleReconnect = () => {
    clearReconnectTimer();
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (get().appStatus !== "authenticated" || !get().tokens?.accessToken) {
        return;
      }
      get().connectRealtime();
    }, reconnectAfterMs);
  };

  const scheduleWsDisconnectToast = () => {
    if (wsDisconnectToastShown || wsDisconnectToastTimer) {
      return;
    }

    wsDisconnectToastTimer = setTimeout(() => {
      wsDisconnectToastTimer = null;
      const state = get();
      if (state.appStatus !== "authenticated" || state.wsConnected) {
        return;
      }

      wsDisconnectToastShown = true;
      toastWarning("Bağlantı koptu", "Yeniden bağlanmayı deniyorum...", "ws-closed-persistent");
    }, WS_DISCONNECT_TOAST_DELAY_MS);
  };

  const loadMessagesForConversation = async (conversationType: "dm" | "channel", conversationID: string) => {
    set({ loadingMessages: true, error: null });
    try {
      const response = await requestJSON<{ messages: Message[] }>(
        `/api/v1/messages?conversation_type=${conversationType}&conversation_id=${encodeURIComponent(conversationID)}&limit=100`
      );

      if (conversationType === "dm") {
        set((state) => ({
          messagesByDM: {
            ...state.messagesByDM,
            [conversationID]: sortedMessages(response.messages ?? [])
          },
          typingByDM: {
            ...state.typingByDM,
            [conversationID]: []
          }
        }));
      } else {
        set((state) => ({
          messagesByChannel: {
            ...state.messagesByChannel,
            [conversationID]: sortedMessages(response.messages ?? [])
          }
        }));
      }
    } catch (error) {
      set({ error: error instanceof Error ? error.message : "Mesajlar yüklenemedi." });
    } finally {
      set({ loadingMessages: false });
    }
  };

  const ensureSocketReady = async () => {
    if (socket && socket.readyState === WebSocket.OPEN) {
      return;
    }

    get().connectRealtime();
    const timeoutAt = Date.now() + 6000;
    while ((!socket || socket.readyState !== WebSocket.OPEN) && Date.now() < timeoutAt) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    if (!socket || socket.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket bağlantısı kurulamadı.");
    }
  };

  const ensureLiveKitConnected = async (joinResponse: VoiceJoinResponse) => {
    await disconnectLiveKit();

    const room = new Room();
    liveKitRoom = room;
    liveKitChannelId = joinResponse.channel.id;
    localSpeaking = false;

    room.on(RoomEvent.Connected, () => {
      set({ liveKitConnected: true });
    });

    room.on(RoomEvent.Disconnected, () => {
      clearRemoteScreenShareTracks();
      set({ liveKitConnected: false, remoteScreenShares: [] });
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      void get().loadVoiceChannels(get().selectedServerId ?? undefined);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      void get().loadVoiceChannels(get().selectedServerId ?? undefined);
      removeRemoteScreenSharesForParticipant(participant.sid);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        const mediaElement = track.attach();
        attachRemoteAudioTrack(
          participant.sid,
          participant.identity,
          publication.trackSid,
          mediaElement,
          publication.source === Track.Source.ScreenShareAudio ? "screen-share" : "participant"
        );
        return;
      }

      if (track.kind !== Track.Kind.Video) {
        return;
      }

      if (track.source !== Track.Source.ScreenShare && track.source !== Track.Source.Camera) {
        return;
      }

      upsertRemoteScreenShare(
        participant.sid,
        publication.trackSid,
        track as RemoteVideoTrack,
        participant.name ?? participant.identity,
        participant.identity
      );
    });

    room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Audio) {
        track.detach();
        detachRemoteAudioTrack(participant.sid, publication.trackSid);
        return;
      }

      if (track.kind !== Track.Kind.Video) {
        return;
      }

      removeRemoteScreenShare(participant.sid, publication.trackSid);
    });

    room.on(RoomEvent.Reconnected, () => {
      const activeVoiceChannelId = get().activeVoiceChannelId;
      if (!activeVoiceChannelId) {
        return;
      }
      void sendSocketRequest<VoiceJoinResponse>("voice.join", { channelId: activeVoiceChannelId }).catch(() => {
        // noop
      });
    });

    await room.connect(joinResponse.liveKit.url, joinResponse.liveKit.token);
    await room.startAudio();
    for (const participant of room.remoteParticipants.values()) {
      for (const publication of participant.trackPublications.values()) {
        if (!publication.track) {
          continue;
        }

        if (publication.kind === Track.Kind.Audio) {
          const mediaElement = publication.track.attach();
          attachRemoteAudioTrack(
            participant.sid,
            participant.identity,
            publication.trackSid,
            mediaElement,
            publication.source === Track.Source.ScreenShareAudio ? "screen-share" : "participant"
          );
          continue;
        }

        if (publication.kind === Track.Kind.Video) {
          if (publication.track.source !== Track.Source.ScreenShare && publication.track.source !== Track.Source.Camera) {
            continue;
          }
          upsertRemoteScreenShare(
            participant.sid,
            publication.trackSid,
            publication.track as RemoteVideoTrack,
            participant.name ?? participant.identity,
            participant.identity
          );
        }
      }
    }

    room.localParticipant.on(ParticipantEvent.IsSpeakingChanged, (speaking: boolean) => {
      const activeVoiceChannelId = get().activeVoiceChannelId;
      if (!activeVoiceChannelId || activeVoiceChannelId !== liveKitChannelId) {
        return;
      }
      if (localSpeaking === speaking) {
        return;
      }
      localSpeaking = speaking;
      syncCurrentUserVoiceState(activeVoiceChannelId, { speaking });
      sendSocketAction(speaking ? "voice.speaking.start" : "voice.speaking.stop", {
        channelId: activeVoiceChannelId
      });
    });

    await applyVoiceVideoPreferencesToLiveKit({
      muted: joinResponse.state.muted,
      deafened: joinResponse.state.deafened
    });
    applyRemoteAudioMuted(joinResponse.state.deafened);
    syncCurrentUserVoiceState(joinResponse.channel.id, {
      muted: joinResponse.state.muted,
      deafened: joinResponse.state.deafened,
      speaking: false
    });

    set({
      liveKitConnected: true,
      voiceMuted: joinResponse.state.muted,
      voiceDeafened: joinResponse.state.deafened
    });
  };

  const restoreVoiceSession = async () => {
    const activeVoiceChannelId = get().activeVoiceChannelId;
    if (!activeVoiceChannelId) {
      return;
    }

    try {
      const joinResponse = await sendSocketRequest<VoiceJoinResponse>("voice.join", {
        channelId: activeVoiceChannelId
      });
      if (!liveKitRoom) {
        await ensureLiveKitConnected(joinResponse);
      }
      await get().loadVoiceChannels(get().selectedServerId ?? undefined);
    } catch {
      // noop
    }
  };
  return {
    appStatus: "booting",
    authMode: "login",
    authLoading: false,
    loadingDMs: false,
    loadingMessages: false,
    sendingMessage: false,
    wsConnected: false,
    error: null,
    profileUpdating: false,
    passwordUpdating: false,
    currentUser: null,
    tokens: null,
    dms: [],
    selectedDMId: null,
    selectedChannelId: null,
    unreadByDM: {},
    totalUnread: 0,
    messagesByDM: {},
    messagesByChannel: {},
    typingByDM: {},
    presenceByUser: {},
    userSearchQuery: "",
    userSearchLoading: false,
    userSearchResults: [],
    friends: [],
    friendRequestsIncoming: [],
    friendRequestsOutgoing: [],
    friendPrivacySettings: DEFAULT_FRIEND_PRIVACY_SETTINGS,
    blockedUsers: [],
    loadingFriends: false,
    loadingFriendRequests: false,
    loadingFriendPrivacy: false,
    loadingBlockedUsers: false,
    sendingFriendRequest: false,
    updatingFriendPrivacy: false,
    blockingUser: false,
    servers: [],
    selectedServerId: null,
    channelsByServer: {},
    serverMembersByServer: {},
    serverInvitesIncoming: [],
    loadingServers: false,
    loadingChannels: false,
    loadingServerMembers: false,
    loadingServerInvites: false,
    creatingServer: false,
    creatingTextChannel: false,
    creatingVoiceChannel: false,
    voiceChannels: [],
    loadingVoiceChannels: false,
    activeVoiceChannelId: null,
    activeVoiceChannelSnapshot: null,
    voiceMuted: false,
    voiceDeafened: false,
    voiceConnecting: false,
    liveKitConnected: false,
    screenShareStarting: false,
    screenShareActive: false,
    screenShareSourceKind: null,
    screenShareSourceLabel: null,
    screenShareQuality: "1080p",
    screenShareFPS: 30,
    screenShareIncludeSystemAudio: false,
    localScreenShareTrack: null,
    remoteScreenShares: [],

    initialize: async () => {
      const storedTokens = await readStoredTokens();
      if (!storedTokens) {
        set({ appStatus: "unauthenticated" });
        return;
      }

      setStoredTokens(storedTokens);

      try {
        const me = await requestJSON<UserProfile>("/api/v1/users/me");
        set({
          appStatus: "authenticated",
          currentUser: me,
          error: null
        });
        await get().loadServers();
        await get().loadDMs();
        await get().loadFriends();
        await get().loadFriendRequests();
        await get().loadServerInvites();
        await get().loadFriendPrivacySettings();
        await get().loadBlockedUsers();
        await get().loadVoiceChannels(get().selectedServerId ?? undefined);
        void requestDesktopNotificationPermission();
        get().connectRealtime();
      } catch {
        await resetSession("Oturum doğrulanamadı. Tekrar giriş yapın.");
      }
    },

    setAuthMode: (mode) => {
      set({ authMode: mode, error: null });
    },

    login: async (emailOrUsername, password, turnstileToken) => {
      set({ authLoading: true, error: null });
      try {
        const desktopClient = isTauriDesktop();
        const response = await requestJSON<AuthResponse>(
          "/api/v1/auth/login",
          {
            method: "POST",
            body: JSON.stringify({ emailOrUsername, password, turnstileToken, desktopClient })
          },
          { auth: false }
        );
        setStoredTokens(response.tokens);
        set({
          appStatus: "authenticated",
          currentUser: response.user,
          error: null
        });
        await get().loadServers();
        await get().loadDMs();
        await get().loadFriends();
        await get().loadFriendRequests();
        await get().loadServerInvites();
        await get().loadFriendPrivacySettings();
        await get().loadBlockedUsers();
        await get().loadVoiceChannels(get().selectedServerId ?? undefined);
        void requestDesktopNotificationPermission();
        get().connectRealtime();
      } catch (error) {
        const message = error instanceof Error ? error.message : "Giriş yapılamadı.";
        set({ error: message });
        toastError("Giriş başarısız", message, "auth-login-failed");
      } finally {
        set({ authLoading: false });
      }
    },

    register: async (email, username, password, turnstileToken) => {
      set({ authLoading: true, error: null });
      try {
        const desktopClient = isTauriDesktop();
        const response = await requestJSON<AuthResponse>(
          "/api/v1/auth/register",
          {
            method: "POST",
            body: JSON.stringify({ email, username, password, turnstileToken, desktopClient })
          },
          { auth: false }
        );
        setStoredTokens(response.tokens);
        set({
          appStatus: "authenticated",
          currentUser: response.user,
          error: null
        });
        await get().loadServers();
        await get().loadDMs();
        await get().loadFriends();
        await get().loadFriendRequests();
        await get().loadServerInvites();
        await get().loadFriendPrivacySettings();
        await get().loadBlockedUsers();
        await get().loadVoiceChannels(get().selectedServerId ?? undefined);
        void requestDesktopNotificationPermission();
        get().connectRealtime();
        toastSuccess("Hesap oluşturuldu", "Yeni hesabınla giriş yapıldı.", "auth-register-success");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kayıt oluşturulamadı.";
        set({ error: message });
        toastError("Kayıt başarısız", message, "auth-register-failed");
      } finally {
        set({ authLoading: false });
      }
    },

    logout: async () => {
      const refreshToken = get().tokens?.refreshToken;
      if (refreshToken) {
        try {
          await requestJSON<{ status: string }>(
            "/api/v1/auth/logout",
            {
              method: "POST",
              body: JSON.stringify({ refreshToken })
            },
            { auth: false, retry: false }
          );
        } catch {
          // noop
        }
      }
      await resetSession(null);
    },

    updateProfile: async (input) => {
      const current = get().currentUser;
      if (!current) {
        return false;
      }

      const payload: UpdateProfileRequest = {};

      if (typeof input.username === "string") {
        const normalized = input.username.trim();
        if (!normalized) {
          set({ error: "Kullanıcı adı boş olamaz." });
          return false;
        }
        payload.username = normalized;
      }

      if (typeof input.displayName === "string") {
        const normalized = input.displayName.trim();
        if (!normalized) {
          set({ error: "Görünen ad boş olamaz." });
          return false;
        }
        payload.displayName = normalized;
      }

      if (typeof input.bio === "string") {
        payload.bio = input.bio.trim();
      }

      if (typeof input.avatarPath === "string") {
        payload.avatarPath = input.avatarPath.trim();
      }

      if (Object.keys(payload).length === 0) {
        return true;
      }

      set({ profileUpdating: true, error: null });
      try {
        const updated = await requestJSON<UserProfile>("/api/v1/users/me", {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        set({ currentUser: updated, error: null });
        toastSuccess("Profil güncellendi", "Profil bilgilerin kaydedildi.", "profile-updated");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Profil güncellenemedi.";
        set({ error: message });
        toastError("Profil güncellenemedi", message, "profile-update-failed");
        return false;
      } finally {
        set({ profileUpdating: false });
      }
    },

    updateSelfPresenceStatus: async (status) => {
      const currentUser = get().currentUser;
      const userId = currentUser?.id?.trim();
      const normalizedStatus = normalizePresenceStatus(status);
      if (!userId || normalizedStatus === "unknown") {
        return false;
      }

      try {
        const response = await requestJSON<{ status: string }>("/api/v1/users/me/presence", {
          method: "PATCH",
          body: JSON.stringify({ status: normalizedStatus })
        });
        const resolvedStatus = normalizePresenceStatus(response.status);
        set((state) => ({
          error: null,
          presenceByUser: {
            ...state.presenceByUser,
            [userId]: normalizePresenceState({
              status: resolvedStatus,
              lastSeen: resolvedStatus === "invisible" || resolvedStatus === "offline" ? new Date().toISOString() : undefined
            })
          }
        }));
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Durum güncellenemedi.";
        set({ error: message });
        toastError("Durum güncellenemedi", message, "presence-update-failed");
        return false;
      }
    },

    changePassword: async (currentPassword, newPassword) => {
      const normalizedCurrent = currentPassword.trim();
      const normalizedNext = newPassword.trim();

      if (!normalizedCurrent || !normalizedNext) {
        set({ error: "Mevcut şifre ve yeni şifre zorunludur." });
        return false;
      }

      if (normalizedCurrent === normalizedNext) {
        set({ error: "Yeni şifre mevcut şifre ile aynı olamaz." });
        return false;
      }

      set({ passwordUpdating: true, error: null });
      try {
        await requestJSON<{ status: string }>("/api/v1/auth/change-password", {
          method: "POST",
          body: JSON.stringify({
            currentPassword,
            newPassword
          })
        });
        toastSuccess("Kaydedildi", "Şifren başarıyla güncellendi.", "password-updated");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Şifre güncellenemedi.";
        set({ error: message });
        toastError("Şifre güncellenemedi", message, "password-update-failed");
        return false;
      } finally {
        set({ passwordUpdating: false });
      }
    },

    loadServers: async () => {
      set({ loadingServers: true, error: null });
      try {
        const response = await requestJSON<ServersResponse>("/api/v1/servers");
        const servers = sortServers(response.servers ?? []);
        const previousSelected = get().selectedServerId;
        const selectedStillExists = servers.some((item) => item.id === previousSelected);
        const selectedServerId = selectedStillExists ? previousSelected : null;

        set({
          servers,
          selectedServerId,
          selectedDMId: selectedServerId ? null : get().selectedDMId
        });
        syncSelectedServerRoomSubscription();

        if (selectedServerId) {
          await get().loadChannels(selectedServerId);
          await get().loadServerMembers(selectedServerId);
          await get().loadVoiceChannels(selectedServerId);
        } else {
          set({ voiceChannels: [], selectedChannelId: null });
          syncSelectedChannelRoomSubscription();
          syncSelectedServerRoomSubscription();
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucular yüklenemedi." });
      } finally {
        set({ loadingServers: false });
      }
    },

    createServer: async (name) => {
      const normalized = name.trim();
      if (!normalized) {
        set({ error: "Sunucu adı boş olamaz." });
        return null;
      }

      set({ creatingServer: true, error: null });
      try {
        const created = await requestJSON<ServerSummary>("/api/v1/servers", {
          method: "POST",
          body: JSON.stringify({ name: normalized })
        });

        set((state) => ({
          servers: sortServers([...state.servers, created]),
          selectedServerId: created.id,
          selectedDMId: null
        }));
        syncSelectedServerRoomSubscription();

        await get().loadChannels(created.id);
        await get().loadServerMembers(created.id);
        await get().loadVoiceChannels(created.id);
        toastSuccess("Sunucu oluşturuldu", `${created.name} sunucusu hazır.`, "server-created");
        return created;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sunucu oluşturulamadı.";
        set({ error: message });
        toastError("Sunucu oluşturulamadı", message, "server-create-failed");
        return null;
      } finally {
        set({ creatingServer: false });
      }
    },

    selectServer: async (serverId) => {
      const normalized = serverId?.trim() ?? "";
      const selectedServerId = normalized || null;
      const previousConversationID = get().selectedDMId;
      if (previousConversationID) {
        stopTypingForConversation(previousConversationID);
      }
      set({
        selectedServerId,
        selectedDMId: null,
        error: null
      });
      syncSelectedServerRoomSubscription();
      if (!selectedServerId) {
        set({ selectedChannelId: null, voiceChannels: [] });
        syncSelectedChannelRoomSubscription();
        syncSelectedServerRoomSubscription();
        return;
      }

      await get().loadChannels(selectedServerId);
      await get().loadServerMembers(selectedServerId);
      await get().loadVoiceChannels(selectedServerId);
    },

    updateServerName: async (serverId, name) => {
      const normalizedServerID = serverId.trim();
      const normalizedName = name.trim();
      if (!normalizedServerID || !normalizedName) {
        set({ error: "Sunucu adı boş olamaz." });
        return null;
      }

      set({ error: null });
      try {
        const updated = await requestJSON<ServerSummary>(`/api/v1/servers/${encodeURIComponent(normalizedServerID)}`, {
          method: "PATCH",
          body: JSON.stringify({ name: normalizedName })
        });

        set((state) => ({
          servers: sortServers(state.servers.map((item) => (item.id === updated.id ? updated : item)))
        }));
        toastSuccess("Sunucu güncellendi", `${updated.name} adı kaydedildi.`, `server-updated-${updated.id}`);

        return updated;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu güncellenemedi." });
        return null;
      }
    },

    leaveServer: async (serverId) => {
      const normalizedServerID = serverId.trim();
      if (!normalizedServerID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ left: boolean }>(`/api/v1/servers/${encodeURIComponent(normalizedServerID)}/leave`, {
          method: "POST"
        });
        await get().loadServers();
        toastInfo("Sunucudan ayrıldın", "Sunucu üyeliğin sonlandırıldı.", `server-left-${normalizedServerID}`);
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucudan ayrılamadın." });
        return false;
      }
    },

    deleteServer: async (serverId) => {
      const normalizedServerID = serverId.trim();
      if (!normalizedServerID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/servers/${encodeURIComponent(normalizedServerID)}`, {
          method: "DELETE"
        });
        await get().loadServers();
        toastWarning("Sunucu silindi", "Sunucu kalıcı olarak kaldırıldı.", `server-deleted-${normalizedServerID}`);
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu silinemedi." });
        return false;
      }
    },

    loadServerMembers: async (serverId) => {
      const normalizedServerID = serverId.trim();
      if (!normalizedServerID) {
        return;
      }

      set({ loadingServerMembers: true, error: null });
      try {
        const response = await requestJSON<ServerMembersResponse>(`/api/v1/servers/${encodeURIComponent(normalizedServerID)}/members`);
        const members = (response.members ?? []).map((member) => ({
          ...member,
          status: normalizePresenceStatus(member.status)
        }));
        const presencePatch: Record<string, PresenceState> = {};
        for (const member of members) {
          presencePatch[member.userId] = normalizePresenceState({
            status: member.status,
            lastSeen: member.lastSeenAt
          });
        }
        set((state) => ({
          serverMembersByServer: {
            ...state.serverMembersByServer,
            [normalizedServerID]: members
          },
          presenceByUser: {
            ...state.presenceByUser,
            ...presencePatch
          }
        }));
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu üyeleri yüklenemedi." });
      } finally {
        set({ loadingServerMembers: false });
      }
    },

    updateServerMemberRole: async (serverId, memberUserId, role) => {
      const normalizedServerID = serverId.trim();
      const normalizedMemberID = memberUserId.trim();
      const normalizedRole = role.trim().toLowerCase();
      if (!normalizedServerID || !normalizedMemberID) {
        return null;
      }
      if (normalizedRole !== "admin" && normalizedRole !== "member") {
        set({ error: "Rol sadece admin veya member olabilir." });
        return null;
      }

      set({ error: null });
      try {
        const updated = await requestJSON<ServerMember>(
          `/api/v1/servers/${encodeURIComponent(normalizedServerID)}/members/${encodeURIComponent(normalizedMemberID)}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              role: normalizedRole
            })
          }
        );

        set((state) => {
          const existing = state.serverMembersByServer[normalizedServerID] ?? [];
          return {
            serverMembersByServer: {
              ...state.serverMembersByServer,
              [normalizedServerID]: existing.map((member) => (member.userId === updated.userId ? updated : member))
            }
          };
        });

        toastSuccess("Üye rolü güncellendi", `@${updated.username} artık ${updated.role}.`, `server-role-updated-${updated.userId}`);
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Üye rolü güncellenemedi.";
        set({ error: message });
        toastError("Rol güncellenemedi", message, "server-role-update-failed");
        return null;
      }
    },

    inviteServerMember: async (serverId, userId) => {
      const normalizedServerID = serverId.trim();
      const normalizedUserID = userId.trim();
      if (!normalizedServerID || !normalizedUserID) {
        return null;
      }

      set({ error: null });
      try {
        const response = await requestJSON<InviteServerMemberResponse>(
          `/api/v1/servers/${encodeURIComponent(normalizedServerID)}/members`,
          {
            method: "POST",
            body: JSON.stringify({ userId: normalizedUserID })
          }
        );
        return response;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucuya kullanıcı davet edilemedi." });
        return null;
      }
    },

    loadServerInvites: async () => {
      set({ loadingServerInvites: true, error: null });
      try {
        const response = await requestJSON<ServerInvitesResponse>("/api/v1/servers/invites");
        const invites = [...(response.invites ?? [])].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
        set({ serverInvitesIncoming: invites });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu davetleri yüklenemedi." });
      } finally {
        set({ loadingServerInvites: false });
      }
    },

    acceptServerInvite: async (inviteId) => {
      const normalizedInviteID = inviteId.trim();
      if (!normalizedInviteID) {
        return false;
      }

      set({ error: null });
      try {
        const response = await requestJSON<AcceptServerInviteResponse>(
          `/api/v1/servers/invites/${encodeURIComponent(normalizedInviteID)}/accept`,
          {
            method: "POST"
          }
        );
        await get().loadServerInvites();
        await get().loadServers();
        toastSuccess("Sunucu daveti kabul edildi", `${response.server.name} sunucusuna katıldın.`, `server-invite-accept-${normalizedInviteID}`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sunucu daveti kabul edilemedi.";
        set({ error: message });
        toastError("Davet kabul edilemedi", message, "server-invite-accept-failed");
        return false;
      }
    },

    rejectServerInvite: async (inviteId) => {
      const normalizedInviteID = inviteId.trim();
      if (!normalizedInviteID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/servers/invites/${encodeURIComponent(normalizedInviteID)}/reject`, {
          method: "POST"
        });
        await get().loadServerInvites();
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Sunucu daveti reddedilemedi.";
        set({ error: message });
        toastError("Davet reddedilemedi", message, "server-invite-reject-failed");
        return false;
      }
    },

    removeServerMember: async (serverId, memberUserId) => {
      const normalizedServerID = serverId.trim();
      const normalizedMemberID = memberUserId.trim();
      if (!normalizedServerID || !normalizedMemberID) {
        return;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(
          `/api/v1/servers/${encodeURIComponent(normalizedServerID)}/members/${encodeURIComponent(normalizedMemberID)}`,
          {
            method: "DELETE"
          }
        );
        await get().loadServerMembers(normalizedServerID);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Sunucu üyesi kaldırılamadı." });
      }
    },

    loadChannels: async (serverId) => {
      const normalizedServerID = serverId.trim();
      if (!normalizedServerID) {
        return;
      }

      set({ loadingChannels: true, error: null });
      try {
        const response = await requestJSON<ChannelsResponse>(
          `/api/v1/channels?server_id=${encodeURIComponent(normalizedServerID)}&kind=text`
        );
        const channels = sortTextChannels(response.channels ?? []);
        const previousSelected = get().selectedChannelId;
        const selectedStillExists = channels.some((item) => item.id === previousSelected);
        const nextSelected = selectedStillExists ? previousSelected : (channels[0]?.id ?? null);

        set((state) => ({
          channelsByServer: {
            ...state.channelsByServer,
            [normalizedServerID]: channels
          },
          selectedChannelId: nextSelected
        }));

        if (nextSelected) {
          clearUnreadForConversation(nextSelected);
          await loadMessagesForConversation("channel", nextSelected);
          syncSelectedChannelRoomSubscription();
        } else {
          syncSelectedChannelRoomSubscription();
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Metin kanalları yüklenemedi." });
      } finally {
        set({ loadingChannels: false });
      }
    },

    createTextChannel: async (serverId, name, kind = "text") => {
      const normalizedServerID = serverId.trim();
      const normalizedName = name.trim();
      if (!normalizedServerID || !normalizedName) {
        set({ error: "Kanal adı boş olamaz." });
        return null;
      }

      set({ creatingTextChannel: true, error: null });
      try {
        const created = await requestJSON<Channel>("/api/v1/channels", {
          method: "POST",
          body: JSON.stringify({
            serverId: normalizedServerID,
            name: normalizedName,
            kind
          })
        });

        set((state) => {
          const existing = state.channelsByServer[normalizedServerID] ?? [];
          return {
            channelsByServer: {
              ...state.channelsByServer,
              [normalizedServerID]: sortTextChannels([...existing, created])
            },
            selectedChannelId: created.id
          };
        });

        clearUnreadForConversation(created.id);
        await loadMessagesForConversation("channel", created.id);
        syncSelectedChannelRoomSubscription();
        toastSuccess("Kanal oluşturuldu", `#${created.name} oluşturuldu.`, `channel-created-${created.id}`);
        return created;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kanal oluşturulamadı.";
        set({ error: message });
        toastError("Kanal oluşturulamadı", message, "channel-create-failed");
        return null;
      } finally {
        set({ creatingTextChannel: false });
      }
    },

    updateTextChannel: async (channelId, patch) => {
      const normalizedChannelID = channelId.trim();
      if (!normalizedChannelID) {
        return null;
      }

      const payload: { name?: string; kind?: "text" | "announcement" } = {};
      if (typeof patch.name === "string") {
        const trimmed = patch.name.trim();
        if (!trimmed) {
          set({ error: "Kanal adı boş olamaz." });
          return null;
        }
        payload.name = trimmed;
      }
      if (patch.kind === "text" || patch.kind === "announcement") {
        payload.kind = patch.kind;
      }
      if (!payload.name && !payload.kind) {
        return null;
      }

      set({ error: null });
      try {
        const updated = await requestJSON<Channel>(`/api/v1/channels/${encodeURIComponent(normalizedChannelID)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });

        set((state) => {
          const existing = state.channelsByServer[updated.serverId] ?? [];
          return {
            channelsByServer: {
              ...state.channelsByServer,
              [updated.serverId]: sortTextChannels(existing.map((item) => (item.id === updated.id ? updated : item)))
            }
          };
        });

        toastSuccess("Kanal güncellendi", `#${updated.name} kaydedildi.`, `channel-updated-${updated.id}`);
        return updated;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kanal güncellenemedi.";
        set({ error: message });
        toastError("Kanal güncellenemedi", message, "channel-update-failed");
        return null;
      }
    },

    deleteTextChannel: async (channelId) => {
      const normalizedChannelID = channelId.trim();
      if (!normalizedChannelID) {
        return false;
      }

      set({ error: null });
      try {
        const deleted = await requestJSON<DeletedChannelResponse>(`/api/v1/channels/${encodeURIComponent(normalizedChannelID)}`, {
          method: "DELETE"
        });

        set((state) => {
          const existing = state.channelsByServer[deleted.serverId] ?? [];
          const nextChannels = existing.filter((item) => item.id !== deleted.id);
          const selectedChannelId = state.selectedChannelId === deleted.id ? (nextChannels[0]?.id ?? null) : state.selectedChannelId;
          return {
            channelsByServer: {
              ...state.channelsByServer,
              [deleted.serverId]: nextChannels
            },
            selectedChannelId
          };
        });

        const nextSelected = get().selectedChannelId;
        if (nextSelected) {
          await loadMessagesForConversation("channel", nextSelected);
        }
        syncSelectedChannelRoomSubscription();
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Kanal silinemedi." });
        return false;
      }
    },

    selectChannel: async (channelId) => {
      const normalizedChannelID = channelId?.trim() ?? "";
      const nextChannelID = normalizedChannelID || null;
      if (!nextChannelID) {
        set({ selectedChannelId: null });
        syncSelectedChannelRoomSubscription();
        return;
      }

      set({
        selectedChannelId: nextChannelID,
        selectedDMId: null,
        error: null
      });
      clearUnreadForConversation(nextChannelID);
      await loadMessagesForConversation("channel", nextChannelID);
      syncSelectedChannelRoomSubscription();
    },

    loadDMs: async () => {
      set({ loadingDMs: true, error: null });
      try {
        const response = await requestJSON<{ conversations: DMConversation[] }>("/api/v1/dms");
        const conversations = sortedDMs(response.conversations ?? []);
        const previousSelected = get().selectedDMId;
        const selectedStillExists = conversations.some((item) => item.conversationId === previousSelected);
        const nextSelected = selectedStillExists ? previousSelected : null;

        set({
          dms: conversations,
          selectedDMId: nextSelected
        });
        syncSelectedDMRoomSubscription();

        if (nextSelected) {
          clearUnreadForConversation(nextSelected);
          await loadMessagesForConversation("dm", nextSelected);
        }
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "DM listesi yüklenemedi." });
      } finally {
        set({ loadingDMs: false });
      }
    },

    clearSelectedDM: () => {
      const previousConversationID = get().selectedDMId;
      if (previousConversationID) {
        stopTypingForConversation(previousConversationID);
      }

      set({
        selectedDMId: null,
        loadingMessages: false,
        error: null
      });
      syncSelectedDMRoomSubscription();
    },

    clearUnreadForDM: (conversationID) => {
      clearUnreadForConversation(conversationID);
    },

    clearAllUnread: () => {
      clearAllUnreadState();
    },

    markConversationUnread: (conversationID) => {
      incrementUnreadForConversation(conversationID);
    },

    selectDM: async (conversationID) => {
      const previousConversationID = get().selectedDMId;
      if (previousConversationID && previousConversationID !== conversationID) {
        stopTypingForConversation(previousConversationID);
      }

      // Closed DM entries are only a visibility preference. Selecting a DM explicitly
      // must always reopen it so navigation and message loading remain consistent.
      useDMContextStore.getState().reopenDM(conversationID);

      set({
        selectedDMId: conversationID,
        selectedServerId: null,
        selectedChannelId: null,
        error: null
      });
      clearUnreadForConversation(conversationID);
      syncSelectedDMRoomSubscription();
      await loadMessagesForConversation("dm", conversationID);
      syncSelectedChannelRoomSubscription();
    },

    sendMessage: async (content) => {
      const selectedDMID = get().selectedDMId;
      const selectedChannelID = get().selectedChannelId;
      if (!selectedDMID && !selectedChannelID) {
        return false;
      }

      const normalized = content.trim();
      if (!normalized) {
        return false;
      }

      const conversationType = selectedDMID ? "dm" : "channel";
      const conversationID = selectedDMID ?? selectedChannelID ?? "";
      return get().sendMessageToConversation(conversationType, conversationID, normalized);
    },

    sendMessageToConversation: async (conversationType, conversationID, content) => {
      const normalizedConversationID = conversationID.trim();
      const normalizedContent = content.trim();
      if (!normalizedConversationID || !normalizedContent) {
        return false;
      }

      set({ sendingMessage: true, error: null });
      try {
        const created = await requestJSON<Message>("/api/v1/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationType,
            conversationId: normalizedConversationID,
            content: normalizedContent
          })
        });

        if (conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[normalizedConversationID] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [normalizedConversationID]: upsertMessage(currentMessages, created)
              },
              dms: upsertConversationFromMessage(state, created)
            };
          });
        } else {
          set((state) => {
            const currentMessages = state.messagesByChannel[normalizedConversationID] ?? [];
            return {
              messagesByChannel: {
                ...state.messagesByChannel,
                [normalizedConversationID]: upsertMessage(currentMessages, created)
              }
            };
          });
        }
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj gönderilemedi." });
        return false;
      } finally {
        set({ sendingMessage: false });
      }
    },

    sendMessageWithAttachments: async (conversationType, conversationID, content, files) => {
      const normalizedConversationID = conversationID.trim();
      const normalizedContent = content.trim();
      const validFiles = files.filter((item) => item.size > 0);

      if (!normalizedConversationID || validFiles.length === 0) {
        return false;
      }

      const placeholder = normalizedContent || "📎 Dosya eklendi";

      set({ sendingMessage: true, error: null });
      try {
        const created = await requestJSON<Message>("/api/v1/messages", {
          method: "POST",
          body: JSON.stringify({
            conversationType,
            conversationId: normalizedConversationID,
            content: placeholder
          })
        });

        if (conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[normalizedConversationID] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [normalizedConversationID]: upsertMessage(currentMessages, created)
              },
              dms: upsertConversationFromMessage(state, created)
            };
          });
        } else {
          set((state) => {
            const currentMessages = state.messagesByChannel[normalizedConversationID] ?? [];
            return {
              messagesByChannel: {
                ...state.messagesByChannel,
                [normalizedConversationID]: upsertMessage(currentMessages, created)
              }
            };
          });
        }

        const uploadedAttachments: UploadedAttachment[] = [];
        for (const file of validFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("messageId", created.id);

          try {
            const attachment = await requestJSON<UploadedAttachment>("/api/v1/uploads", {
              method: "POST",
              body: formData
            });
            uploadedAttachments.push(attachment);
          } catch (uploadError) {
            const message = uploadError instanceof Error ? uploadError.message : `${file.name} yüklenemedi.`;
            toastWarning("Dosya yükleme hatası", message, `upload-failed-${file.name}-${Date.now()}`);
          }
        }

        if (uploadedAttachments.length === 0) {
          if (!normalizedContent) {
            const failed = await requestJSON<Message>(`/api/v1/messages/${encodeURIComponent(created.id)}`, {
              method: "PATCH",
              body: JSON.stringify({ content: "Dosya yüklenemedi." })
            });

            if (conversationType === "dm") {
              set((state) => {
                const currentMessages = state.messagesByDM[normalizedConversationID] ?? [];
                return {
                  messagesByDM: {
                    ...state.messagesByDM,
                    [normalizedConversationID]: upsertMessage(currentMessages, failed)
                  },
                  dms: updateConversationPreviewFromExistingMessage(state, failed)
                };
              });
            } else {
              set((state) => {
                const currentMessages = state.messagesByChannel[normalizedConversationID] ?? [];
                return {
                  messagesByChannel: {
                    ...state.messagesByChannel,
                    [normalizedConversationID]: upsertMessage(currentMessages, failed)
                  }
                };
              });
            }
          }

          set({ error: "Dosya yüklenemedi." });
          return false;
        }

        if (uploadedAttachments.length > 0) {
          const finalContent = mergeMessageWithAttachments(normalizedContent, uploadedAttachments);
          const updated = await requestJSON<Message>(`/api/v1/messages/${encodeURIComponent(created.id)}`, {
            method: "PATCH",
            body: JSON.stringify({ content: finalContent })
          });

          if (conversationType === "dm") {
            set((state) => {
              const currentMessages = state.messagesByDM[normalizedConversationID] ?? [];
              return {
                messagesByDM: {
                  ...state.messagesByDM,
                  [normalizedConversationID]: upsertMessage(currentMessages, updated)
                },
                dms: updateConversationPreviewFromExistingMessage(state, updated)
              };
            });
          } else {
            set((state) => {
              const currentMessages = state.messagesByChannel[normalizedConversationID] ?? [];
              return {
                messagesByChannel: {
                  ...state.messagesByChannel,
                  [normalizedConversationID]: upsertMessage(currentMessages, updated)
                }
              };
            });
          }
        }

        if (uploadedAttachments.length > 0) {
          toastSuccess("Dosyalar yüklendi", `${uploadedAttachments.length} dosya mesaja eklendi.`, "upload-success");
        }

        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Mesaj gönderilemedi.";
        set({ error: message });
        return false;
      } finally {
        set({ sendingMessage: false });
      }
    },

    editMessage: async (messageID, content) => {
      const normalizedMessageID = messageID.trim();
      const normalizedContent = content.trim();
      if (!normalizedMessageID || !normalizedContent) {
        set({ error: "Mesaj içeriği boş olamaz." });
        return false;
      }

      set({ error: null });
      try {
        const updated = await requestJSON<Message>(`/api/v1/messages/${encodeURIComponent(normalizedMessageID)}`, {
          method: "PATCH",
          body: JSON.stringify({ content: normalizedContent })
        });

        if (updated.conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[updated.conversationId] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [updated.conversationId]: upsertMessage(currentMessages, updated)
              },
              dms: updateConversationPreviewFromExistingMessage(state, updated)
            };
          });
        } else {
          set((state) => {
            const currentMessages = state.messagesByChannel[updated.conversationId] ?? [];
            return {
              messagesByChannel: {
                ...state.messagesByChannel,
                [updated.conversationId]: upsertMessage(currentMessages, updated)
              }
            };
          });
        }
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj düzenlenemedi." });
        return false;
      }
    },

    deleteMessage: async (messageID) => {
      const normalizedMessageID = messageID.trim();
      if (!normalizedMessageID) {
        return false;
      }

      set({ error: null });
      try {
        const deleted = await requestJSON<Message>(`/api/v1/messages/${encodeURIComponent(normalizedMessageID)}`, {
          method: "DELETE"
        });

        if (deleted.conversationType === "dm") {
          set((state) => {
            const currentMessages = state.messagesByDM[deleted.conversationId] ?? [];
            return {
              messagesByDM: {
                ...state.messagesByDM,
                [deleted.conversationId]: upsertMessage(currentMessages, deleted)
              },
              dms: updateConversationPreviewFromExistingMessage(state, deleted)
            };
          });
        } else {
          set((state) => {
            const currentMessages = state.messagesByChannel[deleted.conversationId] ?? [];
            return {
              messagesByChannel: {
                ...state.messagesByChannel,
                [deleted.conversationId]: upsertMessage(currentMessages, deleted)
              }
            };
          });
        }
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj silinemedi." });
        return false;
      }
    },

    loadConversationMessageState: async (conversationType, conversationID) => {
      const normalizedConversationID = conversationID.trim();
      if (!normalizedConversationID) {
        return null;
      }

      try {
        const state = await requestJSON<MessageStateResponse>(
          `/api/v1/messages/state?conversation_type=${conversationType}&conversation_id=${encodeURIComponent(normalizedConversationID)}`
        );
        persistConversationMessageState(normalizedConversationID, {
          pinnedMessageIds: state.pinnedMessageIds ?? [],
          reactionsByMessage: normalizeStoredReactions(state.reactionsByMessage)
        });
        return state;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj durumu yüklenemedi." });
        return null;
      }
    },

    toggleMessagePin: async (messageID) => {
      const normalizedMessageID = messageID.trim();
      if (!normalizedMessageID) {
        return false;
      }

      set({ error: null });
      try {
        const response = await requestJSON<ToggleMessagePinResponse>(`/api/v1/messages/${encodeURIComponent(normalizedMessageID)}/pin/toggle`, {
          method: "POST"
        });
        const payload = parseMessagePinPayload(response);
        if (payload) {
          applyPinnedMessageUpdate(payload);
        }
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj sabitleme işlemi başarısız oldu." });
        return false;
      }
    },

    toggleMessageReaction: async (messageID, emoji) => {
      const normalizedMessageID = messageID.trim();
      const normalizedEmoji = emoji.trim();
      if (!normalizedMessageID || !normalizedEmoji) {
        return false;
      }

      set({ error: null });
      try {
        const response = await requestJSON<ToggleMessageReactionResponse>(
          `/api/v1/messages/${encodeURIComponent(normalizedMessageID)}/reactions/toggle`,
          {
            method: "POST",
            body: JSON.stringify({ emoji: normalizedEmoji })
          }
        );
        const payload = parseMessageReactionPayload(response);
        if (payload) {
          applyReactionUpdate(payload);
        }
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mesaj tepkisi güncellenemedi." });
        return false;
      }
    },

    searchUsers: async (query) => {
      const normalized = query.trim();
      set({ userSearchQuery: query });
      if (normalized.length < 2) {
        set({
          userSearchLoading: false,
          userSearchResults: []
        });
        return;
      }

      const requestID = ++userSearchRequestID;
      set({ userSearchLoading: true, error: null });

      try {
        const response = await requestJSON<{ users: UserSearchItem[] }>(
          `/api/v1/users/search?q=${encodeURIComponent(normalized)}&limit=15`
        );

        if (requestID !== userSearchRequestID) {
          return;
        }

        set({ userSearchResults: response.users ?? [] });
      } catch (error) {
        if (requestID !== userSearchRequestID) {
          return;
        }
        set({
          error: error instanceof Error ? error.message : "Kullanıcı araması başarısız oldu.",
          userSearchResults: []
        });
      } finally {
        if (requestID === userSearchRequestID) {
          set({ userSearchLoading: false });
        }
      }
    },

    createDM: async (userID) => {
      set({ error: null });
      try {
        const response = await requestJSON<CreateDMResponse>("/api/v1/dms", {
          method: "POST",
          body: JSON.stringify({ userId: userID })
        });

        await get().loadDMs();
        await get().selectDM(response.conversationId);
        set({
          userSearchQuery: "",
          userSearchResults: []
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "DM başlatılamadı." });
      }
    },

    loadFriends: async () => {
      set({ loadingFriends: true, error: null });
      try {
        const response = await requestJSON<FriendsResponse>("/api/v1/friends");
        const friends = response.friends ?? [];

        const presencePatch: Record<string, PresenceState> = {};
        for (const item of friends) {
          presencePatch[item.userId] = normalizePresenceState({
            status: item.status,
            lastSeen: item.lastSeenAt
          });
        }

        set((state) => ({
          friends,
          presenceByUser: {
            ...state.presenceByUser,
            ...presencePatch
          }
        }));
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Arkadaş listesi yüklenemedi." });
      } finally {
        set({ loadingFriends: false });
      }
    },

    loadFriendRequests: async () => {
      set({ loadingFriendRequests: true, error: null });
      try {
        const response = await requestJSON<FriendRequestsResponse>("/api/v1/friends/requests");
        set({
          friendRequestsIncoming: response.incoming ?? [],
          friendRequestsOutgoing: response.outgoing ?? []
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Arkadaşlık istekleri yüklenemedi." });
      } finally {
        set({ loadingFriendRequests: false });
      }
    },

    loadFriendPrivacySettings: async () => {
      set({ loadingFriendPrivacy: true, error: null });
      try {
        const response = await requestJSON<FriendPrivacySettingsResponse>("/api/v1/friends/privacy");
        set({
          friendPrivacySettings: response.settings ?? DEFAULT_FRIEND_PRIVACY_SETTINGS
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Arkadaşlık gizlilik ayarları yüklenemedi." });
      } finally {
        set({ loadingFriendPrivacy: false });
      }
    },

    updateFriendPrivacySettings: async (patch) => {
      const payload: UpdateFriendPrivacySettingsRequest = {};

      if (typeof patch.allowEveryone === "boolean") {
        payload.allowEveryone = patch.allowEveryone;
      }
      if (typeof patch.allowFriendsOfFriends === "boolean") {
        payload.allowFriendsOfFriends = patch.allowFriendsOfFriends;
      }
      if (typeof patch.allowServerMembers === "boolean") {
        payload.allowServerMembers = patch.allowServerMembers;
      }

      if (Object.keys(payload).length === 0) {
        return true;
      }

      set({ updatingFriendPrivacy: true, error: null });
      try {
        const response = await requestJSON<FriendPrivacySettingsResponse>("/api/v1/friends/privacy", {
          method: "PATCH",
          body: JSON.stringify(payload)
        });
        set({
          friendPrivacySettings: response.settings ?? get().friendPrivacySettings
        });
        toastInfo("Gizlilik ayarı güncellendi", "Arkadaşlık isteği tercihlerin kaydedildi.", "friend-privacy-updated");
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Arkadaşlık gizlilik ayarları güncellenemedi.";
        set({ error: message });
        toastError("Gizlilik ayarı güncellenemedi", message, "friend-privacy-failed");
        return false;
      } finally {
        set({ updatingFriendPrivacy: false });
      }
    },

    loadBlockedUsers: async () => {
      set({ loadingBlockedUsers: true, error: null });
      try {
        const response = await requestJSON<BlockedUsersResponse>("/api/v1/friends/blocked");
        set({
          blockedUsers: response.blocked ?? []
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Engellenen kullanıcılar yüklenemedi." });
      } finally {
        set({ loadingBlockedUsers: false });
      }
    },

    sendFriendRequest: async (userID) => {
      const normalizedUserID = userID.trim();
      if (!normalizedUserID) {
        return false;
      }

      set({ sendingFriendRequest: true, error: null });
      try {
        const response = await requestJSON<SendFriendRequestResponse>("/api/v1/friends/requests", {
          method: "POST",
          body: JSON.stringify({ userId: normalizedUserID })
        });

        await get().loadFriendRequests();
        if (response.autoAccepted) {
          await get().loadFriends();
          toastSuccess("Arkadaş eklendi", "İstek otomatik kabul edildi.", `friend-request-auto-${normalizedUserID}`);
        } else {
          toastSuccess("Arkadaşlık isteği gönderildi", "Karşı tarafın onayı bekleniyor.", `friend-request-${normalizedUserID}`);
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Arkadaşlık isteği gönderilemedi.";
        set({ error: message });
        toastError("Arkadaşlık isteği gönderilemedi", message, "friend-request-failed");
        return false;
      } finally {
        set({ sendingFriendRequest: false });
      }
    },

    sendFriendRequestByUsername: async (username) => {
      const normalizedUsername = username.trim();
      if (normalizedUsername.length < 2) {
        set({ error: "Kullanıcı adını tam olarak yazmalısın." });
        toastWarning("Eksik kullanıcı adı", "Arkadaş eklemek için tam kullanıcı adını yaz.", "friend-username-short");
        return false;
      }

      set({ sendingFriendRequest: true, error: null });
      try {
        const response = await requestJSON<{ users: UserSearchItem[] }>(
          `/api/v1/users/search?q=${encodeURIComponent(normalizedUsername)}&limit=20`
        );
        const normalizedNeedle = normalizedUsername.toLocaleLowerCase("tr");
        const exactMatch = (response.users ?? []).find(
          (item) => item.username.trim().toLocaleLowerCase("tr") === normalizedNeedle
        );

        if (!exactMatch) {
          const message = "Tam kullanıcı adı bulunamadı. Kullanıcı adını eksiksiz yaz.";
          set({ error: message });
          toastWarning("Kullanıcı bulunamadı", message, "friend-username-not-found");
          return false;
        }

        const sendResponse = await requestJSON<SendFriendRequestResponse>("/api/v1/friends/requests", {
          method: "POST",
          body: JSON.stringify({ userId: exactMatch.id })
        });

        await get().loadFriendRequests();
        if (sendResponse.autoAccepted) {
          await get().loadFriends();
          toastSuccess("Arkadaş eklendi", "İstek otomatik kabul edildi.", `friend-request-auto-${exactMatch.id}`);
        } else {
          toastSuccess("Arkadaşlık isteği gönderildi", "Karşı tarafın onayı bekleniyor.", `friend-request-${exactMatch.id}`);
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Arkadaşlık isteği gönderilemedi.";
        set({ error: message });
        toastError("Arkadaşlık isteği gönderilemedi", message, "friend-request-by-username-failed");
        return false;
      } finally {
        set({ sendingFriendRequest: false });
      }
    },

    acceptFriendRequest: async (requestID) => {
      const normalizedRequestID = requestID.trim();
      if (!normalizedRequestID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/friends/requests/${encodeURIComponent(normalizedRequestID)}/accept`, {
          method: "POST"
        });
        await get().loadFriendRequests();
        await get().loadFriends();
        toastSuccess("Arkadaşlık isteği kabul edildi", "Kullanıcı arkadaş listene eklendi.", `friend-accept-${normalizedRequestID}`);
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Arkadaşlık isteği kabul edilemedi.";
        set({ error: message });
        toastError("İstek kabul edilemedi", message, "friend-accept-failed");
        return false;
      }
    },

    rejectFriendRequest: async (requestID) => {
      const normalizedRequestID = requestID.trim();
      if (!normalizedRequestID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/friends/requests/${encodeURIComponent(normalizedRequestID)}/reject`, {
          method: "POST"
        });
        await get().loadFriendRequests();
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Arkadaşlık isteği güncellenemedi." });
        return false;
      }
    },

    removeFriend: async (friendUserID) => {
      const normalizedFriendID = friendUserID.trim();
      if (!normalizedFriendID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/friends/${encodeURIComponent(normalizedFriendID)}`, {
          method: "DELETE"
        });
        await get().loadFriends();
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Arkadaş kaldırılamadı." });
        return false;
      }
    },

    blockUser: async (userID) => {
      const normalizedUserID = userID.trim();
      if (!normalizedUserID) {
        return false;
      }

      set({ blockingUser: true, error: null });
      try {
        await requestJSON<{ status: string; blocked: BlockedUserItem }>("/api/v1/friends/blocked", {
          method: "POST",
          body: JSON.stringify({ userId: normalizedUserID })
        });
        await get().loadBlockedUsers();
        await get().loadFriends();
        await get().loadFriendRequests();
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Kullanıcı engellenemedi." });
        return false;
      } finally {
        set({ blockingUser: false });
      }
    },

    unblockUser: async (userID) => {
      const normalizedUserID = userID.trim();
      if (!normalizedUserID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ status: string }>(`/api/v1/friends/blocked/${encodeURIComponent(normalizedUserID)}`, {
          method: "DELETE"
        });
        await get().loadBlockedUsers();
        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Engel kaldırılamadı." });
        return false;
      }
    },

    sendTypingStart: () => {
      const selectedDMID = get().selectedDMId;
      if (!selectedDMID) {
        return;
      }

      const room = `dm:${selectedDMID}`;
      if (typingStartedRoom !== room) {
        sendSocketAction("typing.start", {
          conversationType: "dm",
          conversationId: selectedDMID
        });
        typingStartedRoom = room;
      }

      clearTypingTimer();
      typingStopTimer = setTimeout(() => {
        get().sendTypingStop();
      }, 2500);
    },

    sendTypingStop: () => {
      const selectedDMID = get().selectedDMId;
      clearTypingTimer();
      if (!selectedDMID) {
        typingStartedRoom = null;
        return;
      }

      const room = `dm:${selectedDMID}`;
      if (typingStartedRoom === room) {
        sendSocketAction("typing.stop", {
          conversationType: "dm",
          conversationId: selectedDMID
        });
      }
      typingStartedRoom = null;
    },

    loadVoiceChannels: async (workspaceID?: string) => {
      set({ loadingVoiceChannels: true, error: null });
      try {
        const targetWorkspaceID = workspaceID ?? get().selectedServerId ?? "";
        if (!targetWorkspaceID) {
          set({ voiceChannels: [] });
          return;
        }
        const query = targetWorkspaceID ? `?workspace_id=${encodeURIComponent(targetWorkspaceID)}` : "";
        const response = await requestJSON<VoiceChannelsResponse>(`/api/v1/voice/channels${query}`);
        set((state) => {
          const channels = sortVoiceChannels(response.channels ?? []);
          const activeVoiceChannelId = response.currentState?.channelId ?? state.activeVoiceChannelId;
          const activeFromResponse = activeVoiceChannelId ? channels.find((channel) => channel.id === activeVoiceChannelId) ?? null : null;
          const activeFromState = activeVoiceChannelId
            ? state.voiceChannels.find((channel) => channel.id === activeVoiceChannelId) ??
              (state.activeVoiceChannelSnapshot?.id === activeVoiceChannelId ? state.activeVoiceChannelSnapshot : null)
            : null;

          return {
            voiceChannels: channels,
            activeVoiceChannelId,
            activeVoiceChannelSnapshot: activeFromResponse ?? activeFromState,
            voiceMuted: response.currentState?.muted ?? state.voiceMuted,
            voiceDeafened: response.currentState?.deafened ?? state.voiceDeafened
          };
        });
        applyRemoteAudioMuted(response.currentState?.deafened ?? get().voiceDeafened);
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Ses kanalları yüklenemedi." });
      } finally {
        set({ loadingVoiceChannels: false });
      }
    },

    createVoiceChannel: async (req) => {
      const workspaceId = req.workspaceId.trim();
      const name = req.name.trim();

      if (!workspaceId) {
        set({ error: "Önce bir sunucu seç." });
        return null;
      }
      if (!name) {
        set({ error: "Ses kanalı adı boş olamaz." });
        return null;
      }

      set({ creatingVoiceChannel: true, error: null });
      try {
        const created = await requestJSON<VoiceChannel>("/api/v1/voice/channels", {
          method: "POST",
          body: JSON.stringify({
            workspaceId,
            name,
            maxParticipants: req.maxParticipants
          })
        });

        set((state) => ({
          voiceChannels: sortVoiceChannels([...state.voiceChannels, created])
        }));
        toastSuccess("Ses kanalı oluşturuldu", `${created.name} kanalı eklendi.`, `voice-channel-created-${created.id}`);
        return created;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ses kanalı oluşturulamadı.";
        set({ error: message });
        toastError("Ses kanalı oluşturulamadı", message, "voice-channel-create-failed");
        return null;
      } finally {
        set({ creatingVoiceChannel: false });
      }
    },

    updateVoiceChannel: async (channelId, req) => {
      const normalizedChannelID = channelId.trim();
      if (!normalizedChannelID) {
        return null;
      }

      set({ error: null });
      try {
        const payload: UpdateVoiceChannelRequest = {};
        if (typeof req.name === "string") {
          payload.name = req.name.trim();
        }
        if (typeof req.maxParticipants === "number") {
          payload.maxParticipants = req.maxParticipants;
        }

        const updated = await requestJSON<VoiceChannel>(`/api/v1/voice/channels/${encodeURIComponent(normalizedChannelID)}`, {
          method: "PATCH",
          body: JSON.stringify(payload)
        });

        set((state) => ({
          voiceChannels: sortVoiceChannels(state.voiceChannels.map((item) => (item.id === updated.id ? updated : item)))
        }));
        return updated;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Ses kanalı güncellenemedi." });
        return null;
      }
    },

    deleteVoiceChannel: async (channelId) => {
      const normalizedChannelID = channelId.trim();
      if (!normalizedChannelID) {
        return false;
      }

      set({ error: null });
      try {
        await requestJSON<{ id: string; workspaceId: string }>(`/api/v1/voice/channels/${encodeURIComponent(normalizedChannelID)}`, {
          method: "DELETE"
        });

        if (get().activeVoiceChannelId === normalizedChannelID) {
          await disconnectLiveKit();
          set({
            activeVoiceChannelId: null,
            activeVoiceChannelSnapshot: null,
            voiceMuted: false,
            voiceDeafened: false
          });
        }

        set((state) => ({
          voiceChannels: state.voiceChannels.filter((item) => item.id !== normalizedChannelID)
        }));

        return true;
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Ses kanalı silinemedi." });
        return false;
      }
    },

    joinVoiceChannel: async (channelId) => {
      set({ voiceConnecting: true, error: null });
      try {
        await ensureSocketReady();
        const joinResponse = await sendSocketRequest<VoiceJoinResponse>("voice.join", { channelId });

        if (joinResponse.previousChannelId) {
          sendSocketAction("unsubscribe", undefined, `voice:${joinResponse.previousChannelId}`);
        }
        sendSocketAction("subscribe", undefined, `voice:${channelId}`);

        await ensureLiveKitConnected(joinResponse);

        set({
          activeVoiceChannelId: channelId,
          activeVoiceChannelSnapshot: joinResponse.channel,
          voiceMuted: joinResponse.state.muted,
          voiceDeafened: joinResponse.state.deafened
        });

        await get().loadVoiceChannels(get().selectedServerId ?? undefined);
        toastInfo("Ses kanalına bağlandın", "Mikrofon ve ses aktarımı aktif.", `voice-joined-${channelId}`);
      } catch (error) {
        const message = normalizeVoiceJoinError(error);
        set({ error: message });
        toastError("Ses kanalına bağlanılamadı", message, "voice-join-failed");
      } finally {
        set({ voiceConnecting: false });
      }
    },

    leaveVoiceChannel: async () => {
      set({ voiceConnecting: true, error: null });
      try {
        if (socket && socket.readyState === WebSocket.OPEN) {
          const response = await sendSocketRequest<{ channelId?: string }>("voice.leave");
          if (response.channelId) {
            sendSocketAction("unsubscribe", undefined, `voice:${response.channelId}`);
          }
        }

        await disconnectLiveKit();

        set({
          activeVoiceChannelId: null,
          activeVoiceChannelSnapshot: null,
          voiceMuted: false,
          voiceDeafened: false
        });

        await get().loadVoiceChannels(get().selectedServerId ?? undefined);
        toastInfo("Ses kanalından ayrıldın", "Ses bağlantısı sonlandırıldı.", "voice-left");
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ses kanalından çıkılamadı.";
        set({ error: message });
        toastError("Ses kanalından çıkılamadı", message, "voice-leave-failed");
      } finally {
        set({ voiceConnecting: false });
      }
    },

    toggleVoiceMute: async () => {
      const channelID = get().activeVoiceChannelId;
      if (!channelID) {
        return;
      }

      set({ error: null });
      try {
        await ensureSocketReady();
        const shouldMute = !get().voiceMuted;
        if (get().voiceDeafened && !shouldMute) {
          return;
        }
        const state = await sendSocketRequest<VoiceState>(shouldMute ? "voice.mute" : "voice.unmute");

        await applyVoiceVideoPreferencesToLiveKit({
          muted: state.muted,
          deafened: state.deafened
        });

        applyRemoteAudioMuted(state.deafened);
        syncCurrentUserVoiceState(channelID, {
          muted: state.muted,
          deafened: state.deafened,
          ...(state.muted ? { speaking: false } : {})
        });
        set({
          voiceMuted: state.muted,
          voiceDeafened: state.deafened
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Mikrofon durumu güncellenemedi." });
      }
    },

    toggleVoiceDeafen: async () => {
      const channelID = get().activeVoiceChannelId;
      if (!channelID) {
        return;
      }

      set({ error: null });
      try {
        await ensureSocketReady();
        const shouldDeafen = !get().voiceDeafened;
        const state = await sendSocketRequest<VoiceState>(shouldDeafen ? "voice.deafen" : "voice.undeafen");

        await applyVoiceVideoPreferencesToLiveKit({
          muted: state.muted,
          deafened: state.deafened
        });

        applyRemoteAudioMuted(state.deafened);
        syncCurrentUserVoiceState(channelID, {
          muted: state.muted,
          deafened: state.deafened,
          ...(state.deafened ? { speaking: false } : {})
        });
        set({
          voiceMuted: state.muted,
          voiceDeafened: state.deafened
        });
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "Ses dinleme durumu güncellenemedi." });
      }
    },

    setScreenSharePreferences: (patch) => {
      set((state) => ({
        screenShareQuality: patch.quality ?? state.screenShareQuality,
        screenShareFPS: patch.fps ?? state.screenShareFPS,
        screenShareIncludeSystemAudio: patch.includeSystemAudio ?? state.screenShareIncludeSystemAudio
      }));
    },

    startScreenShare: async (input) => {
      const activeChannelId = get().activeVoiceChannelId;
      if (!activeChannelId || !liveKitRoom || !get().liveKitConnected) {
        toastWarning("Ses bağlantısı gerekli", "Ekran paylaşımı için önce bir ses kanalına bağlanmalısın.", "screen-share-voice-required");
        return false;
      }

      const quality = input.quality ?? get().screenShareQuality;
      const fps = input.fps ?? get().screenShareFPS;
      const includeSystemAudio = input.includeSystemAudio ?? get().screenShareIncludeSystemAudio;

      set({
        screenShareStarting: true,
        error: null,
        screenShareQuality: quality,
        screenShareFPS: fps,
        screenShareIncludeSystemAudio: includeSystemAudio
      });

      try {
        await stopLocalScreenShareInternal({ silent: true });

        const captured = await captureScreenShare({
          selection: input.selection,
          quality,
          fps,
          includeSystemAudio
        });

        if (!liveKitRoom) {
          stopCapturedTracks(captured.tracks);
          throw new Error("Ses bağlantısı yeniden kuruluyor, tekrar dene.");
        }

        for (const track of captured.tracks) {
          await liveKitRoom.localParticipant.publishTrack(track);
        }

        localScreenShareTracks = captured.tracks;
        const endedHandler = () => {
          void stopLocalScreenShareInternal();
        };
        localScreenShareEndedHandler = endedHandler;
        captured.primaryVideoTrack.mediaStreamTrack.addEventListener("ended", endedHandler, { once: true });

        set({
          screenShareStarting: false,
          screenShareActive: true,
          screenShareSourceKind: captured.sourceKind,
          screenShareSourceLabel: captured.sourceLabel,
          localScreenShareTrack: captured.primaryVideoTrack
        });

        toastSuccess("Ekran paylaşımı başladı", `${captured.sourceLabel} yayında.`, "screen-share-started");
        return true;
      } catch (error) {
        const message = mapScreenShareError(error);
        await stopLocalScreenShareInternal({ silent: true });
        set({
          screenShareStarting: false,
          error: message
        });
        toastError("Ekran paylaşımı başlatılamadı", message, "screen-share-start-failed");
        return false;
      }
    },

    stopScreenShare: async (options) => {
      try {
        await stopLocalScreenShareInternal(options);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Ekran paylaşımı durdurulamadı.";
        set({ error: message });
        toastError("Ekran paylaşımı durdurulamadı", message, "screen-share-stop-failed");
      }
    },

    clearError: () => {
      set({ error: null });
    },

    connectRealtime: () => {
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        return;
      }

      const accessToken = get().tokens?.accessToken;
      if (!accessToken) {
        return;
      }

      clearReconnectTimer();

      const ws = new WebSocket(env.wsBaseUrl, ["catwa.v1", `access_token.${accessToken}`]);
      socket = ws;
      let opened = false;
      let triedRefreshAfterEarlyClose = false;

      ws.onopen = () => {
        if (socket !== ws) {
          return;
        }
        opened = true;
        const shouldShowRecoveredToast = wsDisconnectToastShown;
        clearWsDisconnectToastTimer();
        wsDisconnectToastShown = false;
        set({ wsConnected: true, error: null });
        if (hadRealtimeConnection) {
          if (shouldShowRecoveredToast) {
            toastSuccess("Bağlantı yeniden kuruldu", "Gerçek zamanlı bağlantı tekrar aktif.", "ws-recovered");
          }
        }
        hadRealtimeConnection = true;
        syncSelectedDMRoomSubscription();
        syncSelectedChannelRoomSubscription();
        syncSelectedServerRoomSubscription();
        void restoreVoiceSession();
      };

      ws.onmessage = (messageEvent) => {
        let frame: RealtimeFrame;
        try {
          frame = JSON.parse(messageEvent.data) as RealtimeFrame;
        } catch {
          return;
        }

        if ((frame.type === "ack" || frame.type === "error") && frame.requestId) {
          const pending = pendingSocketRequests.get(frame.requestId);
          if (pending) {
            clearTimeout(pending.timer);
            pendingSocketRequests.delete(frame.requestId);

            if (frame.type === "ack") {
              pending.resolve(frame.data);
            } else {
              pending.reject(new Error(frame.error ?? "WebSocket isteği başarısız oldu."));
            }
            return;
          }
        }

        if (frame.type === "info" && isRecord(frame.data)) {
          const reconnectValue = frame.data.reconnectAfterMs;
          if (typeof reconnectValue === "number" && reconnectValue > 0) {
            reconnectAfterMs = reconnectValue;
          }
          return;
        }

        if (frame.type === "event" && frame.event) {
          handleRealtimeEvent(frame.event);
          return;
        }

        if (frame.type === "error" && typeof frame.error === "string") {
          set({ error: frame.error });
          toastError("Gerçek zamanlı hata", frame.error, "ws-event-error");
        }
      };

      ws.onerror = () => {
        if (socket !== ws) {
          return;
        }
        set({ wsConnected: false });
      };

      ws.onclose = (event) => {
        if (socket === ws) {
          socket = null;
          subscribedDMRooms = new Set<string>();
          subscribedChannelRoom = null;
          subscribedServerRoom = null;
          set({ wsConnected: false });
          rejectPendingSocketRequests("WebSocket bağlantısı kapandı.");
          scheduleWsDisconnectToast();
        }

        void (async () => {
          if (get().appStatus !== "authenticated") {
            return;
          }

          if (event.code === 4001) {
            const refreshed = await refreshTokens();
            if (!refreshed) {
              await resetSession("Oturum süresi doldu. Lütfen tekrar giriş yapın.");
              return;
            }
          }
          if (
            !opened &&
            !triedRefreshAfterEarlyClose &&
            Date.now() - lastWSPreOpenRefreshAttemptAt >= WS_PREOPEN_REFRESH_COOLDOWN_MS
          ) {
            triedRefreshAfterEarlyClose = true;
            lastWSPreOpenRefreshAttemptAt = Date.now();
            const refreshed = await refreshTokens();
            if (refreshed && get().tokens?.accessToken) {
              scheduleReconnect();
              return;
            }
          }

          if (get().tokens?.accessToken) {
            scheduleReconnect();
          }
        })();
      };
    }
  };
});



