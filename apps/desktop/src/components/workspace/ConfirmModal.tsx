import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle } from "lucide-react";

type ConfirmModalProps = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel = "Onayla",
  cancelLabel = "Vazgeç",
  onConfirm,
  onClose
}: ConfirmModalProps) {
  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[91] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-2xl">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-full border border-amber-500/45 bg-amber-500/15 text-amber-300">
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-base font-semibold text-slate-100">{title}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-400">{description}</Dialog.Description>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="rounded-md border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
              onClick={onClose}
              type="button"
            >
              {cancelLabel}
            </button>
            <button
              className="rounded-md border border-rose-500/50 bg-rose-500/20 px-3 py-1.5 text-sm font-medium text-rose-100 transition hover:bg-rose-500/30"
              onClick={() => {
                void onConfirm();
              }}
              type="button"
            >
              {confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
