import { FolderPlus, ChevronRight } from "lucide-react";
import appLogo from "../../assets/app-logo.png";
import { toPublicID } from "../../lib/publicId";
import { toastInfo } from "../../store/toastStore";
import type { ServerSummary, UserProfile } from "../../types/chat";
import { ContextMenu } from "./ContextMenu";
import { displayInitials } from "./ui";

export type ServerRailMenuAction = "invite" | "notifications" | "settings" | "privacy" | "create-event" | "leave";

type ServerRailProps = {
  appName: string;
  currentUser: UserProfile | null;
  servers: ServerSummary[];
  selectedServerId: string | null;
  creatingServer: boolean;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenHome: () => void;
  onSelectServer: (serverId: string) => void;
  onCreateServer: () => void;
  onServerMenuAction: (serverId: string, action: ServerRailMenuAction) => void;
};

export function ServerRail({
  appName,
  currentUser: _currentUser,
  servers,
  selectedServerId,
  creatingServer,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenHome,
  onSelectServer,
  onCreateServer,
  onServerMenuAction
}: ServerRailProps) {
  return (
    <div className="relative flex h-full flex-col items-center px-2 py-3">
      <button
        className={`catwa-rail-btn group relative flex h-12 w-12 items-center justify-center rounded-2xl text-sm font-semibold transition ${
          selectedServerId === null
            ? "bg-[var(--catwa-accent-soft)] text-slate-100"
            : "bg-slate-900/55 text-slate-200 hover:rounded-xl hover:bg-slate-800/80"
        }`}
        onClick={onOpenHome}
        title={`${appName} • Arkadaşlar ve DM`}
        type="button"
      >
        <img
          alt={`${appName} logo`}
          className="h-10 w-10 select-none object-contain brightness-125 contrast-110 saturate-125 mix-blend-screen"
          draggable={false}
          src={appLogo}
        />
      </button>

      {sidebarCollapsed ? (
        <button
          className="catwa-rail-btn mt-2 inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900/65 text-slate-300 transition hover:bg-slate-800/85 hover:text-slate-100"
          onClick={onToggleSidebar}
          title="Paneli aç"
          type="button"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      ) : null}

      <div className="my-2 h-px w-9 bg-[var(--catwa-border-soft)]" />

      <div className="flex w-full flex-1 flex-col items-center gap-2 overflow-y-auto pb-2">
        {servers.map((server) => {
          const active = server.id === selectedServerId;
          const canManageServer = server.role === "owner" || server.role === "admin";
          return (
            <ContextMenu
              actions={[
                {
                  id: `server-invite-${server.id}`,
                  label: "Sunucuya Davet Et",
                  disabled: !canManageServer,
                  onSelect: () => onServerMenuAction(server.id, "invite")
                },
                {
                  id: `server-notifications-${server.id}`,
                  label: "Bildirim Ayarları",
                  onSelect: () => onServerMenuAction(server.id, "notifications")
                },
                {
                  id: `server-settings-${server.id}`,
                  label: "Sunucu Ayarları",
                  disabled: !canManageServer,
                  onSelect: () => onServerMenuAction(server.id, "settings")
                },
                {
                  id: `server-privacy-${server.id}`,
                  label: "Gizlilik Ayarları",
                  disabled: !canManageServer,
                  onSelect: () => onServerMenuAction(server.id, "privacy")
                },
                {
                  id: `server-event-${server.id}`,
                  label: "Etkinlik Oluştur",
                  disabled: !canManageServer,
                  onSelect: () => onServerMenuAction(server.id, "create-event")
                },
                {
                  id: `server-copy-id-${server.id}`,
                  label: "Sunucu ID'sini Kopyala",
                  onSelect: async () => {
                    try {
                      await navigator.clipboard.writeText(toPublicID(server.id));
                      toastInfo("Sunucu ID'si kopyalandı", server.name);
                    } catch {
                      // noop
                    }
                  },
                  separatorBefore: true
                },
                {
                  id: `server-leave-${server.id}`,
                  label: "Sunucudan Ayrıl",
                  danger: true,
                  onSelect: () => onServerMenuAction(server.id, "leave")
                }
              ]}
              key={server.id}
            >
              <button
                className={`catwa-rail-btn group relative flex h-12 w-12 items-center justify-center text-xs font-semibold transition ${
                  active
                    ? "rounded-2xl bg-[var(--catwa-accent-soft)] text-slate-100"
                    : "rounded-[18px] bg-slate-900/55 text-slate-300 hover:rounded-xl hover:bg-slate-800/85"
                }`}
                onClick={() => onSelectServer(server.id)}
                title={`${server.name} (${server.memberCount} üye)`}
                type="button"
              >
                <span
                  className={`absolute -left-3 h-5 w-1.5 rounded-r-full bg-cyan-300 transition ${
                    active ? "opacity-100" : "opacity-0 group-hover:opacity-70"
                  }`}
                />
                {displayInitials(server.name, server.name)}
              </button>
            </ContextMenu>
          );
        })}
      </div>

      <div className="w-full border-t border-[var(--catwa-border-soft)] pt-2">
        <div className="flex w-full flex-col items-center gap-2">
          <button
            className="catwa-rail-btn inline-flex h-11 w-11 items-center justify-center rounded-[18px] bg-slate-900/70 text-slate-300 transition hover:rounded-xl hover:bg-slate-800/85 hover:text-slate-100 disabled:opacity-50"
            disabled={creatingServer}
            onClick={onCreateServer}
            title="Sunucu oluştur"
            type="button"
          >
            <FolderPlus className="h-4 w-4" />
          </button>

        </div>
      </div>
    </div>
  );
}




