import { parseMessageContent } from "./messageContent";
import type { DmSpamFilter } from "./uiPreferences";

type DMSpamFilterDecisionInput = {
  filter: DmSpamFilter;
  conversationType: "dm" | "channel";
  isConversationWithFriend: boolean;
  senderId: string;
  currentUserId?: string | null;
};

const SENSITIVE_WORD_PATTERN =
  /\b(nsfw|porn|adult|erotik|mustehcen|ciplak|nude|hentai|onlyfans|sex|seks|escort)\b/;
const AGE_RESTRICTED_PATTERN = /(^|[^0-9])18\+($|[^0-9])/;

const EMOJI_SHORTCUT_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(^|[\s([{<"'])<3(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1❤️" },
  { pattern: /(^|[\s([{<"'])(:-?\))(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1🙂" },
  { pattern: /(^|[\s([{<"'])(:-?\()(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1🙁" },
  { pattern: /(^|[\s([{<"'])(:-?d)(?=$|[\s)\]}>.,!?;:'"])/gi, replacement: "$1😄" },
  { pattern: /(^|[\s([{<"'])(;-?\))(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1😉" },
  { pattern: /(^|[\s([{<"'])(:-?p)(?=$|[\s)\]}>.,!?;:'"])/gi, replacement: "$1😛" },
  { pattern: /(^|[\s([{<"'])(:-?\|)(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1😐" },
  { pattern: /(^|[\s([{<"'])(:-?o)(?=$|[\s)\]}>.,!?;:'"])/gi, replacement: "$1😮" },
  { pattern: /(^|[\s([{<"'])(:'\()(?=$|[\s)\]}>.,!?;:'"])/g, replacement: "$1😢" }
];

function normalizeForSensitiveScan(input: string): string {
  return input
    .toLocaleLowerCase("tr-TR")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "");
}

export function shouldHideMessageByDMSpamFilter({
  filter,
  conversationType,
  isConversationWithFriend,
  senderId,
  currentUserId
}: DMSpamFilterDecisionInput): boolean {
  if (conversationType !== "dm") {
    return false;
  }

  const normalizedCurrentUserId = currentUserId?.trim();
  if (!normalizedCurrentUserId) {
    return false;
  }

  if (senderId === normalizedCurrentUserId) {
    return false;
  }

  if (filter === "off") {
    return false;
  }

  if (filter === "all") {
    return true;
  }

  return !isConversationWithFriend;
}

export function isSensitiveMessageContent(content: string): boolean {
  if (!content.trim()) {
    return false;
  }

  const parsed = parseMessageContent(content);
  const raw = [parsed.text, ...parsed.attachments.map((attachment) => `${attachment.name} ${attachment.url}`)].join(" ");
  const normalized = normalizeForSensitiveScan(raw);

  return SENSITIVE_WORD_PATTERN.test(normalized) || AGE_RESTRICTED_PATTERN.test(normalized);
}

export function convertTextEmojiShortcuts(input: string): string {
  if (!input) {
    return input;
  }

  let output = input;
  for (const item of EMOJI_SHORTCUT_PATTERNS) {
    output = output.replace(item.pattern, item.replacement);
  }
  return output;
}
