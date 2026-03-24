import type { ReactNode } from "react";

/**
 * Adapted from Valkyrie open-source Discord-like layout scaffold:
 * https://github.com/sentrionic/Valkyrie (MIT)
 *
 * Original structure: 4-column Discord app shell (guild rail, sidebar, chat, members)
 * then adjusted to Catwa slots and responsive/collapsible behavior.
 */
export type ValkyrieDiscordTemplateProps = {
  topBar: ReactNode;
  rail: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  rightSidebar: ReactNode;
  sidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  compactMode: boolean;
};

export function ValkyrieDiscordTemplate({
  topBar,
  rail,
  sidebar,
  main,
  rightSidebar,
  sidebarCollapsed: _sidebarCollapsed,
  rightSidebarOpen,
  compactMode
}: ValkyrieDiscordTemplateProps) {
  const railWidth = compactMode ? 66 : 72;
  const sidebarWidth = compactMode ? 304 : 332;
  const rightWidth = rightSidebarOpen ? (compactMode ? 286 : 320) : 0;
  // Keep left sidebar width fixed so it never gets squeezed on desktop layouts.
  const sidebarTrack = `${sidebarWidth}px`;
  const rightTrack = `${rightWidth}px`;

  return (
    <main
      className="cw-app-shell cw-app-shell--valkyrie"
      data-right-open={rightSidebarOpen ? "1" : "0"}
      data-sidebar-collapsed="0"
    >
      <div
        className="cw-template-grid"
        style={{
          gridTemplateColumns: `${railWidth}px ${sidebarTrack} minmax(0, 1fr) ${rightTrack}`
        }}
      >
        <header className="cw-template-top">{topBar}</header>
        <aside className="cw-template-rail">{rail}</aside>
        <aside className="cw-template-sidebar">{sidebar}</aside>
        <section className="cw-template-main">{main}</section>
        <aside className="cw-template-right">{rightSidebar}</aside>
      </div>
    </main>
  );
}
