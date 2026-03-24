import type { ReactNode } from "react";
import { ValkyrieDiscordTemplate } from "./templates/ValkyrieDiscordTemplate";

type AppShellProps = {
  topBar: ReactNode;
  serverRail: ReactNode;
  sidebar: ReactNode;
  main: ReactNode;
  rightSidebar: ReactNode;
  sidebarCollapsed: boolean;
  rightSidebarOpen: boolean;
  compactMode: boolean;
};

export function AppShell({
  topBar,
  serverRail,
  sidebar,
  main,
  rightSidebar,
  sidebarCollapsed,
  rightSidebarOpen,
  compactMode
}: AppShellProps) {
  return (
    <ValkyrieDiscordTemplate
      compactMode={compactMode}
      main={main}
      rail={serverRail}
      rightSidebar={rightSidebar}
      rightSidebarOpen={rightSidebarOpen}
      sidebar={sidebar}
      sidebarCollapsed={sidebarCollapsed}
      topBar={topBar}
    />
  );
}
