import * as Dialog from "@radix-ui/react-dialog";
import { CalendarDays, Crown, Hash, LogOut, Pencil, Save, Shield, Trash2, UserMinus, Users, Volume2, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { Channel, ServerMember, ServerSummary, UpdateVoiceChannelRequest, VoiceChannel } from "../../types/chat";
import { BrandMark } from "./BrandMark";
import { ConfirmModal } from "./ConfirmModal";
import type { InputPromptField } from "./InputPromptModal";
import { InputPromptModal } from "./InputPromptModal";

type ServerSettingsModalProps = {
  open: boolean;
  server: ServerSummary | null;
  members: ServerMember[];
  channels: Channel[];
  voiceChannels: VoiceChannel[];
  currentUserId?: string;
  onClose: () => void;
  onUpdateName: (name: string) => Promise<void>;
  onUpdateMemberRole: (userId: string, role: "admin" | "member") => Promise<void>;
  onRemoveMember: (userId: string) => Promise<void>;
  onUpdateTextChannel: (channelId: string, patch: { name?: string; kind?: "text" | "announcement" }) => Promise<void>;
  onDeleteTextChannel: (channelId: string) => Promise<void>;
  onUpdateVoiceChannel: (channelId: string, patch: UpdateVoiceChannelRequest) => Promise<void>;
  onDeleteVoiceChannel: (channelId: string) => Promise<void>;
  onLeaveServer: () => Promise<void>;
  onDeleteServer: () => Promise<void>;
};

type PendingModalConfirm = {
  title: string;
  description: string;
  confirmLabel?: string;
  onConfirm: () => Promise<void> | void;
};

type PendingInputPrompt = {
  title: string;
  description?: string;
  fields: InputPromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (values: Record<string, string>) => Promise<void> | void;
};

export function ServerSettingsModal({
  open,
  server,
  members,
  channels,
  voiceChannels,
  currentUserId,
  onClose,
  onUpdateName,
  onUpdateMemberRole,
  onRemoveMember,
  onUpdateTextChannel,
  onDeleteTextChannel,
  onUpdateVoiceChannel,
  onDeleteVoiceChannel,
  onLeaveServer,
  onDeleteServer
}: ServerSettingsModalProps) {
  const [nameDraft, setNameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [contextConfirm, setContextConfirm] = useState<PendingModalConfirm | null>(null);
  const [inputPrompt, setInputPrompt] = useState<PendingInputPrompt | null>(null);

  const canDelete = server?.ownerId === currentUserId;
  const onlineCount = useMemo(() => members.filter((member) => member.status === "online").length, [members]);
  const createdAtLabel = useMemo(() => {
    if (!server?.createdAt) {
      return "-";
    }
    return new Intl.DateTimeFormat("tr-TR", {
      month: "short",
      year: "numeric"
    }).format(new Date(server.createdAt));
  }, [server?.createdAt]);
  const canKick = useMemo(() => {
    if (!server) {
      return false;
    }
    return server.role === "owner" || server.role === "admin";
  }, [server]);
  const canManageRoles = useMemo(() => {
    if (!server) {
      return false;
    }
    return server.role === "owner";
  }, [server]);
  const canManageChannels = useMemo(() => {
    if (!server) {
      return false;
    }
    return server.role === "owner" || server.role === "admin";
  }, [server]);
  const normalizedName = nameDraft.trim();
  const hasNameChanged = normalizedName.length > 0 && normalizedName !== (server?.name ?? "");

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setContextConfirm(null);
          setInputPrompt(null);
          onClose();
        } else {
          setNameDraft(server?.name ?? "");
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[81] flex h-[min(94dvh,980px)] w-[calc(100vw-1rem)] max-w-5xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/95 shadow-2xl sm:w-[calc(100vw-2rem)] sm:rounded-2xl">
          <header className="flex items-center justify-between border-b border-slate-800/80 px-4 py-3.5 sm:px-5 sm:py-4">
            <div className="min-w-0">
              <Dialog.Title className="truncate text-lg font-semibold text-slate-100">Sunucu Ayarları</Dialog.Title>
              <p className="mt-1 truncate text-xs text-slate-400">{server?.name ?? "Sunucu seçilmedi"}</p>
            </div>

            <Dialog.Close asChild>
              <button
                className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-700/80 bg-slate-800/70 text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-3 sm:p-5">
            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <section className="rounded-xl border border-slate-800/80 bg-slate-900/65 p-4">
                <h3 className="text-base font-semibold text-slate-100">Sunucu Profili</h3>
                <p className="mt-1 text-sm text-slate-400">
                  Sunucunun davet bağlantılarında ve sunucu listesinde nasıl görüneceğini buradan düzenleyebilirsin.
                </p>

                <label className="mt-5 block text-xs text-slate-400">
                  Ad
                  <input
                    className="mt-1.5 w-full rounded-md border border-slate-700 bg-slate-950/70 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-400/60"
                    maxLength={64}
                    onChange={(event) => setNameDraft(event.target.value)}
                    value={nameDraft}
                  />
                </label>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <button
                    className="inline-flex items-center gap-2 rounded-md border border-cyan-500/45 bg-cyan-500/15 px-3 py-2 text-xs text-cyan-100 transition hover:bg-cyan-500/25 disabled:opacity-50"
                    disabled={busy || !server || !hasNameChanged}
                    onClick={() => {
                      setBusy(true);
                      void onUpdateName(normalizedName).finally(() => setBusy(false));
                    }}
                    type="button"
                  >
                    <Save className="h-3.5 w-3.5" />
                    Sunucu Profilini Kaydet
                  </button>

                  <span className="rounded-md border border-slate-700/80 bg-slate-950/50 px-2 py-1 text-[11px] text-slate-400">
                    Rol: {server?.role ?? "-"}
                  </span>
                </div>
              </section>

              <section className="rounded-xl border border-slate-800/80 bg-slate-900/65 p-4">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Önizleme</h4>
                <div className="mt-3 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-900/85">
                  <div className="h-24 bg-[radial-gradient(circle_at_70%_10%,_#3b82f633_0%,_#0f172acc_48%,_#020617_100%)]" />
                  <div className="px-4 pb-4">
                    <div className="-mt-7">
                      <BrandMark size="lg" />
                    </div>

                    <p className="mt-2 truncate text-xl font-semibold text-slate-100">{normalizedName || server?.name || "Sunucu"}</p>

                    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
                      <span className="inline-flex items-center gap-1">
                        <span className="h-2 w-2 rounded-full bg-emerald-400" />
                        {onlineCount} çevrimiçi
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {members.length} üye
                      </span>
                    </div>

                    <p className="mt-2 inline-flex items-center gap-1 text-xs text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Oluşturulma: {createdAtLabel}
                    </p>
                  </div>
                </div>
              </section>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.35fr_0.85fr]">
              <section className="rounded-xl border border-slate-800/80 bg-slate-900/65 p-4">
                <h3 className="text-sm font-semibold text-slate-100">Üyeler</h3>
                <div className="mt-3 max-h-[280px] space-y-2 overflow-y-auto pr-1">
                  {members.length === 0 && <p className="text-xs text-slate-500">Üye bulunamadı.</p>}
                  {members.map((member) => (
                    <div className="flex items-center gap-2 rounded-md border border-slate-800/90 bg-slate-900/50 px-3 py-2" key={member.userId}>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-200">{member.displayName}</span>
                        <span className="block truncate text-[11px] text-slate-500">@{member.username}</span>
                      </span>
                      {member.role === "owner" ? (
                        <Crown className="h-4 w-4 text-amber-300" />
                      ) : member.role === "admin" ? (
                        <Shield className="h-4 w-4 text-cyan-300" />
                      ) : null}
                      {member.role !== "owner" ? (
                        <select
                          className="rounded border border-slate-700/80 bg-slate-950/70 px-2 py-1 text-[11px] text-slate-200 outline-none disabled:opacity-50"
                          disabled={!canManageRoles || busy}
                          onChange={(event) => {
                            const nextRole = event.target.value === "admin" ? "admin" : "member";
                            setBusy(true);
                            void onUpdateMemberRole(member.userId, nextRole).finally(() => setBusy(false));
                          }}
                          value={member.role === "admin" ? "admin" : "member"}
                        >
                          <option value="member">Member</option>
                          <option value="admin">Admin</option>
                        </select>
                      ) : (
                        <span className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200">Owner</span>
                      )}
                      <button
                        className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700/80 text-slate-300 transition hover:border-rose-500/50 hover:text-rose-200 disabled:opacity-40"
                        disabled={!canKick || busy || member.userId === currentUserId || member.role === "owner"}
                        onClick={() => {
                          setContextConfirm({
                            title: "Üyeyi çıkar",
                            description: `${member.displayName} sunucudan çıkarılsın mı?`,
                            confirmLabel: "Çıkar",
                            onConfirm: async () => {
                              setBusy(true);
                              try {
                                await onRemoveMember(member.userId);
                              } finally {
                                setBusy(false);
                              }
                            }
                          });
                        }}
                        title="Üyeyi çıkar"
                        type="button"
                      >
                        <UserMinus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </section>

              <section className="rounded-xl border border-slate-800/80 bg-slate-900/65 p-4">
                <h3 className="text-sm font-semibold text-slate-100">Sunucu İşlemleri</h3>
                <div className="mt-3 space-y-2">
                  <button
                    className="flex w-full items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-left text-xs text-amber-200 transition hover:bg-amber-500/25 disabled:opacity-50"
                    disabled={busy || !server}
                    onClick={() => {
                      setBusy(true);
                      void onLeaveServer().finally(() => setBusy(false));
                    }}
                    type="button"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sunucudan ayrıl
                  </button>

                  <button
                    className="flex w-full items-center gap-2 rounded-md border border-rose-500/40 bg-rose-500/15 px-3 py-2 text-left text-xs text-rose-200 transition hover:bg-rose-500/25 disabled:opacity-50"
                    disabled={busy || !server || !canDelete}
                    onClick={() => {
                      setBusy(true);
                      void onDeleteServer().finally(() => setBusy(false));
                    }}
                    type="button"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Sunucuyu sil
                  </button>
                </div>
              </section>
            </div>

            <section className="rounded-xl border border-slate-800/80 bg-slate-900/65 p-4">
              <h3 className="text-sm font-semibold text-slate-100">Kanal Ayarları</h3>
              <p className="mt-1 text-xs text-slate-400">Metin ve ses kanallarını yeniden adlandırabilir veya silebilirsin.</p>

              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="rounded-lg border border-slate-800/80 bg-slate-950/35 p-3">
                  <h4 className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Hash className="h-3.5 w-3.5" />
                    Metin Kanalları
                  </h4>
                  <div className="space-y-2">
                    {channels.length === 0 ? <p className="text-xs text-slate-500">Metin kanalı yok.</p> : null}
                    {channels.map((channel) => (
                      <div className="flex items-center gap-2 rounded border border-slate-800/80 bg-slate-900/50 px-2 py-1.5" key={channel.id}>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">#{channel.name}</span>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700/80 text-slate-200 transition hover:border-cyan-500/60 hover:text-cyan-200 disabled:opacity-40"
                          disabled={!canManageChannels || busy}
                          onClick={() => {
                            setInputPrompt({
                              title: "Metin Kanalını Düzenle",
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
                                const nextName = (values.name ?? "").trim();
                                if (!nextName) {
                                  return;
                                }
                                setBusy(true);
                                try {
                                  await onUpdateTextChannel(channel.id, { name: nextName });
                                  setInputPrompt(null);
                                } finally {
                                  setBusy(false);
                                }
                              }
                            });
                          }}
                          title="Kanalı düzenle"
                          type="button"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-500/40 text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-40"
                          disabled={!canManageChannels || busy}
                          onClick={() => {
                            setContextConfirm({
                              title: "Kanal Silinsin mi?",
                              description: `#${channel.name} kanalını silmek istiyor musun?`,
                              confirmLabel: "Sil",
                              onConfirm: async () => {
                                setBusy(true);
                                try {
                                  await onDeleteTextChannel(channel.id);
                                } finally {
                                  setBusy(false);
                                }
                              }
                            });
                          }}
                          title="Kanalı sil"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-slate-800/80 bg-slate-950/35 p-3">
                  <h4 className="mb-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                    <Volume2 className="h-3.5 w-3.5" />
                    Ses Kanalları
                  </h4>
                  <div className="space-y-2">
                    {voiceChannels.length === 0 ? <p className="text-xs text-slate-500">Ses kanalı yok.</p> : null}
                    {voiceChannels.map((channel) => (
                      <div className="flex items-center gap-2 rounded border border-slate-800/80 bg-slate-900/50 px-2 py-1.5" key={channel.id}>
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                          {channel.name} <span className="text-xs text-slate-500">({channel.maxParticipants})</span>
                        </span>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-700/80 text-slate-200 transition hover:border-cyan-500/60 hover:text-cyan-200 disabled:opacity-40"
                          disabled={!canManageChannels || busy}
                          onClick={() => {
                            setInputPrompt({
                              title: "Ses Kanalını Düzenle",
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
                                const maxParticipants =
                                  Number.isFinite(parsedMax) && parsedMax > 0 && parsedMax <= 100
                                    ? parsedMax
                                    : channel.maxParticipants;
                                setBusy(true);
                                try {
                                  await onUpdateVoiceChannel(channel.id, { name: nextName, maxParticipants });
                                  setInputPrompt(null);
                                } finally {
                                  setBusy(false);
                                }
                              }
                            });
                          }}
                          title="Ses kanalını düzenle"
                          type="button"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-500/40 text-rose-200 transition hover:bg-rose-500/15 disabled:opacity-40"
                          disabled={!canManageChannels || busy}
                          onClick={() => {
                            setContextConfirm({
                              title: "Ses Kanalı Silinsin mi?",
                              description: `${channel.name} ses kanalını silmek istiyor musun?`,
                              confirmLabel: "Sil",
                              onConfirm: async () => {
                                setBusy(true);
                                try {
                                  await onDeleteVoiceChannel(channel.id);
                                } finally {
                                  setBusy(false);
                                }
                              }
                            });
                          }}
                          title="Ses kanalını sil"
                          type="button"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </Dialog.Content>

        <ConfirmModal
          cancelLabel="Vazgeç"
          confirmLabel={contextConfirm?.confirmLabel ?? "Onayla"}
          description={contextConfirm?.description ?? ""}
          onClose={() => setContextConfirm(null)}
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
      </Dialog.Portal>
    </Dialog.Root>
  );
}

