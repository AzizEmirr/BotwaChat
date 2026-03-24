import { type FriendsHomeTab } from "../components/workspace/FriendsHome";
import { type SettingsSectionId } from "../components/workspace/SettingsModal";
import { fromPublicID, toPublicID } from "./publicId";

export type ParsedWorkspaceRoute =
  | { kind: "friends"; tab: FriendsHomeTab }
  | { kind: "dm"; dmId: string }
  | { kind: "server"; serverId: string; channelId: string | null }
  | { kind: "settings"; section: SettingsSectionId };

const FRIENDS_TABS: FriendsHomeTab[] = ["online", "all", "pending", "add-friend"];
const SETTINGS_SECTIONS: SettingsSectionId[] = [
  "account",
  "privacy",
  "appearance",
  "voice-video",
  "chat",
  "keybinds",
  "windows",
  "streamer-mode"
];

export function normalizeFriendsTab(raw: string | null): FriendsHomeTab {
  if (!raw) {
    return "all";
  }
  if (FRIENDS_TABS.includes(raw as FriendsHomeTab)) {
    return raw as FriendsHomeTab;
  }
  return "all";
}

export function isSettingsSection(raw: string): raw is SettingsSectionId {
  return SETTINGS_SECTIONS.includes(raw as SettingsSectionId);
}

export function toMePath(tab: FriendsHomeTab): string {
  void tab;
  return "/channels/@me";
}

export function toPathnameSearch(route: ParsedWorkspaceRoute): string {
  if (route.kind === "friends") {
    return toMePath(route.tab);
  }
  if (route.kind === "dm") {
    return `/channels/dm/${toPublicID(route.dmId)}`;
  }
  if (route.kind === "server") {
    if (route.channelId) {
      return `/channels/${toPublicID(route.serverId)}/${toPublicID(route.channelId)}`;
    }
    return `/channels/${toPublicID(route.serverId)}`;
  }
  return `/settings/${route.section}`;
}

export function parseWorkspaceRoute(pathname: string, search: string): ParsedWorkspaceRoute | null {
  const normalizedPathname = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;

  if (normalizedPathname === "/channels/@me") {
    const params = new URLSearchParams(search);
    return {
      kind: "friends",
      tab: normalizeFriendsTab(params.get("tab"))
    };
  }

  const dmMatch = /^\/channels\/dm\/([^/]+)$/.exec(normalizedPathname);
  if (dmMatch) {
    const dmId = fromPublicID((dmMatch[1] ?? "").trim());
    if (!dmId) {
      return null;
    }
    return { kind: "dm", dmId };
  }

  const serverChannelMatch = /^\/channels\/([^/]+)\/([^/]+)$/.exec(normalizedPathname);
  if (serverChannelMatch) {
    const serverId = fromPublicID((serverChannelMatch[1] ?? "").trim());
    const channelId = fromPublicID((serverChannelMatch[2] ?? "").trim());
    if (!serverId || !channelId || serverId === "@me" || serverId === "dm") {
      return null;
    }
    return { kind: "server", serverId, channelId };
  }

  const serverMatch = /^\/channels\/([^/]+)$/.exec(normalizedPathname);
  if (serverMatch) {
    const serverId = fromPublicID((serverMatch[1] ?? "").trim());
    if (!serverId || serverId === "@me" || serverId === "dm") {
      return null;
    }
    return { kind: "server", serverId, channelId: null };
  }

  const settingsMatch = /^\/settings\/([^/]+)$/.exec(normalizedPathname);
  if (settingsMatch) {
    const section = (settingsMatch[1] ?? "").trim();
    if (!isSettingsSection(section)) {
      return null;
    }
    return { kind: "settings", section };
  }

  return null;
}

export function normalizeProtectedPath(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/")) {
    return null;
  }

  try {
    const parsed = new URL(value, "http://catwa.local");
    const route = parseWorkspaceRoute(parsed.pathname, parsed.search);
    if (!route) {
      return null;
    }
    return toPathnameSearch(route);
  } catch {
    return null;
  }
}
