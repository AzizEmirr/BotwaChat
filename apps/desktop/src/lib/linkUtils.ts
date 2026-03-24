import { env } from "./env";
import { summarizeMessagePreview } from "./messageContent";

export type LinkToken = {
  kind: "link";
  text: string;
  href: string;
  domain: string;
  isInternal: boolean;
  blocked: boolean;
};

export type TextToken = {
  kind: "text";
  text: string;
};

export type ParsedMessageToken = TextToken | LinkToken;

export type LinkClassification = {
  href: string;
  domain: string;
  isInternal: boolean;
  blocked: boolean;
};

const INTERNAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "app.catwa.chat", "catwa.chat", "www.catwa.chat"]);
const CANDIDATE_PATTERN =
  /((?:https?:\/\/|www\.)[^\s<]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?:\/[^\s<]*)?|\/(?:channels|login|register)[^\s<]*)/gi;
const TRAILING_PUNCTUATION = /[),.!?;:'"\]]+$/;

function normalizedHostname(value: string): string {
  return value.trim().replace(/^\[(.*)\]$/, "$1").toLowerCase();
}

function collectInternalHosts(): Set<string> {
  const result = new Set(INTERNAL_HOSTS);

  const pushUrlHost = (value?: string) => {
    if (!value) {
      return;
    }
    try {
      const parsed = new URL(value);
      const host = normalizedHostname(parsed.hostname);
      if (host) {
        result.add(host);
      }
    } catch {
      // noop
    }
  };

  pushUrlHost(env.apiBaseUrl);
  pushUrlHost(env.wsBaseUrl.replace(/^ws:/i, "http:").replace(/^wss:/i, "https:"));
  pushUrlHost(env.cdnBaseUrl);

  if (typeof window !== "undefined" && window.location.hostname) {
    result.add(normalizedHostname(window.location.hostname));
  }

  return result;
}

function trimCandidate(text: string): string {
  if (!text) {
    return text;
  }

  let value = text.trim();
  while (TRAILING_PUNCTUATION.test(value)) {
    value = value.replace(TRAILING_PUNCTUATION, "");
  }

  // Keep closing parenthesis if URL also contains opening one.
  if (value.endsWith(")")) {
    const openCount = (value.match(/\(/g) ?? []).length;
    const closeCount = (value.match(/\)/g) ?? []).length;
    if (closeCount > openCount) {
      value = value.slice(0, -1);
    }
  }

  return value;
}

function toAbsoluteUrl(input: string): string | null {
  const normalized = input.trim();
  if (!normalized) {
    return null;
  }

  const withScheme = /^https?:\/\//i.test(normalized) ? normalized : `https://${normalized}`;

  try {
    const parsed = new URL(withScheme);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

export function isDangerousScheme(rawUrl: string): boolean {
  const trimmed = rawUrl.trim().toLowerCase();
  return (
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("file:") ||
    trimmed.startsWith("vbscript:")
  );
}

export function classifyLink(rawCandidate: string): LinkClassification | null {
  const candidate = trimCandidate(rawCandidate);
  if (!candidate || isDangerousScheme(candidate)) {
    return null;
  }

  if (candidate.startsWith("/")) {
    const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost";
    const href = new URL(candidate, origin).toString();
    const domain = typeof window !== "undefined" ? normalizedHostname(window.location.hostname) : "localhost";
    return {
      href,
      domain,
      isInternal: true,
      blocked: false
    };
  }

  const href = toAbsoluteUrl(candidate);
  if (!href) {
    return null;
  }

  const parsed = new URL(href);
  const domain = normalizedHostname(parsed.hostname);
  const protocol = parsed.protocol.toLowerCase();
  const blocked = protocol !== "http:" && protocol !== "https:";

  const knownHosts = collectInternalHosts();
  const isInternal =
    !blocked &&
    (knownHosts.has(domain) ||
      domain.endsWith(".catwa.chat") ||
      (typeof window !== "undefined" && domain === normalizedHostname(window.location.hostname)));

  return {
    href,
    domain,
    isInternal,
    blocked
  };
}

function shouldSkipMatch(input: string, index: number): boolean {
  if (index <= 0) {
    return false;
  }

  const previous = input[index - 1];
  // Avoid converting email addresses to links.
  return previous === "@";
}

export function parseMessageLinks(input: string): ParsedMessageToken[] {
  if (!input) {
    return [{ kind: "text", text: "" }];
  }

  const tokens: ParsedMessageToken[] = [];
  let lastIndex = 0;

  const pattern = new RegExp(CANDIDATE_PATTERN.source, "gi");

  for (const match of input.matchAll(pattern)) {
    const raw = match[0] ?? "";
    const index = match.index ?? -1;

    if (index < 0 || !raw) {
      continue;
    }

    if (shouldSkipMatch(input, index)) {
      continue;
    }

    if (index > lastIndex) {
      tokens.push({ kind: "text", text: input.slice(lastIndex, index) });
    }

    const trimmed = trimCandidate(raw);
    const classification = classifyLink(trimmed);

    if (!classification) {
      tokens.push({ kind: "text", text: raw });
      lastIndex = index + raw.length;
      continue;
    }

    tokens.push({
      kind: "link",
      text: trimmed,
      href: classification.href,
      domain: classification.domain,
      isInternal: classification.isInternal,
      blocked: classification.blocked
    });

    const trailingStart = index + trimmed.length;
    const trailingEnd = index + raw.length;
    if (trailingStart < trailingEnd) {
      tokens.push({ kind: "text", text: input.slice(trailingStart, trailingEnd) });
    }

    lastIndex = index + raw.length;
  }

  if (lastIndex < input.length) {
    tokens.push({ kind: "text", text: input.slice(lastIndex) });
  }

  if (tokens.length === 0) {
    return [{ kind: "text", text: input }];
  }

  return tokens;
}

export function compactPreviewText(input: string, maxLength = 120): string {
  const tokens = parseMessageLinks(summarizeMessagePreview(input));
  const merged = tokens
    .map((token) => {
      if (token.kind === "text") {
        return token.text;
      }
      return token.domain;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();

  if (merged.length <= maxLength) {
    return merged;
  }

  return `${merged.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

export function extractFirstLink(input: string): LinkToken | null {
  const tokens = parseMessageLinks(input);
  for (const token of tokens) {
    if (token.kind === "link" && !token.blocked) {
      return token;
    }
  }
  return null;
}
