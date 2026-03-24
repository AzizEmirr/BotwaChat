type ParsedAttachment = {
  id: string;
  name: string;
  url: string;
  isImage: boolean;
};

type ParsedReply = {
  senderUsername: string;
  preview: string;
};

type ParsedMessageContent = {
  text: string;
  attachments: ParsedAttachment[];
  reply: ParsedReply | null;
};

const ATTACHMENT_BLOCK_REGEX = /(?:^|\n)(?:📎)\s+([^\n]+)\n(https?:\/\/[^\s]+)(?=\n{2,}|$)/g;
const LEGACY_ATTACHMENT_BLOCK_REGEX = /(?:^|\n)([^\n]+)\n(https?:\/\/[^\s]*\/uploads\/[^\s]+)(?=\n{2,}|$)/gi;
const STANDALONE_UPLOAD_URL_REGEX = /(?:^|\n)(https?:\/\/[^\s]*\/uploads\/[^\s]+)(?=\n|$)/gi;
const IMAGE_EXTENSION_REGEX = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;
const FILE_NAME_HINT_REGEX = /^[^\n/]{1,180}\.[a-z0-9]{2,10}$/i;
const REPLY_PREFIX_SYMBOL = "\u21AA";
const REPLY_PREFIX_REGEX = /^(?:\u21AA|↪)\s*@([^\s:]{1,64})\s*:\s*([^\n]*)(?:\n([\s\S]*))?$/;
const MAX_REPLY_PREVIEW_LENGTH = 160;

function normalizeReplySnippet(text: string): string {
  return text
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function extractReplyPrefix(input: string): { reply: ParsedReply | null; body: string } {
  const normalizedInput = input.replace(/\r\n/g, "\n");
  const match = REPLY_PREFIX_REGEX.exec(normalizedInput);
  if (!match) {
    return { reply: null, body: normalizedInput };
  }

  const senderUsername = (match[1] ?? "").trim().replace(/^@+/, "");
  const preview = normalizeReplySnippet(match[2] ?? "");
  const body = (match[3] ?? "").trimStart();

  if (!senderUsername || !preview) {
    return { reply: null, body: normalizedInput };
  }

  return {
    reply: {
      senderUsername,
      preview
    },
    body
  };
}

function normalizeWhitespace(text: string): string {
  return text
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function normalizeUrl(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }

  try {
    const parsed = new URL(value);
    if (!/^https?:$/i.test(parsed.protocol)) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
}

function isImageAttachment(name: string, url: string): boolean {
  return IMAGE_EXTENSION_REGEX.test(name) || IMAGE_EXTENSION_REGEX.test(url);
}

function normalizeFileName(input: string): string | null {
  const value = input.trim();
  if (!value) {
    return null;
  }
  return value.replace(/^(?:📎)\s*/u, "").replace(/\s+/g, " ");
}

function fileNameFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1] ?? "";
    if (!lastSegment) {
      return "Dosya";
    }
    return decodeURIComponent(lastSegment);
  } catch {
    return "Dosya";
  }
}

function rangeOverlaps(ranges: Array<{ start: number; end: number }>, start: number, end: number): boolean {
  return ranges.some((range) => start < range.end && end > range.start);
}

export function parseMessageContent(input: string): ParsedMessageContent {
  if (!input.trim()) {
    return { text: "", attachments: [], reply: null };
  }

  const { reply, body } = extractReplyPrefix(input);
  const attachments: ParsedAttachment[] = [];
  const matchedRanges: Array<{ start: number; end: number }> = [];
  let matchIndex = 0;

  const registerAttachment = (rawName: string, rawUrl: string, start: number, end: number) => {
    const url = normalizeUrl(rawUrl);
    const name = normalizeFileName(rawName);
    if (!url || !name || rangeOverlaps(matchedRanges, start, end)) {
      return;
    }

    matchedRanges.push({ start, end });
    attachments.push({
      id: `${matchIndex}-${name}-${url}`,
      name,
      url,
      isImage: isImageAttachment(name, url)
    });
    matchIndex += 1;
  };

  for (const match of body.matchAll(ATTACHMENT_BLOCK_REGEX)) {
    const rawName = match[1] ?? "";
    const rawUrl = match[2] ?? "";
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }
    registerAttachment(rawName, rawUrl, index, index + match[0].length);
  }

  // Legacy payload format support: "<filename>\n<upload-url>" blocks without the 📎 prefix.
  for (const match of body.matchAll(LEGACY_ATTACHMENT_BLOCK_REGEX)) {
    const rawName = (match[1] ?? "").trim();
    const rawUrl = match[2] ?? "";
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }
    if (!FILE_NAME_HINT_REGEX.test(rawName)) {
      continue;
    }
    registerAttachment(rawName, rawUrl, index, index + match[0].length);
  }

  // Graceful fallback for historical payloads that only stored an upload URL.
  for (const match of body.matchAll(STANDALONE_UPLOAD_URL_REGEX)) {
    const rawUrl = match[1] ?? "";
    const index = match.index ?? -1;
    if (index < 0) {
      continue;
    }
    registerAttachment(fileNameFromUrl(rawUrl), rawUrl, index, index + match[0].length);
  }

  if (attachments.length === 0) {
    return { text: normalizeWhitespace(body), attachments: [], reply };
  }

  matchedRanges.sort((a, b) => a.start - b.start);

  let cursor = 0;
  const textParts: string[] = [];
  for (const range of matchedRanges) {
    if (range.start > cursor) {
      textParts.push(body.slice(cursor, range.start));
    }
    cursor = range.end;
  }
  if (cursor < body.length) {
    textParts.push(body.slice(cursor));
  }

  const text = normalizeWhitespace(textParts.join("\n"));
  return { text, attachments, reply };
}

export function buildReplyPrefixedMessage(senderUsername: string, replyContent: string, messageContent: string): string {
  const sender = senderUsername.trim().replace(/^@+/, "");
  const replyPreview = normalizeReplySnippet(replyContent).slice(0, MAX_REPLY_PREVIEW_LENGTH);
  const normalizedBody = messageContent.trim();

  if (!sender || !replyPreview) {
    return normalizedBody;
  }

  if (!normalizedBody) {
    return `${REPLY_PREFIX_SYMBOL} @${sender}: ${replyPreview}`;
  }

  return `${REPLY_PREFIX_SYMBOL} @${sender}: ${replyPreview}\n${normalizedBody}`;
}

export function summarizeMessagePreview(input: string): string {
  const parsed = parseMessageContent(input);
  if (parsed.attachments.length === 0) {
    return parsed.text;
  }

  const attachmentSummary = parsed.attachments
    .map((item) => (item.isImage ? `🖼 ${item.name}` : `📎 ${item.name}`))
    .join(" • ");

  if (!parsed.text) {
    return attachmentSummary;
  }

  return `${parsed.text} • ${attachmentSummary}`;
}

