import { create } from "zustand";

export type ToastType = "success" | "info" | "warning" | "error";

export type ToastInput = {
  type: ToastType;
  title: string;
  description?: string;
  durationMs?: number;
  dedupeKey?: string;
};

export type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  durationMs: number;
  createdAt: number;
  exiting: boolean;
};

type ToastState = {
  toasts: ToastItem[];
  pushToast: (toast: ToastInput) => string;
  dismissToast: (id: string) => void;
  removeToast: (id: string) => void;
  clearToasts: () => void;
};

const recentDedupe = new Map<string, number>();

function trimDedupeMap(now: number): void {
  for (const [key, value] of recentDedupe.entries()) {
    if (now - value > 2400) {
      recentDedupe.delete(key);
    }
  }
}

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  pushToast: (toast) => {
    const now = Date.now();
    const dedupeKey = toast.dedupeKey?.trim();
    trimDedupeMap(now);

    if (dedupeKey) {
      const dedupeWindowMs =
        dedupeKey.startsWith("ws-") || dedupeKey.startsWith("update-check-failed") ? 12000 : 1100;
      const previous = recentDedupe.get(dedupeKey);
      if (previous && now - previous < dedupeWindowMs) {
        const existing = get().toasts.find((item) => item.id === dedupeKey);
        if (existing) {
          return existing.id;
        }
      }
      recentDedupe.set(dedupeKey, now);
    }

    const id = dedupeKey || `${now}-${Math.random().toString(16).slice(2, 9)}`;
    const durationMs = Math.max(1300, toast.durationMs ?? 3400);
    const entry: ToastItem = {
      id,
      type: toast.type,
      title: toast.title,
      description: toast.description,
      durationMs,
      createdAt: now,
      exiting: false
    };

    set((state) => ({
      toasts: [...state.toasts.slice(-3), entry]
    }));
    return id;
  },
  dismissToast: (id) => {
    set((state) => ({
      toasts: state.toasts.map((item) => (item.id === id ? { ...item, exiting: true } : item))
    }));
  },
  removeToast: (id) => {
    set((state) => ({
      toasts: state.toasts.filter((item) => item.id !== id)
    }));
  },
  clearToasts: () => {
    set({ toasts: [] });
  }
}));

export function toast(input: ToastInput): string {
  return useToastStore.getState().pushToast(input);
}

export function toastSuccess(title: string, description?: string, dedupeKey?: string): string {
  return toast({ type: "success", title, description, dedupeKey });
}

export function toastInfo(title: string, description?: string, dedupeKey?: string): string {
  return toast({ type: "info", title, description, dedupeKey });
}

export function toastWarning(title: string, description?: string, dedupeKey?: string): string {
  return toast({ type: "warning", title, description, dedupeKey });
}

export function toastError(title: string, description?: string, dedupeKey?: string): string {
  return toast({ type: "error", title, description, dedupeKey });
}
