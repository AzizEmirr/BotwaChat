import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, ExternalLink, ShieldAlert } from "lucide-react";

type ExternalLinkWarningModalProps = {
  open: boolean;
  href: string;
  domain: string;
  trustForDomain: boolean;
  onTrustForDomainChange: (value: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function ExternalLinkWarningModal({
  open,
  href,
  domain,
  trustForDomain,
  onTrustForDomainChange,
  onClose,
  onConfirm
}: ExternalLinkWarningModalProps) {
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
        <Dialog.Overlay className="fixed inset-0 z-[140] bg-slate-950/78 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[141] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_92%,black_8%)] p-5 shadow-2xl focus:outline-none">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-500/40 bg-amber-500/15 text-amber-200">
              <AlertTriangle className="h-4.5 w-4.5" />
            </span>
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-base font-semibold text-slate-100">Harici bağlantıya gidiyorsun</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-slate-300">
                Bu bağlantı Catwa dışındaki bir siteye açılacak. Yalnızca güvendiğin bağlantıları aç.
              </Dialog.Description>
            </div>
          </div>

          <div className="mt-4 space-y-2 rounded-lg border border-slate-800/80 bg-slate-950/45 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">Açılacak adres</p>
            <p className="break-all text-sm text-slate-200">{href}</p>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldAlert className="h-3.5 w-3.5" />
              Domain: <span className="font-medium text-slate-200">{domain}</span>
            </div>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-2 rounded-md border border-slate-800/75 bg-slate-900/55 px-3 py-2 text-xs text-slate-300 transition hover:border-slate-600">
            <input
              checked={trustForDomain}
              className="mt-0.5 h-4 w-4 rounded border-slate-600 bg-slate-900 text-[var(--catwa-accent)] focus:ring-[var(--catwa-accent-ring)]"
              onChange={(event) => onTrustForDomainChange(event.target.checked)}
              type="checkbox"
            />
            <span>Bu domain için bir daha uyarma</span>
          </label>

          <div className="mt-5 flex items-center justify-end gap-2">
            <button
              className="rounded-md border border-slate-700/80 bg-slate-800/75 px-3 py-1.5 text-sm text-slate-200 transition hover:border-slate-500 hover:text-slate-100"
              onClick={onClose}
              type="button"
            >
              İptal
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-[var(--catwa-accent-strong)] bg-[var(--catwa-accent-soft)] px-3 py-1.5 text-sm font-medium text-slate-100 transition hover:bg-[var(--catwa-accent-strong)]"
              onClick={onConfirm}
              type="button"
            >
              <ExternalLink className="h-4 w-4" />
              Bağlantıyı Aç
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
