import { env } from "./env";

function trimSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

export function resolveAvatarURL(avatarPath?: string | null): string | null {
  const raw = avatarPath?.trim();
  if (!raw) {
    return null;
  }

  if (/^data:image\//i.test(raw)) {
    return raw;
  }

  try {
    if (/^https?:\/\//i.test(raw)) {
      return new URL(raw).toString();
    }

    if (raw.startsWith("//")) {
      return new URL(`https:${raw}`).toString();
    }

    const base = `${trimSlash(env.cdnBaseUrl)}/`;
    const normalized = raw.replace(/^\/+/, "");
    return new URL(normalized, base).toString();
  } catch {
    return null;
  }
}
