import * as Dialog from "@radix-ui/react-dialog";
import { Pin, X } from "lucide-react";

type PinnedMessageItem = {
  id: string;
  sender: string;
  content: string;
  createdAt: string;
};

type PinnedMessagesModalProps = {
  open: boolean;
  onClose: () => void;
  items: PinnedMessageItem[];
  rightSidebarOpen?: boolean;
  compactMode?: boolean;
};

function formatTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("tr-TR", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

export function PinnedMessagesModal({
  open,
  onClose,
  items,
  rightSidebarOpen = true,
  compactMode = false
}: PinnedMessagesModalProps) {
  const sidebarOffset = rightSidebarOpen ? (compactMode ? 286 : 320) : 0;
  const rightOffset = sidebarOffset + 18;

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
        <Dialog.Content
          className="fixed top-[92px] z-[101] w-[min(92vw,430px)] overflow-hidden rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_96%,black_4%)] shadow-[0_22px_56px_-34px_rgba(2,6,23,0.9)]"
          style={{ right: `${rightOffset}px` }}
        >
          <div className="flex items-center justify-between border-b border-[var(--catwa-border)] px-4 py-3">
            <Dialog.Title className="inline-flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Pin className="h-4 w-4" />
              Sabitlenenler
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--catwa-border)] bg-slate-900/65 text-slate-300 transition hover:text-slate-100"
                type="button"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-3">
            {items.length === 0 ? (
              <p className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/55 px-3 py-3 text-sm text-slate-400">Bu konuşmada sabitlenen mesaj yok.</p>
            ) : (
              <div className="space-y-2">
                {items.map((item) => (
                  <article className="rounded-xl border border-[var(--catwa-border)] bg-slate-900/55 px-3 py-2.5" key={item.id}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium text-slate-100">{item.sender}</p>
                      <span className="text-[11px] text-slate-500">{formatTime(item.createdAt)}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-300">{item.content || "(boş mesaj)"}</p>
                  </article>
                ))}
              </div>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export type { PinnedMessageItem };
