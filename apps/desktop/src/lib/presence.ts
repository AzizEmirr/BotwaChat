import type { PresenceState, PresenceStatus } from "../types/chat";

const KNOWN_STATUSES: PresenceStatus[] = ["online", "idle", "dnd", "invisible", "offline", "unknown"];

const STATUS_ALIASES: Record<string, PresenceStatus> = {
  active: "online",
  available: "online",
  away: "idle",
  busy: "dnd",
  do_not_disturb: "dnd",
  donotdisturb: "dnd",
  hidden: "invisible",
  invisible: "invisible",
  incognito: "invisible",
  none: "unknown",
  unknown: "unknown"
};

export function normalizePresenceStatus(input?: string | null): PresenceStatus {
  const raw = (input ?? "").trim().toLowerCase();
  if (!raw) {
    return "unknown";
  }

  if ((KNOWN_STATUSES as string[]).includes(raw)) {
    return raw as PresenceStatus;
  }

  return STATUS_ALIASES[raw] ?? "unknown";
}

type PresenceLike = {
  status?: string | null;
  lastSeen?: string | null;
};

export function normalizePresenceState(input?: PresenceLike | null, fallbackStatus: PresenceStatus = "unknown"): PresenceState {
  const normalized = normalizePresenceStatus(input?.status);
  const status = normalized === "unknown" ? fallbackStatus : normalized;
  const lastSeen = typeof input?.lastSeen === "string" && input.lastSeen.trim() ? input.lastSeen : undefined;
  return {
    status,
    lastSeen
  };
}

export function presenceFrom(status?: string | null, lastSeen?: string): PresenceState {
  return normalizePresenceState({ status, lastSeen });
}
