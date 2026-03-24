import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type DMMuteDuration = "15m" | "1h" | "8h" | "24h" | "forever";

type MutedDMEntry = {
  duration: DMMuteDuration;
  mutedAt: string;
  mutedUntil?: string;
};

type DMContextState = {
  notesByUser: Record<string, string>;
  nicknamesByUser: Record<string, string>;
  ignoredUsers: Record<string, true>;
  closedDMs: Record<string, string>;
  mutedDMs: Record<string, MutedDMEntry>;
  readMarkersByConversation: Record<string, string>;
  setUserNote: (userId: string, note: string) => void;
  setFriendNickname: (userId: string, nickname: string) => void;
  setIgnoredUser: (userId: string, ignored: boolean) => void;
  closeDM: (conversationId: string, closedAt?: string) => void;
  reopenDM: (conversationId: string) => void;
  setDMMuted: (conversationId: string, duration: DMMuteDuration) => void;
  clearDMMuted: (conversationId: string) => void;
  isDMMuted: (conversationId: string, now?: number) => boolean;
  shouldHideDM: (conversationId: string, lastMessageAt?: string) => boolean;
  markConversationRead: (conversationId: string, marker: string) => void;
};

const STORAGE_KEY = "catwa.dmContext";

const DURATION_MS: Record<Exclude<DMMuteDuration, "forever">, number> = {
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "8h": 8 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000
};

function normalizeKey(value: string): string {
  return value.trim();
}

function parseTime(value?: string): number {
  if (!value) {
    return 0;
  }
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
}

export function dmMuteDurationLabel(duration: DMMuteDuration): string {
  switch (duration) {
    case "15m":
      return "15 dakika";
    case "1h":
      return "1 saat";
    case "8h":
      return "8 saat";
    case "24h":
      return "24 saat";
    case "forever":
      return "Süresiz";
    default:
      return "Bilinmiyor";
  }
}

export const useDMContextStore = create<DMContextState>()(
  persist(
    (set, get) => ({
      notesByUser: {},
      nicknamesByUser: {},
      ignoredUsers: {},
      closedDMs: {},
      mutedDMs: {},
      readMarkersByConversation: {},

      setUserNote: (userId, note) => {
        const normalizedUserId = normalizeKey(userId);
        if (!normalizedUserId) {
          return;
        }
        const normalizedNote = note.trim();
        set((state) => {
          const nextNotes = { ...state.notesByUser };
          if (!normalizedNote) {
            delete nextNotes[normalizedUserId];
          } else {
            nextNotes[normalizedUserId] = normalizedNote;
          }
          return { notesByUser: nextNotes };
        });
      },

      setFriendNickname: (userId, nickname) => {
        const normalizedUserId = normalizeKey(userId);
        if (!normalizedUserId) {
          return;
        }
        const normalizedNickname = nickname.trim();
        set((state) => {
          const nextNicknames = { ...state.nicknamesByUser };
          if (!normalizedNickname) {
            delete nextNicknames[normalizedUserId];
          } else {
            nextNicknames[normalizedUserId] = normalizedNickname;
          }
          return { nicknamesByUser: nextNicknames };
        });
      },

      setIgnoredUser: (userId, ignored) => {
        const normalizedUserId = normalizeKey(userId);
        if (!normalizedUserId) {
          return;
        }
        set((state) => {
          const nextIgnored = { ...state.ignoredUsers };
          if (ignored) {
            nextIgnored[normalizedUserId] = true;
          } else {
            delete nextIgnored[normalizedUserId];
          }
          return { ignoredUsers: nextIgnored };
        });
      },

      closeDM: (conversationId, closedAt) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return;
        }
        const timestamp = closedAt?.trim() || new Date().toISOString();
        set((state) => ({
          closedDMs: {
            ...state.closedDMs,
            [normalizedConversationId]: timestamp
          }
        }));
      },

      reopenDM: (conversationId) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return;
        }
        set((state) => {
          if (!state.closedDMs[normalizedConversationId]) {
            return state;
          }
          const nextClosed = { ...state.closedDMs };
          delete nextClosed[normalizedConversationId];
          return { closedDMs: nextClosed };
        });
      },

      setDMMuted: (conversationId, duration) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return;
        }
        const mutedAt = new Date();
        const mutedUntil =
          duration === "forever" ? undefined : new Date(mutedAt.getTime() + DURATION_MS[duration]).toISOString();

        set((state) => ({
          mutedDMs: {
            ...state.mutedDMs,
            [normalizedConversationId]: {
              duration,
              mutedAt: mutedAt.toISOString(),
              mutedUntil
            }
          }
        }));
      },

      clearDMMuted: (conversationId) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return;
        }
        set((state) => {
          if (!state.mutedDMs[normalizedConversationId]) {
            return state;
          }
          const nextMuted = { ...state.mutedDMs };
          delete nextMuted[normalizedConversationId];
          return { mutedDMs: nextMuted };
        });
      },

      isDMMuted: (conversationId, now = Date.now()) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return false;
        }
        const entry = get().mutedDMs[normalizedConversationId];
        if (!entry) {
          return false;
        }

        if (!entry.mutedUntil) {
          return true;
        }

        const expiresAt = parseTime(entry.mutedUntil);
        if (expiresAt <= 0) {
          return true;
        }

        if (expiresAt <= now) {
          get().clearDMMuted(normalizedConversationId);
          return false;
        }
        return true;
      },

      shouldHideDM: (conversationId, lastMessageAt) => {
        const normalizedConversationId = normalizeKey(conversationId);
        if (!normalizedConversationId) {
          return false;
        }
        const closedAtRaw = get().closedDMs[normalizedConversationId];
        if (!closedAtRaw) {
          return false;
        }

        const closedAt = parseTime(closedAtRaw);
        if (closedAt <= 0) {
          return false;
        }

        const messageAt = parseTime(lastMessageAt);
        if (messageAt > closedAt) {
          get().reopenDM(normalizedConversationId);
          return false;
        }

        return true;
      },

      markConversationRead: (conversationId, marker) => {
        const normalizedConversationId = normalizeKey(conversationId);
        const normalizedMarker = marker.trim();
        if (!normalizedConversationId || !normalizedMarker) {
          return;
        }
        set((state) => ({
          readMarkersByConversation: {
            ...state.readMarkersByConversation,
            [normalizedConversationId]: normalizedMarker
          }
        }));
      }
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => window.localStorage),
      partialize: (state) => ({
        notesByUser: state.notesByUser,
        nicknamesByUser: state.nicknamesByUser,
        ignoredUsers: state.ignoredUsers,
        closedDMs: state.closedDMs,
        mutedDMs: state.mutedDMs,
        readMarkersByConversation: state.readMarkersByConversation
      })
    }
  )
);

