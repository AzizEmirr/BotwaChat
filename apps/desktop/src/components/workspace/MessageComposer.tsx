import { Paperclip, Plus, Smile, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";
import { toastInfo } from "../../store/toastStore";

type ReplyPreview = {
  sender: string;
  content: string;
};

type MessageComposerProps = {
  enabled: boolean;
  sending: boolean;
  draft: string;
  onDraftChange: (value: string) => void;
  onSubmit: () => Promise<boolean>;
  onSubmitWithFiles?: (files: File[]) => Promise<boolean>;
  onTypingStart: () => void;
  onTypingStop: () => void;
  error: string | null;
  replyPreview?: ReplyPreview | null;
  onCancelReply?: () => void;
};

const MAX_ATTACHMENTS = 10;

function getFileKey(file: File): string {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

export function MessageComposer({
  enabled,
  sending,
  draft,
  onDraftChange,
  onSubmit,
  onSubmitWithFiles,
  onTypingStart,
  onTypingStop,
  error,
  replyPreview,
  onCancelReply
}: MessageComposerProps) {
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const addButtonRef = useRef<HTMLButtonElement | null>(null);
  const addMenuRef = useRef<HTMLDivElement | null>(null);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const canSend = enabled && !sending && (draft.trim().length > 0 || queuedFiles.length > 0);

  useEffect(() => {
    const element = textAreaRef.current;
    if (!element) {
      return;
    }
    element.style.height = "0px";
    element.style.height = `${Math.min(element.scrollHeight, 156)}px`;
  }, [draft]);

  useEffect(() => {
    if (!addMenuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (addMenuRef.current?.contains(target) || addButtonRef.current?.contains(target)) {
        return;
      }
      setAddMenuOpen(false);
    };

    window.addEventListener("mousedown", handlePointerDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
    };
  }, [addMenuOpen]);

  useEffect(() => {
    if (!enabled) {
      setAddMenuOpen(false);
    }
  }, [enabled]);

  const appendFiles = (incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (list.length === 0) {
      return;
    }

    setQueuedFiles((current) => {
      const existingKeys = new Set(current.map(getFileKey));
      const next = [...current];
      for (const file of list) {
        const key = getFileKey(file);
        if (existingKeys.has(key)) {
          continue;
        }
        if (next.length >= MAX_ATTACHMENTS) {
          break;
        }
        next.push(file);
        existingKeys.add(key);
      }
      return next;
    });
  };

  const clearFiles = () => {
    setQueuedFiles([]);
    setAddMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canSend) {
      return;
    }

    const success = queuedFiles.length > 0 && onSubmitWithFiles ? await onSubmitWithFiles(queuedFiles) : await onSubmit();

    if (success) {
      clearFiles();
    }
  };

  const removeQueuedFile = (targetKey: string) => {
    setQueuedFiles((current) => current.filter((file) => getFileKey(file) !== targetKey));
  };

  return (
    <footer className="cw-message-composer relative shrink-0 border-t border-[var(--catwa-border)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--catwa-panel)_70%,black_30%)_0%,color-mix(in_srgb,var(--catwa-panel)_76%,black_24%)_100%)] px-4 pb-4 pt-3">
      {dragActive && enabled ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-lg border-2 border-dashed border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-softest)] backdrop-blur">
          <p className="rounded-md border border-[var(--catwa-accent-strong)] bg-slate-900/80 px-4 py-2 text-sm font-medium text-slate-100">
            Dosyaları bırak, mesaja eklensin
          </p>
        </div>
      ) : null}

      {error ? <p className="mb-2 rounded-md border border-rose-800/70 bg-rose-950/40 px-3 py-2 text-xs text-rose-200">{error}</p> : null}

      {replyPreview ? (
        <div
          className="mb-2 flex select-none items-start justify-between gap-2 rounded-md border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-100"
          onCopy={(event) => {
            event.preventDefault();
          }}
        >
          <div className="min-w-0">
            <p className="font-medium">Yanıtlanıyor: {replyPreview.sender}</p>
            <p className="truncate text-cyan-200/80">{replyPreview.content}</p>
          </div>
          <button
            className="rounded border border-cyan-500/35 px-2 py-1 text-[11px] text-cyan-100 transition hover:bg-cyan-500/20"
            onClick={onCancelReply}
            type="button"
          >
            Vazgeç
          </button>
        </div>
      ) : null}

      {queuedFiles.length > 0 ? (
        <div className="mb-2 rounded-md border border-[var(--catwa-border)] bg-slate-900/75 p-2">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs text-[var(--catwa-text-main)]">{queuedFiles.length} dosya eklendi</p>
            <button
              className="rounded border border-slate-700/80 px-2 py-0.5 text-[11px] text-slate-300 transition hover:border-slate-500 hover:text-slate-100"
              onClick={clearFiles}
              type="button"
            >
              Tümünü kaldır
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {queuedFiles.map((file) => {
              const key = getFileKey(file);
              return (
                <div
                  className="inline-flex max-w-[300px] items-center gap-2 rounded-md border border-slate-700/80 bg-slate-800/70 px-2 py-1.5 text-xs text-slate-200"
                  key={key}
                  title={file.name}
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 text-slate-500">{Math.max(1, Math.round(file.size / 1024))} KB</span>
                  <button
                    className="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-700/80 text-slate-300 transition hover:border-rose-500/50 hover:text-rose-200"
                    onClick={() => removeQueuedFile(key)}
                    type="button"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <form
        className="rounded-2xl border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel-alt)_84%,black_16%)] p-2 shadow-[0_16px_36px_-26px_rgba(2,6,23,0.8)]"
        onDragEnter={(event) => {
          if (!enabled) {
            return;
          }
          event.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!enabled) {
            return;
          }
          event.preventDefault();
          const nextTarget = event.relatedTarget as Node | null;
          if (!nextTarget || !event.currentTarget.contains(nextTarget)) {
            setDragActive(false);
          }
        }}
        onDragOver={(event) => {
          if (!enabled) {
            return;
          }
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          if (!dragActive) {
            setDragActive(true);
          }
        }}
        onDrop={(event) => {
          if (!enabled) {
            return;
          }
          event.preventDefault();
          setDragActive(false);
          setAddMenuOpen(false);
          const dropped = event.dataTransfer.files;
          appendFiles(dropped);
          if (dropped.length > 0) {
            toastInfo("Dosya eklendi", `${Math.min(dropped.length, MAX_ATTACHMENTS)} dosya kuyruğa alındı.`);
          }
        }}
        onSubmit={handleSubmit}
      >
        <div className="flex items-end gap-2">
          <div className="relative shrink-0">
            <button
              className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--catwa-border-soft)] bg-slate-800/85 text-[var(--catwa-text-muted)] transition hover:border-[var(--catwa-accent-strong)] hover:bg-slate-700/80 hover:text-[var(--catwa-text-main)] disabled:opacity-40"
              disabled={!enabled}
              onClick={() => {
                if (!enabled) {
                  return;
                }
                setAddMenuOpen((current) => !current);
              }}
              ref={addButtonRef}
              title="Ekle"
              type="button"
            >
              <Plus className="h-5 w-5" />
              {queuedFiles.length > 0 ? (
                <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--catwa-accent)] px-1 text-[10px] font-semibold text-slate-950">
                  {queuedFiles.length}
                </span>
              ) : null}
            </button>

            {addMenuOpen ? (
              <div
                className="absolute bottom-[calc(100%+8px)] left-0 z-30 min-w-[188px] rounded-xl border border-[var(--catwa-border-soft)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-1 shadow-2xl"
                ref={addMenuRef}
              >
                <button
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[var(--catwa-text-main)] transition hover:bg-slate-700/60"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setAddMenuOpen(false);
                  }}
                  type="button"
                >
                  <Paperclip className="h-4 w-4 text-slate-400" />
                  Bir Dosya Yükle
                </button>
              </div>
            ) : null}
          </div>

          <input
            className="hidden"
            multiple
            onChange={(event) => {
              if (!event.target.files) {
                return;
              }
              appendFiles(event.target.files);
              setAddMenuOpen(false);
            }}
            ref={fileInputRef}
            type="file"
          />

          <textarea
            className="cw-message-composer__textarea max-h-40 min-h-[40px] w-full resize-none rounded-xl border border-transparent bg-slate-900/70 px-3 py-2 text-[14px] leading-6 text-slate-100 outline-none placeholder:text-slate-500 transition focus:border-[var(--catwa-accent-strong)] focus:bg-slate-900"
            disabled={!enabled}
            onBlur={onTypingStop}
            onChange={(event) => {
              const value = event.target.value;
              onDraftChange(value);
              if (value.trim()) {
                onTypingStart();
              } else {
                onTypingStop();
              }
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                if (!canSend) {
                  return;
                }
                void (async () => {
                  const success = queuedFiles.length > 0 && onSubmitWithFiles ? await onSubmitWithFiles(queuedFiles) : await onSubmit();
                  if (success) {
                    clearFiles();
                  }
                })();
              }
            }}
            placeholder={enabled ? "Mesaj yaz..." : "Sohbet seçmeden mesaj gönderemezsin."}
            ref={textAreaRef}
            rows={1}
            value={draft}
          />

          <button
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--catwa-border-soft)] bg-slate-800/85 text-[var(--catwa-text-muted)] transition hover:border-[var(--catwa-accent-strong)] hover:bg-slate-700/80 hover:text-[var(--catwa-text-main)] disabled:opacity-40"
            disabled={!enabled}
            onClick={() => onDraftChange(`${draft}🙂`)}
            title="Emoji ekle"
            type="button"
          >
            <Smile className="h-4 w-4" />
          </button>
        </div>
      </form>
    </footer>
  );
}
