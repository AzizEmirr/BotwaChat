import {
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Gift,
  Hash,
  Loader2,
  MonitorUp,
  Pencil,
  PhoneOff,
  Plus,
  PlusCircle,
  Radio,
  RefreshCw,
  Trash2,
  Search,
  Volume2
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { resolveAvatarURL } from "../../lib/avatar";
import { toPublicID } from "../../lib/publicId";
import { formatVoiceParticipantState } from "../../lib/voice";
import { useVoiceAudioStore } from "../../store/voiceAudioStore";
import type { Channel, DMConversation, PresenceState, ServerSummary, UserSearchItem, VoiceChannel, VoiceMember } from "../../types/chat";
import { ConversationItem } from "./ConversationItem";
import { ContextMenu, type ContextMenuAction } from "./ContextMenu";
import { avatarTone, displayInitials, presenceDotClass } from "./ui";
import { VoiceParticipantVolumeMenu } from "./VoiceParticipantVolumeMenu";

type ConversationSidebarProps = {
  globalSearch: string;
  onGlobalSearchChange: (value: string) => void;
  searchInputRef?: RefObject<HTMLInputElement>;
  wsConnected: boolean;
  conversations: DMConversation[];
  buildConversationActions: (conversation: DMConversation) => ContextMenuAction[];
  isConversationMuted: (conversationId: string) => boolean;
  userNotesById: Record<string, string>;
  unreadByDM: Record<string, number>;
  loadingDMs: boolean;
  selectedConversationId: string | null;
  onSelectConversation: (conversationId: string) => void;
  onOpenFriends: () => void;
  selfUserId?: string;
  presenceByUser: Record<string, PresenceState>;
  userSearchLoading: boolean;
  userSearchResults: UserSearchItem[];
  sendingFriendRequest: boolean;
  onCreateDM: (userId: string) => void;
  onSendFriendRequest: (userId: string) => void;
  onInviteToServer: (userId: string) => void;
  selectedServer: ServerSummary | null;
  loadingServers: boolean;
  onCreateServer: () => void;
  channels: Channel[];
  loadingChannels: boolean;
  creatingTextChannel: boolean;
  selectedChannelId: string | null;
  onSelectChannel: (channelId: string) => void;
  onCreateTextChannel: () => void;
  onUpdateTextChannel: (channelId: string) => void;
  onDeleteTextChannel: (channelId: string) => void;
  onOpenServerSettings: () => void;
  voiceChannels: VoiceChannel[];
  loadingVoiceChannels: boolean;
  creatingVoiceChannel: boolean;
  activeVoiceChannelId: string | null;
  activeVoiceChannelSnapshot: VoiceChannel | null;
  liveKitConnected: boolean;
  voiceConnecting: boolean;
  screenShareActive: boolean;
  screenShareStarting: boolean;
  screenShareSourceLabel: string | null;
  onJoinVoice: (channelId: string) => void;
  onLeaveVoice: () => void;
  onRefreshVoice: () => void;
  onCreateVoiceChannel: () => void;
  onUpdateVoiceChannel: (channelId: string) => void;
  onDeleteVoiceChannel: (channelId: string) => void;
  onOpenScreenSharePicker: () => void;
  onStopScreenShare: () => void;
  footer: ReactNode;
};

export function ConversationSidebar({
  globalSearch,
  onGlobalSearchChange,
  searchInputRef,
  wsConnected,
  conversations,
  buildConversationActions,
  isConversationMuted,
  userNotesById,
  unreadByDM,
  loadingDMs,
  selectedConversationId,
  onSelectConversation,
  onOpenFriends,
  selfUserId,
  presenceByUser,
  userSearchLoading,
  userSearchResults,
  sendingFriendRequest,
  onCreateDM,
  onSendFriendRequest,
  onInviteToServer,
  selectedServer,
  loadingServers,
  onCreateServer,
  channels,
  loadingChannels,
  creatingTextChannel,
  selectedChannelId,
  onSelectChannel,
  onCreateTextChannel,
  onUpdateTextChannel,
  onDeleteTextChannel,
  onOpenServerSettings,
  voiceChannels,
  loadingVoiceChannels,
  creatingVoiceChannel,
  activeVoiceChannelId,
  activeVoiceChannelSnapshot,
  liveKitConnected,
  voiceConnecting,
  screenShareActive,
  screenShareStarting,
  screenShareSourceLabel,
  onJoinVoice,
  onLeaveVoice,
  onRefreshVoice,
  onCreateVoiceChannel,
  onUpdateVoiceChannel,
  onDeleteVoiceChannel,
  onOpenScreenSharePicker,
  onStopScreenShare,
  footer
}: ConversationSidebarProps) {
  const participantVolumes = useVoiceAudioStore((state) => state.participantVolumes);
  const setParticipantVolume = useVoiceAudioStore((state) => state.setParticipantVolume);
  const serverMode = !!selectedServer;
  const activeChannelInList = !!activeVoiceChannelId && voiceChannels.some((channel) => channel.id === activeVoiceChannelId);
  const activeVoiceChannel = activeVoiceChannelId
    ? voiceChannels.find((channel) => channel.id === activeVoiceChannelId) ??
      (activeVoiceChannelSnapshot?.id === activeVoiceChannelId ? activeVoiceChannelSnapshot : null)
    : null;
  const showFooterVoiceParticipants =
    !!activeVoiceChannel && activeVoiceChannel.participants.length > 0 && (!selectedServer || !activeChannelInList);
  const [quickSwitcherOpen, setQuickSwitcherOpen] = useState(false);
  const [quickQuery, setQuickQuery] = useState("");
  const quickInputRef = useRef<HTMLInputElement | null>(null);
  const canManageServer = selectedServer
    ? selectedServer.role.toLowerCase() === "owner" || selectedServer.role.toLowerCase() === "admin"
    : false;

  const quickSwitcherResults = useMemo(() => {
    const query = quickQuery.trim().toLocaleLowerCase("tr-TR");
    const pool = conversations.slice(0, 60);
    if (!query) {
      return pool.slice(0, 20);
    }
    return pool.filter((conversation) => {
      const haystack = `${conversation.otherDisplayName} ${conversation.otherUsername} ${conversation.lastMessage ?? ""}`;
      return haystack.toLocaleLowerCase("tr-TR").includes(query);
    });
  }, [conversations, quickQuery]);

  useEffect(() => {
    if (!quickSwitcherOpen) {
      return;
    }

    window.setTimeout(() => {
      quickInputRef.current?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setQuickSwitcherOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [quickSwitcherOpen]);

  const openQuickSwitcher = () => {
    setQuickQuery("");
    setQuickSwitcherOpen(true);
  };

  const renderVoiceParticipant = (participant: VoiceMember, compact = false) => {
    const avatarSrc = resolveAvatarURL(participant.avatarPath);
    const isSelfParticipant = !!selfUserId && participant.userId === selfUserId;
    const participantVolume = participantVolumes[participant.userId] ?? 100;
    const stateLabel = formatVoiceParticipantState(participant);

    return (
      <VoiceParticipantVolumeMenu
        disabled={isSelfParticipant}
        key={`${compact ? "compact" : "default"}-${participant.userId}`}
        onVolumeChange={(volume) => setParticipantVolume(participant.userId, volume)}
        participant={participant}
        volume={participantVolume}
      >
        <button
          className={`group flex w-full items-center gap-2 rounded-lg border px-2.5 text-left transition ${
            compact ? "py-1.5" : "py-2"
          } ${
            participant.speaking
              ? "border-emerald-400/60 bg-emerald-500/10 shadow-[0_0_0_1px_rgba(74,222,128,0.18)]"
              : "border-slate-800/80 bg-slate-950/35 hover:border-slate-700 hover:bg-slate-900/60"
          }`}
          onClick={(event) => event.preventDefault()}
          title={isSelfParticipant ? "Kendi ses seviyen diğer kullanıcılar tarafından ayarlanır" : "Ses seviyesini ayarlamak için sağ tıkla"}
          type="button"
        >
          <div
            className={`relative flex shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold text-white ${
              compact ? "h-8 w-8" : "h-9 w-9"
            } ${participant.speaking ? "border-emerald-400 shadow-[0_0_18px_rgba(74,222,128,0.35)]" : "border-slate-700"}`}
            style={{ backgroundColor: avatarTone(participant.userId || participant.username) }}
          >
            {avatarSrc ? (
              <img alt={`${participant.displayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
            ) : (
              displayInitials(participant.displayName, participant.username)
            )}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-slate-950 ${
                participant.speaking ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-slate-100">{participant.displayName}</p>
              {participant.speaking ? <Volume2 className="h-3.5 w-3.5 shrink-0 text-emerald-300" /> : null}
            </div>
            <p className={`truncate text-xs ${participant.speaking ? "text-emerald-200" : "text-slate-400"}`}>
              @{participant.username} · {stateLabel}
            </p>
          </div>

          {!isSelfParticipant ? (
            <span className="shrink-0 rounded-full border border-slate-700/70 bg-slate-900/85 px-2 py-0.5 text-[11px] text-slate-400 transition group-hover:border-slate-600 group-hover:text-slate-200">
              %{participantVolume}
            </span>
          ) : null}
        </button>
      </VoiceParticipantVolumeMenu>
    );
  };

  return (
    <div className="cw-conversation-sidebar flex h-full min-h-0 flex-col bg-[var(--catwa-panel)]">
      <header className="cw-conversation-sidebar__header shrink-0 border-b border-[var(--catwa-border-soft)] px-3 py-2.5">
        {serverMode ? (
          <div className="space-y-2">
            <button
              className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left transition hover:bg-white/5"
              onClick={onOpenServerSettings}
              type="button"
            >
              <span className="truncate text-sm font-semibold text-slate-100">{selectedServer?.name ?? "Sunucu"}</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>

            <div className="space-y-1 border-t border-[var(--catwa-border-soft)] pt-2">
              <button
                className="flex w-full items-center justify-between rounded-md bg-white/5 px-2.5 py-2 text-left transition hover:bg-white/10"
                type="button"
              >
                <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-200">
                  <Gift className="h-3.5 w-3.5 text-slate-400" />
                  Takviye Hedefi
                </span>
                <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                  0/33 Takviye
                  <ChevronRight className="h-3.5 w-3.5" />
                </span>
              </button>

              <button
                className="flex w-full items-center gap-2 rounded-md bg-white/5 px-2.5 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                type="button"
              >
                <CalendarDays className="h-4 w-4 text-slate-400" />
                Etkinlikler
              </button>
            </div>
          </div>
        ) : (
          <label className="group relative block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500 transition group-hover:text-slate-400" />
            <input
              className="w-full cursor-pointer rounded-xl border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_72%,black_28%)] py-2 pl-9 pr-3 text-sm font-medium text-slate-300 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition hover:border-[var(--catwa-accent-strong)] hover:bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_62%,black_38%)] hover:text-slate-200 focus:border-[var(--catwa-accent-ring)] focus:bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_58%,black_42%)]"
              onClick={openQuickSwitcher}
              onFocus={openQuickSwitcher}
              placeholder="Sohbet bul ya da başlat"
              readOnly
              ref={searchInputRef}
              value=""
            />
          </label>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {selectedServer ? (
          <>
            <section className="border-b border-[var(--catwa-border-soft)] px-2 py-2.5">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h2 className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500">
                  metin kanalları
                  <ChevronDown className="h-3.5 w-3.5" />
                </h2>
                <button
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
                  disabled={creatingTextChannel}
                  onClick={onCreateTextChannel}
                  title="Metin kanalı oluştur"
                  type="button"
                >
                  {creatingTextChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                </button>
              </div>

              <div className="space-y-0.5">
                {loadingChannels ? (
                  <p className="flex items-center gap-2 px-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Metin kanalları yükleniyor...
                  </p>
                ) : null}

                {!loadingChannels && channels.length === 0 ? <p className="px-2 text-xs text-slate-500">Bu sunucuda metin kanalı yok.</p> : null}

                {channels.map((channel) => {
                  const active = selectedChannelId === channel.id;
                  return (
                    <ContextMenu
                      actions={[
                        {
                          id: `channel-open-${channel.id}`,
                          label: "Kanala Git",
                          onSelect: () => onSelectChannel(channel.id)
                        },
                        {
                          id: `channel-copy-id-${channel.id}`,
                          label: "Kanal ID'sini Kopyala",
                          onSelect: async () => {
                            try {
                              await navigator.clipboard.writeText(toPublicID(channel.id));
                            } catch {
                              // noop
                            }
                          }
                        },
                        {
                          id: `channel-edit-${channel.id}`,
                          label: "Kanalı Düzenle",
                          disabled: !canManageServer,
                          onSelect: () => onUpdateTextChannel(channel.id)
                        },
                        {
                          id: `channel-delete-${channel.id}`,
                          label: "Kanalı Sil",
                          danger: true,
                          disabled: !canManageServer,
                          separatorBefore: true,
                          onSelect: () => onDeleteTextChannel(channel.id)
                        }
                      ]}
                      key={channel.id}
                    >
                      <button
                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                          active ? "bg-white/10 text-slate-100" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                        }`}
                        onClick={() => onSelectChannel(channel.id)}
                        type="button"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <Hash className="h-4 w-4 shrink-0" />
                          <span className="truncate">{channel.name}</span>
                        </span>
                      </button>
                    </ContextMenu>
                  );
                })}
              </div>
            </section>

            <section className="border-b border-[var(--catwa-border-soft)] px-2 py-2.5">
              <div className="mb-1.5 flex items-center justify-between px-1">
                <h2 className="inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-slate-500">
                  ses kanalları
                  <ChevronDown className="h-3.5 w-3.5" />
                </h2>
                <div className="flex items-center gap-1">
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-slate-200"
                    onClick={onRefreshVoice}
                    title="Yenile"
                    type="button"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                  <button
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition hover:bg-white/5 hover:text-slate-200 disabled:opacity-50"
                    disabled={creatingVoiceChannel}
                    onClick={onCreateVoiceChannel}
                    title="Ses kanalı oluştur"
                    type="button"
                  >
                    {creatingVoiceChannel ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlusCircle className="h-3.5 w-3.5" />}
                  </button>
                </div>
              </div>

              {!!activeVoiceChannelId && !activeChannelInList ? (
                <div className="mb-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-200">
                  <div className="flex items-center justify-between gap-2">
                    <span>Farklı bir sunucuda ses kanalındasın.</span>
                    <button
                      className="rounded border border-rose-500/40 bg-rose-500/15 px-1.5 py-0.5 text-rose-100"
                      onClick={onLeaveVoice}
                      type="button"
                    >
                      Ayrıl
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="space-y-1">
                {loadingVoiceChannels ? (
                  <p className="flex items-center gap-2 px-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Ses kanalları yükleniyor...
                  </p>
                ) : null}

                {!loadingVoiceChannels && voiceChannels.length === 0 ? <p className="px-2 text-xs text-slate-500">Bu sunucuda ses kanalı yok.</p> : null}

                {voiceChannels.map((channel) => {
                  const active = channel.id === activeVoiceChannelId;
                  return (
                    <ContextMenu
                      actions={[
                        {
                          id: `voice-channel-join-${channel.id}`,
                          label: active ? "Kanaldan Ayrıl" : "Kanala Katıl",
                          onSelect: () => (active ? onLeaveVoice() : onJoinVoice(channel.id))
                        },
                        {
                          id: `voice-channel-edit-${channel.id}`,
                          label: "Kanalı Düzenle",
                          icon: <Pencil className="h-3.5 w-3.5" />,
                          disabled: !canManageServer,
                          onSelect: () => onUpdateVoiceChannel(channel.id)
                        },
                        {
                          id: `voice-channel-delete-${channel.id}`,
                          label: "Kanalı Sil",
                          icon: <Trash2 className="h-3.5 w-3.5" />,
                          danger: true,
                          disabled: !canManageServer,
                          onSelect: () => onDeleteVoiceChannel(channel.id)
                        }
                      ]}
                      key={channel.id}
                    >
                      <div className={`rounded-md px-2 py-1.5 ${active ? "bg-white/10" : "hover:bg-white/5"}`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 truncate text-sm text-slate-200">
                              <Volume2 className="h-3.5 w-3.5 text-slate-500" />
                              {channel.name}
                            </p>
                            <p className="truncate text-[11px] text-slate-500">
                              {channel.participantCount}/{channel.maxParticipants} kişi
                            </p>
                          </div>

                          {active ? (
                            <button
                              className="rounded-md bg-rose-500/15 px-2 py-0.5 text-[11px] text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                              disabled={voiceConnecting}
                              onClick={onLeaveVoice}
                              type="button"
                            >
                              Ayrıl
                            </button>
                          ) : (
                            <button
                              className="rounded-md bg-cyan-500/14 px-2 py-0.5 text-[11px] text-cyan-200 transition hover:bg-cyan-500/25 disabled:opacity-50"
                              disabled={voiceConnecting}
                              onClick={() => onJoinVoice(channel.id)}
                              type="button"
                            >
                              Katıl
                            </button>
                          )}
                        </div>

                        {channel.participants.length > 0 ? (
                          <div className="mt-1 rounded-md bg-slate-950/20 p-2">
                            <div className="mb-2 flex items-center justify-between gap-2 px-0.5">
                              <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Kanaldakiler</span>
                              <span className="text-[10px] text-slate-500">Sağ tıkla: kullanıcı sesi</span>
                            </div>
                            <div className="space-y-1.5">{channel.participants.map((participant) => renderVoiceParticipant(participant))}</div>
                          </div>
                        ) : null}
                      </div>
                    </ContextMenu>
                  );
                })}
              </div>
            </section>
          </>
        ) : null}

        {!selectedServer && !loadingServers ? (
          <>
            <section className="cw-dm-list px-3 py-3">
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-lg font-medium text-slate-100">Direkt Mesajlar</h2>
                <button
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-800/55 hover:text-slate-100"
                  onClick={openQuickSwitcher}
                  title="Sohbet bul veya başlat"
                  type="button"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-0.5">
                {loadingDMs && conversations.length === 0 ? <p className="px-2 text-xs text-slate-500">DM listesi yükleniyor...</p> : null}
                {!loadingDMs && conversations.length === 0 ? <p className="px-2 text-xs text-slate-500">Henüz DM yok.</p> : null}

                {conversations.map((conversation) => (
                  <ConversationItem
                    actions={buildConversationActions(conversation)}
                    conversation={conversation}
                    key={conversation.conversationId}
                    muted={isConversationMuted(conversation.conversationId)}
                    note={userNotesById[conversation.otherUserId]}
                    onSelect={onSelectConversation}
                    presence={presenceByUser[conversation.otherUserId]}
                    selected={selectedConversationId === conversation.conversationId}
                    unreadCount={unreadByDM[conversation.conversationId] ?? 0}
                  />
                ))}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {activeVoiceChannelId ? (
        <section className="shrink-0 border-t border-[var(--catwa-border)] bg-gradient-to-r from-emerald-500/8 via-cyan-500/6 to-slate-900/90 px-3 py-2.5">
          <div className="rounded-xl border border-emerald-500/25 bg-slate-900/80 px-3 py-3 shadow-[0_12px_28px_-24px_rgba(16,185,129,0.55)]">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-200">
                  <Radio className="h-4 w-4" />
                  {liveKitConnected ? "Ses Bağlantısı Kuruldu" : "Ses Bağlantısı Hazırlanıyor"}
                </p>
                <p className="mt-0.5 truncate text-xs text-slate-300">
                  {(activeVoiceChannel?.name ?? "Ses kanalı")} / {(activeVoiceChannel?.workspaceName ?? selectedServer?.name ?? "Sunucu")}
                </p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">Bağlantı denetimleri</p>
              </div>

              <div className="flex items-center gap-1">
                <button
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-md border transition disabled:opacity-50 ${
                    screenShareActive
                      ? "border-violet-400/50 bg-violet-500/20 text-violet-100 hover:bg-violet-500/28"
                      : "border-slate-700 bg-slate-800/70 text-slate-200 hover:border-slate-500 hover:text-white"
                  }`}
                  disabled={voiceConnecting || screenShareStarting}
                  onClick={screenShareActive ? onStopScreenShare : onOpenScreenSharePicker}
                  title={screenShareActive ? "Ekran paylaşımını durdur" : "Ekran paylaşımı başlat"}
                  type="button"
                >
                  {screenShareStarting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MonitorUp className="h-3.5 w-3.5" />}
                </button>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-700 bg-slate-800/70 text-slate-200 transition hover:border-slate-500 hover:text-white disabled:opacity-50"
                  disabled={voiceConnecting}
                  onClick={onRefreshVoice}
                  title="Ses bilgisini yenile"
                  type="button"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
                <button
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-rose-500/45 bg-rose-500/15 text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                  disabled={voiceConnecting}
                  onClick={onLeaveVoice}
                  title="Ses kanalından ayrıl"
                  type="button"
                >
                  <PhoneOff className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {screenShareActive ? (
              <div className="mt-3 rounded-md border border-violet-400/30 bg-violet-500/10 px-2 py-1.5 text-[11px] text-violet-100">
                <p className="truncate">Ekran paylaşımı aktif: {screenShareSourceLabel ?? "Kaynak seçildi"}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wide text-violet-100/75">
                  Kendi yayın sesini bu panelden değiştiremezsin.
                </p>
                <button
                  className="mt-1 inline-flex rounded border border-violet-400/35 bg-violet-500/15 px-2 py-0.5 text-[11px] text-violet-100 transition hover:bg-violet-500/25"
                  onClick={onOpenScreenSharePicker}
                  type="button"
                >
                  Kaynağı değiştir
                </button>
              </div>
            ) : null}

            {showFooterVoiceParticipants ? (
              <div className="mt-3 rounded-lg border border-slate-800/80 bg-slate-950/30 p-2.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[10px] uppercase tracking-wide text-slate-400">Sestekiler</p>
                  <span className="text-[10px] text-slate-500">Sağ tıkla: kullanıcı sesi</span>
                </div>
                <div className="space-y-1.5">{activeVoiceChannel.participants.map((participant) => renderVoiceParticipant(participant, true))}</div>
              </div>
            ) : null}
          </div>
        </section>
      ) : null}

      {footer}

      {quickSwitcherOpen ? (
        <>
          <button
            aria-label="Hızlı geçiş ekranını kapat"
            className="fixed inset-0 z-[120] bg-black/65"
            onClick={() => setQuickSwitcherOpen(false)}
            type="button"
          />
          <div className="fixed left-1/2 top-[10%] z-[121] w-[min(94vw,620px)] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] shadow-[0_26px_80px_-40px_rgba(2,6,23,0.95)] sm:top-[20%] sm:w-[min(92vw,620px)]">
            <div className="border-b border-[var(--catwa-border)] p-3">
              <input
                className="w-full rounded-xl border border-[var(--catwa-border)] bg-slate-950/70 px-3 py-2.5 text-base text-slate-100 outline-none transition focus:border-[var(--catwa-accent-ring)] focus:shadow-[0_0_0_1px_rgba(var(--catwa-accent-rgb),0.24)]"
                onChange={(event) => setQuickQuery(event.target.value)}
                placeholder="Nereye gitmek istersin?"
                ref={quickInputRef}
                value={quickQuery}
              />
            </div>

            <div className="max-h-[58vh] overflow-y-auto p-3 sm:max-h-[48vh]">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Önceki sohbetler</p>
              {quickSwitcherResults.length === 0 ? (
                <p className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/55 px-3 py-3 text-sm text-slate-400">Sonuç bulunamadı.</p>
              ) : (
                <div className="space-y-1">
                  {quickSwitcherResults.map((conversation) => {
                    const avatarSrc = resolveAvatarURL(conversation.otherAvatarPath);
                    const presence = presenceByUser[conversation.otherUserId];
                    return (
                      <button
                        className="flex w-full items-center gap-3 rounded-lg border border-transparent px-3 py-2 text-left transition hover:border-slate-700 hover:bg-slate-800/65"
                        key={conversation.conversationId}
                        onClick={() => {
                          setQuickSwitcherOpen(false);
                          onSelectConversation(conversation.conversationId);
                        }}
                        type="button"
                      >
                        <div
                          className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-slate-100"
                          style={{ backgroundColor: avatarTone(conversation.otherUserId || conversation.otherUsername) }}
                        >
                          {avatarSrc ? (
                            <img alt={`${conversation.otherDisplayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
                          ) : (
                            displayInitials(conversation.otherDisplayName, conversation.otherUsername)
                          )}
                          <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-slate-950 ${presenceDotClass(presence)}`} />
                        </div>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium text-slate-100">{conversation.otherDisplayName}</span>
                          <span className="block truncate text-xs text-slate-400">@{conversation.otherUsername}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

