import { env } from "./env";
import { httpFetch } from "./httpClient";

type SecureBlobCacheEntry = {
  url: string;
  expiresAtMs: number;
};

const SECURE_BLOB_CACHE = new Map<string, SecureBlobCacheEntry>();
const CACHE_TTL_MS = 60_000;
const CACHE_SAFETY_WINDOW_MS = 5_000;

function normalizeBaseURL(baseURL: string): string {
  return baseURL.trim().replace(/\/+$/, "");
}

export function extractUploadPath(value: string): string | null {
  const input = value.trim();
  if (!input) {
    return null;
  }

  try {
    const parsed = new URL(input, typeof window !== "undefined" ? window.location.origin : "http://localhost");
    const marker = "/uploads/";
    const markerIndex = parsed.pathname.indexOf(marker);
    if (markerIndex < 0) {
      return null;
    }
    const relative = parsed.pathname.slice(markerIndex + marker.length).replace(/^\/+/, "");
    return relative || null;
  } catch {
    const cleaned = input.replace(/^\/+/, "");
    if (cleaned.startsWith("uploads/")) {
      const relative = cleaned.slice("uploads/".length).replace(/^\/+/, "");
      return relative || null;
    }
    return null;
  }
}

function readCache(path: string): string | null {
  const entry = SECURE_BLOB_CACHE.get(path);
  if (!entry) {
    return null;
  }
  if (entry.expiresAtMs-Date.now() <= CACHE_SAFETY_WINDOW_MS) {
    URL.revokeObjectURL(entry.url);
    SECURE_BLOB_CACHE.delete(path);
    return null;
  }
  return entry.url;
}

function writeCache(path: string, url: string): void {
  const previous = SECURE_BLOB_CACHE.get(path);
  if (previous) {
    URL.revokeObjectURL(previous.url);
  }
  SECURE_BLOB_CACHE.set(path, { url, expiresAtMs: Date.now() + CACHE_TTL_MS });
}

export function clearAttachmentURLCache(): void {
  for (const entry of SECURE_BLOB_CACHE.values()) {
    URL.revokeObjectURL(entry.url);
  }
  SECURE_BLOB_CACHE.clear();
}

export async function resolveAttachmentURL(rawURL: string, accessToken: string): Promise<string | null> {
  const uploadPath = extractUploadPath(rawURL);
  if (!uploadPath) {
    return rawURL;
  }

  const cached = readCache(uploadPath);
  if (cached) {
    return cached;
  }

  const requestURL = `${normalizeBaseURL(env.apiBaseUrl)}/api/v1/uploads/stream?path=${encodeURIComponent(uploadPath)}`;
  const response = await httpFetch(requestURL, {
    method: "GET",
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${accessToken}`
    }
  });
  if (!response.ok) {
    return null;
  }

  try {
    const blob = await response.blob();
    if (blob.size <= 0) {
      return null;
    }
    const objectURL = URL.createObjectURL(blob);
    writeCache(uploadPath, objectURL);
    return objectURL;
  } catch {
    return null;
  }
}
