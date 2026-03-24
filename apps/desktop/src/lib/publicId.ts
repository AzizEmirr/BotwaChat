const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NUMERIC_ID_PATTERN = /^[0-9]+$/;
const BASE58_ID_PATTERN = /^[1-9A-HJ-NP-Za-km-z]+$/;
const MAX_UINT128 = (1n << 128n) - 1n;
const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_LOOKUP = new Map(BASE58_ALPHABET.split("").map((char, index) => [char, BigInt(index)]));
const MIN_NUMERIC_PUBLIC_ID_LENGTH = 22;
const MIN_BASE58_PUBLIC_ID_LENGTH = 20;
const MAX_BASE58_PUBLIC_ID_LENGTH = 22;
const MAX_SHORT_NUMERIC_PUBLIC_ID_LENGTH = 15;
const SHORT_ID_RANGE = 900_000_000_000_000n;
const SHORT_ID_BASE = 100_000_000_000_000n;
const SHORT_ID_PROBE_STEP = 104_729n;
const FNV64_OFFSET_BASIS = 0xcbf29ce484222325n;
const FNV64_PRIME = 0x100000001b3n;
const UINT64_MASK = (1n << 64n) - 1n;
const PUBLIC_ID_STORAGE_KEY = "catwa.publicIdMap.v1";

let shortPublicToUUIDCache: Record<string, string> | null = null;
let uuidToShortPublicCache: Record<string, string> | null = null;

function normalizeUUID(value: string): string {
  return value.trim().toLowerCase();
}

export function isUUID(value: string): boolean {
  return UUID_PATTERN.test(normalizeUUID(value));
}

export function isNumericID(value: string): boolean {
  return NUMERIC_ID_PATTERN.test(value.trim());
}

function canUseLocalStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function normalizeStoredPublicMap(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") {
    return {};
  }

  const entries = Object.entries(raw as Record<string, unknown>);
  const next: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (
      NUMERIC_ID_PATTERN.test(key) &&
      key.length <= MAX_SHORT_NUMERIC_PUBLIC_ID_LENGTH &&
      typeof value === "string" &&
      isUUID(value)
    ) {
      next[key] = normalizeUUID(value);
    }
  }
  return next;
}

function loadShortPublicMap(): Record<string, string> {
  if (shortPublicToUUIDCache) {
    return shortPublicToUUIDCache;
  }

  if (!canUseLocalStorage()) {
    shortPublicToUUIDCache = {};
    uuidToShortPublicCache = {};
    return shortPublicToUUIDCache;
  }

  try {
    const raw = window.localStorage.getItem(PUBLIC_ID_STORAGE_KEY);
    if (!raw) {
      shortPublicToUUIDCache = {};
      uuidToShortPublicCache = {};
      return shortPublicToUUIDCache;
    }
    const parsed = JSON.parse(raw);
    shortPublicToUUIDCache = normalizeStoredPublicMap(parsed);
    uuidToShortPublicCache = {};
    for (const [publicId, uuid] of Object.entries(shortPublicToUUIDCache)) {
      uuidToShortPublicCache[uuid] = publicId;
    }
    return shortPublicToUUIDCache;
  } catch {
    shortPublicToUUIDCache = {};
    uuidToShortPublicCache = {};
    return shortPublicToUUIDCache;
  }
}

function persistShortPublicMap(): void {
  if (!canUseLocalStorage() || !shortPublicToUUIDCache) {
    return;
  }

  try {
    window.localStorage.setItem(PUBLIC_ID_STORAGE_KEY, JSON.stringify(shortPublicToUUIDCache));
  } catch {
    // Ignore quota/privacy failures and keep runtime map only.
  }
}

function fnv1a64(value: string): bigint {
  let hash = FNV64_OFFSET_BASIS;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * FNV64_PRIME) & UINT64_MASK;
  }
  return hash;
}

function shortNumericFromUUID(uuid: string): string {
  const hash = fnv1a64(uuid);
  const candidate = SHORT_ID_BASE + (hash % SHORT_ID_RANGE);
  return candidate.toString(10);
}

function isShortNumericPublicID(value: string): boolean {
  return NUMERIC_ID_PATTERN.test(value) && value.length <= MAX_SHORT_NUMERIC_PUBLIC_ID_LENGTH;
}

function registerShortPublicID(uuid: string): string {
  const publicToUUID = loadShortPublicMap();
  const uuidToPublic = uuidToShortPublicCache ?? {};
  uuidToShortPublicCache = uuidToPublic;

  const existing = uuidToPublic[uuid];
  if (existing && publicToUUID[existing] === uuid) {
    return existing;
  }

  const baseCandidate = shortNumericFromUUID(uuid);
  let numericCandidate = BigInt(baseCandidate);
  for (let attempts = 0; attempts < 4096; attempts += 1) {
    const candidate = numericCandidate.toString(10);
    const owner = publicToUUID[candidate];
    if (!owner || owner === uuid) {
      publicToUUID[candidate] = uuid;
      uuidToPublic[uuid] = candidate;
      persistShortPublicMap();
      return candidate;
    }

    const offset = (numericCandidate - SHORT_ID_BASE + SHORT_ID_PROBE_STEP) % SHORT_ID_RANGE;
    numericCandidate = SHORT_ID_BASE + offset;
  }

  // Highly unlikely fallback: use deterministic base candidate without collision resolution.
  publicToUUID[baseCandidate] = uuid;
  uuidToPublic[uuid] = baseCandidate;
  persistShortPublicMap();
  return baseCandidate;
}

function resolveShortPublicID(publicId: string): string | null {
  if (!isShortNumericPublicID(publicId)) {
    return null;
  }
  const map = loadShortPublicMap();
  const mapped = map[publicId];
  return mapped && isUUID(mapped) ? normalizeUUID(mapped) : null;
}

function encodeBase58(value: bigint): string {
  if (value === 0n) {
    return BASE58_ALPHABET[0] ?? "1";
  }

  let current = value;
  let encoded = "";
  while (current > 0n) {
    const remainder = Number(current % 58n);
    encoded = `${BASE58_ALPHABET[remainder]}${encoded}`;
    current /= 58n;
  }
  return encoded;
}

function decodeBase58(value: string): bigint | null {
  let decoded = 0n;
  for (const char of value) {
    const digit = BASE58_LOOKUP.get(char);
    if (digit === undefined) {
      return null;
    }
    decoded = decoded * 58n + digit;
  }
  return decoded;
}

function looksLikeLegacyNumericPublicID(value: string): boolean {
  return isNumericID(value) && value.length >= MIN_NUMERIC_PUBLIC_ID_LENGTH;
}

function looksLikeBase58PublicID(value: string): boolean {
  return (
    value.length >= MIN_BASE58_PUBLIC_ID_LENGTH &&
    value.length <= MAX_BASE58_PUBLIC_ID_LENGTH &&
    BASE58_ID_PATTERN.test(value)
  );
}

export function uuidToPublicID(value: string): string | null {
  const normalized = normalizeUUID(value);
  if (!isUUID(normalized)) {
    return null;
  }

  return registerShortPublicID(normalized);
}

export function publicIDToUUID(value: string): string | null {
  const normalized = value.trim();
  const shortMapped = resolveShortPublicID(normalized);
  if (shortMapped) {
    return shortMapped;
  }
  let numeric: bigint | null = null;

  if (looksLikeLegacyNumericPublicID(normalized)) {
    try {
      numeric = BigInt(normalized);
    } catch {
      numeric = null;
    }
  } else if (looksLikeBase58PublicID(normalized)) {
    numeric = decodeBase58(normalized);
  }

  if (numeric === null || numeric < 0n || numeric > MAX_UINT128) {
    return null;
  }

  try {
    const hex = numeric.toString(16).padStart(32, "0");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  } catch {
    return null;
  }
}

export function toPublicID(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return uuidToPublicID(normalized) ?? normalized;
}

export function fromPublicID(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return "";
  }

  return publicIDToUUID(normalized) ?? normalized;
}
