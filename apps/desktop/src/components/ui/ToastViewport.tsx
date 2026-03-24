import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect } from "react";
import { useToastStore, type ToastItem } from "../../store/toastStore";

const TONE_MAP: Record<
  ToastItem["type"],
  {
    icon: typeof CheckCircle2;
    className: string;
    iconClassName: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    className: "border-emerald-400/45 bg-emerald-500/15 text-emerald-100",
    iconClassName: "text-emerald-300"
  },
  info: {
    icon: Info,
    className: "border-cyan-400/45 bg-cyan-500/14 text-cyan-100",
    iconClassName: "text-cyan-300"
  },
  warning: {
    icon: AlertTriangle,
    className: "border-amber-400/45 bg-amber-500/14 text-amber-100",
    iconClassName: "text-amber-300"
  },
  error: {
    icon: AlertCircle,
    className: "border-rose-400/45 bg-rose-500/14 text-rose-100",
    iconClassName: "text-rose-300"
  }
};

export function ToastViewport() {
  const toasts = useToastStore((state) => state.toasts);
  const dismissToast = useToastStore((state) => state.dismissToast);
  const removeToast = useToastStore((state) => state.removeToast);

  useEffect(() => {
    const timers = toasts.map((item) =>
      window.setTimeout(() => {
        dismissToast(item.id);
      }, item.durationMs)
    );

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [dismissToast, toasts]);

  useEffect(() => {
    const exitTimers = toasts
      .filter((item) => item.exiting)
      .map((item) =>
        window.setTimeout(() => {
          removeToast(item.id);
        }, 190)
      );

    return () => {
      exitTimers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [removeToast, toasts]);

  if (toasts.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed left-1/2 top-3 z-[120] w-full max-w-[640px] -translate-x-1/2 px-3">
      <div className="flex flex-col items-center gap-2">
        {toasts.map((item) => {
          const tone = TONE_MAP[item.type];
          const Icon = tone.icon;

          return (
            <div
              className={`pointer-events-auto w-full max-w-[560px] rounded-xl border px-3 py-2.5 shadow-2xl backdrop-blur ${
                tone.className
              } ${item.exiting ? "catwa-toast-exit" : "catwa-toast-enter"}`}
              key={item.id}
              role="status"
            >
              <div className="flex items-start gap-2.5">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone.iconClassName}`} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{item.title}</p>
                  {item.description ? <p className="mt-0.5 text-xs opacity-90">{item.description}</p> : null}
                </div>
                <button
                  aria-label="Bildirimi kapat"
                  className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-white/15 bg-slate-900/35 text-white/90 transition hover:bg-slate-900/55"
                  onClick={() => dismissToast(item.id)}
                  type="button"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
