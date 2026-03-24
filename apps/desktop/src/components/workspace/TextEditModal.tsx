import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useState } from "react";

type TextEditModalProps = {
  open: boolean;
  title: string;
  description?: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  clearLabel?: string;
  cancelLabel?: string;
  maxLength?: number;
  onClose: () => void;
  onSubmit: (value: string) => void | Promise<void>;
  onClear?: () => void | Promise<void>;
};

export function TextEditModal({
  open,
  title,
  description,
  label,
  placeholder,
  initialValue = "",
  submitLabel = "Kaydet",
  clearLabel = "Temizle",
  cancelLabel = "Vazgeç",
  maxLength = 120,
  onClose,
  onSubmit,
  onClear
}: TextEditModalProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) {
      setValue(initialValue);
    }
  }, [initialValue, open]);

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
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_92%,black_8%)] p-4 shadow-2xl">
          <Dialog.Title className="text-base font-semibold text-[var(--catwa-text-main)]">{title}</Dialog.Title>
          {description ? <Dialog.Description className="mt-1 text-sm text-[var(--catwa-text-soft)]">{description}</Dialog.Description> : null}

          <label className="mt-4 block text-sm">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">{label}</span>
            <input
              className="w-full rounded-md border border-[var(--catwa-border)] bg-slate-950/65 px-3 py-2 text-sm text-[var(--catwa-text-main)] outline-none transition focus:border-[var(--catwa-accent-strong)]"
              maxLength={maxLength}
              onChange={(event) => setValue(event.target.value)}
              placeholder={placeholder}
              value={value}
            />
          </label>

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              className="rounded-md border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
              onClick={() => {
                if (onClear) {
                  void onClear();
                }
              }}
              type="button"
            >
              {clearLabel}
            </button>
            <div className="flex items-center gap-2">
              <button
                className="rounded-md border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
                onClick={onClose}
                type="button"
              >
                {cancelLabel}
              </button>
              <button
                className="rounded-md border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)] px-3 py-1.5 text-sm font-medium text-[var(--catwa-text-main)] transition hover:border-[var(--catwa-accent)]"
                onClick={() => {
                  void onSubmit(value);
                }}
                type="button"
              >
                {submitLabel}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

