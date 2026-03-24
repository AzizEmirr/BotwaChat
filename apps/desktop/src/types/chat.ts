export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  expiresIn: number;
};

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  displayName: string;
  bio?: string;
  avatarPath?: string;
  createdAt: string;
  updatedAt: string;
};

export type UpdateProfileRequest = {
  username?: string;
  displayName?: string;
  bio?: string;
  avatarPath?: string;
};

export type FriendItem = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  status: PresenceStatus;
  lastSeenAt?: string;
  createdAt: string;
};

export type FriendRequestItem = {
  id: string;
  userId: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  createdAt: string;
};

export type FriendsResponse = {
  friends: FriendItem[];
};

export type FriendRequestsResponse = {
  incoming: FriendRequestItem[];
  outgoing: FriendRequestItem[];
};

export type SendFriendRequestResponse = {
  created: boolean;
  autoAccepted: boolean;
  request?: FriendRequestItem;
};

export type FriendPrivacySettings = {
  allowEveryone: boolean;
  allowFriendsOfFriends: boolean;
  allowServerMembers: boolean;
  updatedAt: string;
};

export type FriendPrivacySettingsResponse = {
  settings: FriendPrivacySettings;
};

export type UpdateFriendPrivacySettingsRequest = {
  allowEveryone?: boolean;
  allowFriendsOfFriends?: boolean;
  allowServerMembers?: boolean;
};

export type BlockedUserItem = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  blockedAt: string;
};

export type BlockedUsersResponse = {
  blocked: BlockedUserItem[];
};

export type AuthResponse = {
  user: UserProfile;
  tokens: AuthTokens;
};

export type DMConversation = {
  conversationId: string;
  otherUserId: string;
  otherUsername: string;
  otherDisplayName: string;
  otherAvatarPath?: string;
  lastMessage?: string;
  lastMessageAt?: string;
};

export type Message = {
  id: string;
  conversationType: "dm" | "channel";
  conversationId: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName?: string;
  senderAvatarPath?: string;
  content: string;
  createdAt: string;
  editedAt?: string;
  deletedAt?: string;
};

export type MessageReactionState = {
  emoji: string;
  count: number;
  reacted: boolean;
};

export type MessageStateResponse = {
  pinnedMessageIds: string[];
  reactionsByMessage: Record<string, MessageReactionState[]>;
};

export type ToggleMessagePinResponse = {
  conversationType: "dm" | "channel";
  conversationId: string;
  messageId: string;
  pinned: boolean;
  userId: string;
  pinnedAt?: string;
};

export type ToggleMessageReactionResponse = {
  conversationType: "dm" | "channel";
  conversationId: string;
  messageId: string;
  emoji: string;
  count: number;
  userId: string;
  active: boolean;
};

export type UploadedAttachment = {
  id: string;
  messageId?: string;
  filePath: string;
  mimeType: string;
  fileSize: number;
  originalName: string;
  uploadedAt: string;
};

export type UserSearchItem = {
  id: string;
  username: string;
  displayName: string;
  avatarPath?: string;
};

export type CreateDMResponse = {
  conversationId: string;
  otherUser: {
    id: string;
    username: string;
    displayName: string;
    avatarPath?: string;
  };
  created: boolean;
};

export type PresenceStatus = "online" | "idle" | "dnd" | "invisible" | "offline" | "unknown";

export type PresenceState = {
  status: PresenceStatus;
  lastSeen?: string;
};

export type RealtimeEnvelope = {
  id: string;
  type: string;
  room: string;
  senderId?: string;
  occurredAt: string;
  payload: unknown;
};

export type RealtimeFrame = {
  type: "ack" | "error" | "info" | "event";
  requestId?: string;
  error?: string;
  data?: unknown;
  event?: RealtimeEnvelope;
};

export type ServerSummary = {
  id: string;
  name: string;
  ownerId: string;
  role: string;
  memberCount: number;
  createdAt: string;
};

export type ServersResponse = {
  servers: ServerSummary[];
};

export type ServerMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  role: "owner" | "admin" | "member" | string;
  joinedAt: string;
  status: PresenceStatus;
  lastSeenAt?: string;
};

export type ServerMembersResponse = {
  members: ServerMember[];
};

export type InviteServerMemberResponse = {
  invite: ServerInviteItem;
  created: boolean;
};

export type ServerInviteItem = {
  id: string;
  serverId: string;
  serverName: string;
  invitedUserId: string;
  invitedByUserId: string;
  invitedByUsername: string;
  invitedByDisplayName: string;
  invitedByAvatarPath?: string;
  status: "pending" | "accepted" | "rejected" | "revoked" | string;
  createdAt: string;
  updatedAt: string;
  respondedAt?: string;
};

export type ServerInvitesResponse = {
  invites: ServerInviteItem[];
};

export type AcceptServerInviteResponse = {
  status: string;
  server: ServerSummary;
};

export type Channel = {
  id: string;
  serverId: string;
  name: string;
  kind: "text" | "announcement" | string;
  createdBy: string;
  createdAt: string;
};

export type ChannelsResponse = {
  channels: Channel[];
};

export type DeletedChannelResponse = {
  id: string;
  serverId: string;
};

export type VoiceMember = {
  userId: string;
  username: string;
  displayName: string;
  avatarPath?: string;
  muted: boolean;
  deafened: boolean;
  speaking: boolean;
  joinedAt: string;
};

export type VoiceChannel = {
  id: string;
  workspaceId: string;
  workspaceName: string;
  name: string;
  maxParticipants: number;
  participantCount: number;
  createdAt: string;
  participants: VoiceMember[];
};

export type VoiceState = {
  channelId: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
};

export type VoiceChannelsResponse = {
  channels: VoiceChannel[];
  currentState?: VoiceState;
};

export type CreateVoiceChannelRequest = {
  workspaceId: string;
  name: string;
  maxParticipants?: number;
};

export type UpdateVoiceChannelRequest = {
  name?: string;
  maxParticipants?: number;
};

export type DeleteVoiceChannelResponse = {
  id: string;
  workspaceId: string;
};

export type VoiceJoinResponse = {
  channel: VoiceChannel;
  state: VoiceState;
  previousChannelId?: string;
  liveKit: {
    url: string;
    roomName: string;
    token: string;
  };
};

export type VoiceLeaveResponse = {
  channelId?: string;
};

export type VoiceStateEventPayload = {
  userId: string;
  channelId: string;
  username: string;
  displayName: string;
  muted: boolean;
  deafened: boolean;
  joinedAt: string;
};

export type VoiceSpeakingEventPayload = {
  userId: string;
  channelId: string;
};
