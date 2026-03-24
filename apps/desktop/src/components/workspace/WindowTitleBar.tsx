import { Hash, Inbox, MessageCircle, Minus, Server, Square, Users, X } from "lucide-react";
import type { CSSProperties, MouseEvent } from "react";
import { closeDesktopWindow, minimizeDesktopWindow, toggleDesktopWindowSize } from "../../lib/desktopBridge";
import { isTauriDesktop } from "../../lib/runtime";
import { loadAppPreferences } from "../../lib/uiPreferences";

type WindowTitleBarProps = {
  context: "friends" | "dm" | "server";
  title: string;
  subtitle: string;
  wsConnected: boolean;
  inboxCount?: number;
  onOpenInbox?: (anchorRect: DOMRect) => void;
};

function ContextIcon({ context }: { context: WindowTitleBarProps["context"] }) {
  if (context === "dm") {
    return <MessageCircle className="h-3.5 w-3.5 text-slate-300" />;
  }

  if (context === "server") {
    return <Server className="h-3.5 w-3.5 text-slate-300" />;
  }

  return <Users className="h-3.5 w-3.5 text-slate-300" />;
}

async function minimizeWindow() {
  try {
    await minimizeDesktopWindow();
  } catch {
    // noop
  }
}

async function toggleWindowSize() {
  try {
    await toggleDesktopWindowSize();
  } catch {
    // noop
  }
}

async function closeWindow() {
  try {
    const preferences = loadAppPreferences();
    if (preferences.windows.closeButtonMinimizes) {
      await minimizeDesktopWindow();
      return;
    }
    await closeDesktopWindow();
  } catch {
    window.close();
  }
}

function preventDragFromControl(event: MouseEvent<HTMLElement>) {
  event.stopPropagation();
}

export function WindowTitleBar({ context, title, subtitle, wsConnected, inboxCount = 0, onOpenInbox }: WindowTitleBarProps) {
  const desktop = isTauriDesktop();
  const dragRegionStyle = { WebkitAppRegion: "drag" } as CSSProperties;
  const noDragRegionStyle = { WebkitAppRegion: "no-drag" } as CSSProperties;

  return (
    <header
      className="cw-window-bar relative z-20 h-12 shrink-0 overflow-hidden"
      data-tauri-drag-region={desktop ? "true" : undefined}
      onDoubleClick={
        desktop
          ? () => {
              void toggleWindowSize();
            }
          : undefined
      }
      style={desktop ? dragRegionStyle : undefined}
    >
      <div className="grid h-full grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 px-2 sm:gap-2 sm:px-4">
        <div className="min-w-0" />

        <div className="pointer-events-none inline-flex max-w-[calc(100vw-156px)] items-center gap-1.5 rounded-full border border-[var(--catwa-border-soft)] bg-black/15 px-2.5 py-1 text-xs backdrop-blur-sm sm:max-w-[calc(100vw-360px)] sm:gap-2 sm:px-4">
          <ContextIcon context={context} />
          <span className="max-w-[148px] truncate font-semibold text-[var(--catwa-text-main)] sm:max-w-[280px]">{title}</span>
          {subtitle ? <Hash className="hidden h-3 w-3 text-[var(--catwa-text-soft)] md:inline-block" /> : null}
          {subtitle ? <span className="hidden max-w-[220px] truncate text-[var(--catwa-text-muted)] md:inline">{subtitle}</span> : null}
        </div>

        <div className="ml-auto flex h-full items-center gap-1 justify-self-end">
          <span
            className={`inline-flex h-1.5 w-1.5 rounded-full ${wsConnected ? "bg-emerald-400" : "bg-rose-400"}`}
            title={wsConnected ? "Ba\u011flant\u0131 aktif" : "Ba\u011flant\u0131 kopuk"}
          />

          <button
            className="relative inline-flex h-8 w-8 items-center justify-center rounded-full border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_65%,black_35%)] text-slate-400 transition hover:border-[var(--catwa-accent-strong)] hover:text-slate-100"
            data-no-window-drag="true"
            onClick={(event) => {
              onOpenInbox?.(event.currentTarget.getBoundingClientRect());
            }}
            onMouseDown={desktop ? preventDragFromControl : undefined}
            style={noDragRegionStyle}
            title="Gelen kutusu"
            type="button"
          >
            <Inbox className="h-4 w-4" />
            {inboxCount > 0 ? (
              <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white">
                {inboxCount > 99 ? "99+" : inboxCount}
              </span>
            ) : null}
          </button>
          {desktop ? (
            <div className="ml-1 flex h-9 items-stretch overflow-hidden rounded-lg border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_68%,black_32%)] sm:ml-2">
              <button
                className="inline-flex w-9 items-center justify-center text-slate-400 transition hover:bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_78%,black_22%)] hover:text-slate-100 sm:w-10"
                data-no-window-drag="true"
                onClick={() => {
                  void minimizeWindow();
                }}
                onMouseDown={preventDragFromControl}
                style={noDragRegionStyle}
                title="K\u00fc\u00e7\u00fclt"
                type="button"
              >
                <Minus className="h-4 w-4" />
              </button>
              <button
                className="inline-flex w-9 items-center justify-center text-slate-400 transition hover:bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_78%,black_22%)] hover:text-slate-100 sm:w-10"
                data-no-window-drag="true"
                onClick={() => {
                  void toggleWindowSize();
                }}
                onMouseDown={preventDragFromControl}
                style={noDragRegionStyle}
                title="B\u00fcy\u00fct veya geri al"
                type="button"
              >
                <Square className="h-3.5 w-3.5" />
              </button>
              <button
                className="inline-flex w-9 items-center justify-center text-slate-400 transition hover:bg-rose-600/85 hover:text-white sm:w-10"
                data-no-window-drag="true"
                onClick={() => {
                  void closeWindow();
                }}
                onMouseDown={preventDragFromControl}
                style={noDragRegionStyle}
                title="Kapat"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </header>
  );
}
