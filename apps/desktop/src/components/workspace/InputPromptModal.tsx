import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";

export type InputPromptField = {
  key: string;
  label: string;
  placeholder?: string;
  initialValue?: string;
  type?: "text" | "number";
  maxLength?: number;
};

type InputPromptModalProps = {
  open: boolean;
  title: string;
  description?: string;
  fields: InputPromptField[];
  confirmLabel?: string;
  cancelLabel?: string;
  onClose: () => void;
  onConfirm: (values: Record<string, string>) => void | Promise<void>;
};

export function InputPromptModal({
  open,
  title,
  description,
  fields,
  confirmLabel = "Tamam",
  cancelLabel = "Vazgec",
  onClose,
  onConfirm
}: InputPromptModalProps) {
  const initialValues = useMemo(() => {
    const next: Record<string, string> = {};
    for (const field of fields) {
      next[field.key] = field.initialValue ?? "";
    }
    return next;
  }, [fields]);

  const [values, setValues] = useState<Record<string, string>>(initialValues);

  useEffect(() => {
    if (open) {
      setValues(initialValues);
    }
  }, [initialValues, open]);

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
          {description ? <Dialog.Description className="mt-1 whitespace-pre-line text-sm text-[var(--catwa-text-soft)]">{description}</Dialog.Description> : null}

          <div className="mt-4 space-y-3">
            {fields.map((field) => (
              <label className="block text-sm" key={field.key}>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[var(--catwa-text-muted)]">{field.label}</span>
                <input
                  className="w-full rounded-md border border-[var(--catwa-border)] bg-slate-950/65 px-3 py-2 text-sm text-[var(--catwa-text-main)] outline-none transition focus:border-[var(--catwa-accent-strong)]"
                  inputMode={field.type === "number" ? "numeric" : undefined}
                  maxLength={field.maxLength ?? 120}
                  onChange={(event) =>
                    setValues((previous) => ({
                      ...previous,
                      [field.key]: event.target.value
                    }))
                  }
                  placeholder={field.placeholder}
                  type={field.type ?? "text"}
                  value={values[field.key] ?? ""}
                />
              </label>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
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
                void onConfirm(values);
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
