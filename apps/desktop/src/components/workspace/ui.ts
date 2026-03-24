import { normalizePresenceStatus } from "../../lib/presence";
import type { PresenceState } from "../../types/chat";

const shortTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  hour: "2-digit",
  minute: "2-digit"
});

const dateTimeFormatter = new Intl.DateTimeFormat("tr-TR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

export function formatPresence(presence?: PresenceState): string {
  const status = normalizePresenceStatus(presence?.status);

  if (status === "online") {
    return "Çevrimiçi";
  }
  if (status === "idle") {
    return "Boşta";
  }
  if (status === "dnd") {
    return "Rahatsız Etmeyin";
  }
  if (status === "invisible") {
    return "Görünmez";
  }

  if (presence?.lastSeen) {
    return `Son görülme ${dateTimeFormatter.format(new Date(presence.lastSeen))}`;
  }

  if (status === "offline") {
    return "Çevrimdışı";
  }

  return "Durum bilinmiyor";
}

export function presenceDotClass(presence?: PresenceState): string {
  const status = normalizePresenceStatus(presence?.status);

  if (status === "online") {
    return "bg-emerald-400";
  }
  if (status === "idle") {
    return "bg-amber-400";
  }
  if (status === "dnd") {
    return "bg-rose-400";
  }
  if (status === "invisible") {
    return "bg-slate-600";
  }
  if (status === "offline") {
    return "bg-slate-500";
  }
  return "bg-slate-500";
}

export function formatClock(value: string): string {
  return shortTimeFormatter.format(new Date(value));
}

export function displayInitials(displayName: string, username: string): string {
  const source = displayName.trim() || username.trim();
  if (!source) {
    return "?";
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export function avatarTone(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = seed.charCodeAt(index) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash % 360);
  return `hsl(${hue} 55% 34%)`;
}
