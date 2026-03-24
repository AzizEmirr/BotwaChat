import { isTauriDesktop } from "./runtime";
import { configureDesktopStartup, readDesktopStartupConfiguration } from "./desktopBridge";

export type StartupConfiguration = {
  enabled: boolean;
  startMinimized: boolean;
};

const DEFAULT_CONFIG: StartupConfiguration = {
  enabled: false,
  startMinimized: false
};

export async function readStartupConfiguration(): Promise<StartupConfiguration> {
  if (!isTauriDesktop()) {
    return DEFAULT_CONFIG;
  }

  return readDesktopStartupConfiguration();
}

export async function configureStartup(enabled: boolean, startMinimized: boolean): Promise<StartupConfiguration> {
  if (!isTauriDesktop()) {
    return DEFAULT_CONFIG;
  }

  return configureDesktopStartup(enabled, startMinimized);
}
