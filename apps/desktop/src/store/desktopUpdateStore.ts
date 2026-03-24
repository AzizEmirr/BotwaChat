import { create } from "zustand";

type DesktopUpdateStore = {
  enabled: boolean;
  checking: boolean;
  downloading: boolean;
  readyVersion: string | null;
  requestNonce: number;
  setEnabled: (enabled: boolean) => void;
  setChecking: (checking: boolean) => void;
  setDownloading: (downloading: boolean) => void;
  setReadyVersion: (version: string | null) => void;
  requestManualCheck: () => void;
};

export const useDesktopUpdateStore = create<DesktopUpdateStore>((set) => ({
  enabled: false,
  checking: false,
  downloading: false,
  readyVersion: null,
  requestNonce: 0,
  setEnabled: (enabled) => set({ enabled }),
  setChecking: (checking) => set({ checking }),
  setDownloading: (downloading) => set({ downloading }),
  setReadyVersion: (readyVersion) => set({ readyVersion }),
  requestManualCheck: () => set((state) => ({ requestNonce: state.requestNonce + 1 }))
}));
