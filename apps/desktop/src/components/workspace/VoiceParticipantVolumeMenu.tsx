import * as RadixContextMenu from "@radix-ui/react-context-menu";
import { MicOff, Volume2, VolumeX } from "lucide-react";
import type { ReactNode } from "react";
import { resolveAvatarURL } from "../../lib/avatar";
import { formatVoiceParticipantState } from "../../lib/voice";
import type { VoiceMember } from "../../types/chat";
import { avatarTone, displayInitials } from "./ui";

type VoiceParticipantVolumeMenuProps = {
  participant: VoiceMember;
  volume: number;
  onVolumeChange: (volume: number) => void;
  children: ReactNode;
  disabled?: boolean;
};

export function VoiceParticipantVolumeMenu({
  participant,
  volume,
  onVolumeChange,
  children,
  disabled = false
}: VoiceParticipantVolumeMenuProps) {
  if (disabled) {
    return <>{children}</>;
  }

  const avatarSrc = resolveAvatarURL(participant.avatarPath);
  const stateLabel = formatVoiceParticipantState(participant);

  return (
    <RadixContextMenu.Root modal={false}>
      <RadixContextMenu.Trigger asChild>{children}</RadixContextMenu.Trigger>

      <RadixContextMenu.Portal>
        <RadixContextMenu.Content
          className="catwa-context-enter z-[132] w-[min(92vw,296px)] rounded-xl border border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_94%,black_6%)] p-3 shadow-2xl backdrop-blur"
          collisionPadding={12}
          style={{ marginTop: 10 }}
        >
          <div className="flex items-center gap-3">
            <div
              className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border text-sm font-semibold text-white ${
                participant.speaking ? "border-emerald-400 shadow-[0_0_0_3px_rgba(74,222,128,0.18)]" : "border-slate-700"
              }`}
              style={{ backgroundColor: avatarTone(participant.userId || participant.username) }}
            >
              {avatarSrc ? (
                <img alt={`${participant.displayName} avatar`} className="h-full w-full rounded-[inherit] object-cover" src={avatarSrc} />
              ) : (
                displayInitials(participant.displayName, participant.username)
              )}
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-slate-100">{participant.displayName}</p>
              <p className="truncate text-xs text-slate-400">@{participant.username}</p>
              <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-300">
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${
                    participant.speaking ? "bg-emerald-500/15 text-emerald-200" : "bg-slate-800/85 text-slate-300"
                  }`}
                >
                  <Volume2 className="h-3 w-3" />
                  {stateLabel}
                </span>
                {participant.muted ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 px-2 py-0.5 text-rose-200">
                    <MicOff className="h-3 w-3" />
                    Mikrofon kapalı
                  </span>
                ) : null}
                {participant.deafened ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-amber-200">
                    <VolumeX className="h-3 w-3" />
                    Ses kapalı
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-slate-700/60 bg-slate-950/35 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-slate-200">Kullanıcı Ses Seviyesi</span>
              <span className="text-xs text-slate-400">%{volume}</span>
            </div>
            <input
              aria-label={`${participant.displayName} ses seviyesi`}
              className="w-full accent-[var(--catwa-accent)]"
              max={100}
              min={0}
              onChange={(event) => onVolumeChange(Number(event.target.value))}
              onPointerDown={(event) => event.stopPropagation()}
              type="range"
              value={volume}
            />
          </div>

          <p className="mt-2 text-[11px] text-slate-400">Bu ayar yalnızca senin duyduğun sesi etkiler.</p>
        </RadixContextMenu.Content>
      </RadixContextMenu.Portal>
    </RadixContextMenu.Root>
  );
}
