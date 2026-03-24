import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

type VoiceAudioState = {
  participantVolumes: Record<string, number>;
  streamVolume: number;
  setParticipantVolume: (userId: string, volume: number) => void;
  getParticipantVolume: (userId: string) => number;
  setStreamVolume: (volume: number) => void;
};

const STORAGE_KEY = "catwa.voiceAudio";

function clampVolume(value: number): number {
  if (!Number.isFinite(value)) {
    return 100;
  }
  return Math.max(0, Math.min(100, Math.round(value)));
}

export const useVoiceAudioStore = create<VoiceAudioState>()(
  persist(
    (set, get) => ({
      participantVolumes: {},
      streamVolume: 100,

      setParticipantVolume: (userId, volume) => {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
          return;
        }
        const nextVolume = clampVolume(volume);
        set((state) => ({
          participantVolumes: {
            ...state.participantVolumes,
            [normalizedUserId]: nextVolume
          }
        }));
      },

      getParticipantVolume: (userId) => {
        const normalizedUserId = userId.trim();
        if (!normalizedUserId) {
          return 100;
        }
        return clampVolume(get().participantVolumes[normalizedUserId] ?? 100);
      },

      setStreamVolume: (volume) => {
        set({ streamVolume: clampVolume(volume) });
      }
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      version: 1
    }
  )
);
