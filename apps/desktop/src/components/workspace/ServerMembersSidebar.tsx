import { Crown, Shield, User } from "lucide-react";
import { resolveAvatarURL } from "../../lib/avatar";
import { toPublicID } from "../../lib/publicId";
import { toastInfo } from "../../store/toastStore";
import type { PresenceState, ServerMember } from "../../types/chat";
import { ContextMenu } from "./ContextMenu";
import { avatarTone, displayInitials, formatPresence, presenceDotClass } from "./ui";

type ServerMembersSidebarProps = {
  members: ServerMember[];
  presenceByUser?: Record<string, PresenceState>;
  loading: boolean;
  currentUserId?: string | null;
  onStartDM?: (userId: string) => void;
};

export function ServerMembersSidebar({ members, presenceByUser = {}, loading, currentUserId, onStartDM }: ServerMembersSidebarProps) {
  const getPresence = (member: ServerMember): PresenceState => {
    const resolved = presenceByUser[member.userId];
    if (resolved) {
      return resolved;
    }
    return {
      status: member.status,
      lastSeen: member.lastSeenAt
    };
  };

  const onlineMembers = members.filter((member) => {
    const status = getPresence(member).status;
    return status === "online" || status === "idle" || status === "dnd";
  });
  const offlineMembers = members.filter((member) => !onlineMembers.includes(member));

  const roleIcon = (role: string) => {
    if (role === "owner") {
      return <Crown className="h-3.5 w-3.5 text-amber-300" />;
    }
    if (role === "admin") {
      return <Shield className="h-3.5 w-3.5 text-cyan-300" />;
    }
    return <User className="h-3.5 w-3.5 text-slate-500" />;
  };

  const copyText = async (value: string, title: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toastInfo(title, "Panoya kopyalandı.");
    } catch {
      // noop
    }
  };

  const renderMemberRow = (member: ServerMember, tone: "online" | "offline") => {
    const avatarSrc = resolveAvatarURL(member.avatarPath);
    const presence = getPresence(member);

    return (
      <ContextMenu
        actions={[
          {
            id: `member-dm-${member.userId}`,
            disabled: !onStartDM || member.userId === currentUserId,
            label: member.userId === currentUserId ? "Kendine DM açılamaz" : "DM Başlat",
            onSelect: () => onStartDM?.(member.userId)
          },
          {
            id: `member-copy-name-${member.userId}`,
            label: "Kullanıcı adını kopyala",
            onSelect: () => {
              void copyText(`@${member.username}`, "Kullanıcı adı kopyalandı");
            }
          },
          {
            id: `member-copy-id-${member.userId}`,
            label: "Kullanıcı ID'sini kopyala",
            onSelect: () => {
              void copyText(toPublicID(member.userId), "Kullanıcı ID'si kopyalandı");
            }
          }
        ]}
        key={member.userId}
      >
        <button
          className={`flex w-full items-center gap-2 rounded-md border px-2.5 py-2 text-left transition ${
            tone === "online"
              ? "border-slate-800/90 bg-slate-900/50 hover:border-slate-700/90 hover:bg-slate-800/65"
              : "border-slate-800/90 bg-slate-900/40 hover:border-slate-700/90 hover:bg-slate-800/55"
          }`}
          type="button"
        >
          <div
            className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-[10px] font-semibold text-slate-100"
            style={{ backgroundColor: avatarTone(member.userId || member.username) }}
          >
            {avatarSrc ? <img alt={`${member.displayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} /> : displayInitials(member.displayName, member.username)}
            <span
              className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border border-slate-900 ${presenceDotClass(presence)}`}
            />
          </div>

          <span className="min-w-0 flex-1">
            <span className={`block truncate text-sm ${tone === "online" ? "text-slate-200" : "text-slate-300"}`}>{member.displayName}</span>
            <span className="block truncate text-[11px] text-slate-500">
              @{member.username}
              {tone === "offline" ? ` • ${formatPresence(presence)}` : ""}
            </span>
          </span>

          {roleIcon(member.role)}
        </button>
      </ContextMenu>
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="shrink-0 border-b border-slate-800/90 px-4 py-4">
        <h3 className="text-sm font-semibold text-slate-100">Sunucu Üyeleri</h3>
        <p className="mt-1 text-xs text-slate-400">Toplam: {members.length}</p>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {loading && <p className="px-2 text-xs text-slate-500">Üyeler yükleniyor...</p>}
        {!loading && members.length === 0 && <p className="px-2 text-xs text-slate-500">Sunucuda üye bulunamadı.</p>}

        {!loading && members.length > 0 && (
          <div className="space-y-4">
            <section>
              <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Çevrimiçi — {onlineMembers.length}</h4>
              <div className="mt-1 space-y-1">{onlineMembers.map((member) => renderMemberRow(member, "online"))}</div>
            </section>

            <section>
              <h4 className="px-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Çevrimdışı — {offlineMembers.length}</h4>
              <div className="mt-1 space-y-1">{offlineMembers.map((member) => renderMemberRow(member, "offline"))}</div>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}

