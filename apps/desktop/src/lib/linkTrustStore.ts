const TRUSTED_DOMAINS_STORAGE_KEY = "catwa.trustedExternalDomains";

function normalizeDomain(domain: string): string {
  return domain.trim().toLowerCase();
}

function readStorage(): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(TRUSTED_DOMAINS_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((item) => (typeof item === "string" ? normalizeDomain(item) : ""))
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function writeStorage(domains: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  const unique = Array.from(new Set(domains.map(normalizeDomain).filter((item) => item.length > 0)));
  window.localStorage.setItem(TRUSTED_DOMAINS_STORAGE_KEY, JSON.stringify(unique));
}

export function getTrustedExternalDomains(): string[] {
  return readStorage();
}

export function isTrustedExternalDomain(domain: string): boolean {
  if (!domain.trim()) {
    return false;
  }

  const normalized = normalizeDomain(domain);
  return readStorage().includes(normalized);
}

export function trustExternalDomain(domain: string): void {
  const normalized = normalizeDomain(domain);
  if (!normalized) {
    return;
  }

  const current = readStorage();
  if (current.includes(normalized)) {
    return;
  }

  writeStorage([...current, normalized]);
}

export function clearTrustedExternalDomains(): void {
  writeStorage([]);
}
