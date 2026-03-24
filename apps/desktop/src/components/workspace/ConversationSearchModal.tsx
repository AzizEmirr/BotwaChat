import * as Dialog from "@radix-ui/react-dialog";
import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import type { Message } from "../../types/chat";

type ConversationSearchModalProps = {
  open: boolean;
  conversationName: string;
  messages: Message[];
  onClose: () => void;
};

export function ConversationSearchModal({ open, conversationName, messages, onClose }: ConversationSearchModalProps) {
  const [query, setQuery] = useState("");

  const normalizedQuery = query.trim().toLocaleLowerCase("tr-TR");
  const filteredMessages = useMemo(() => {
    if (!normalizedQuery) {
      return messages.slice(-30).reverse();
    }

    return [...messages]
      .reverse()
      .filter((item) => item.content.toLocaleLowerCase("tr-TR").includes(normalizedQuery))
      .slice(0, 80);
  }, [messages, normalizedQuery]);

  return (
    <Dialog.Root
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setQuery("");
          onClose();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[121] w-[calc(100vw-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_93%,black_7%)] p-4 shadow-2xl">
          <Dialog.Title className="text-base font-semibold text-[var(--catwa-text-main)]">{conversationName} içinde ara</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-[var(--catwa-text-soft)]">
            Bu arama, mevcut yüklenmiş mesaj geçmişi içinde çalışır.
          </Dialog.Description>

          <label className="relative mt-4 block">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-500" />
            <input
              autoFocus
              className="w-full rounded-md border border-[var(--catwa-border)] bg-slate-950/60 py-2 pl-9 pr-3 text-sm text-[var(--catwa-text-main)] outline-none transition focus:border-[var(--catwa-accent-strong)]"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Mesajlarda ara..."
              value={query}
            />
          </label>

          <div className="mt-3 max-h-[46vh] overflow-y-auto rounded-md border border-[var(--catwa-border)] bg-slate-950/35">
            {filteredMessages.length === 0 ? (
              <p className="px-3 py-4 text-sm text-[var(--catwa-text-soft)]">Eşleşen mesaj bulunamadı.</p>
            ) : (
              <ul className="divide-y divide-[var(--catwa-border)]">
                {filteredMessages.map((item) => (
                  <li className="px-3 py-2" key={item.id}>
                    <p className="text-[11px] text-slate-500">
                      @{item.senderUsername} • {new Date(item.createdAt).toLocaleString("tr-TR")}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[var(--catwa-text-main)]">{item.content}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="mt-4 flex justify-end">
            <button
              className="rounded-md border border-slate-700/80 bg-slate-800/70 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500"
              onClick={() => {
                setQuery("");
                onClose();
              }}
              type="button"
            >
              Kapat
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
