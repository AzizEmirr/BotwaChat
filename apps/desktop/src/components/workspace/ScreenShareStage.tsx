import { MonitorUp, StopCircle, Video, VideoOff } from "lucide-react";
import type { LocalVideoTrack } from "livekit-client";
import type { RemoteScreenShare } from "../../store/chatStore";
import { LiveTrackVideo } from "./LiveTrackVideo";

type ScreenShareStageProps = {
  localTrack: LocalVideoTrack | null;
  localSourceLabel: string | null;
  remoteShares: RemoteScreenShare[];
  onStopLocalShare: () => void;
  onChangeLocalShare: () => void;
  resolveParticipantLabel: (userId: string, fallback: string) => string;
};

export function ScreenShareStage({
  localTrack,
  localSourceLabel,
  remoteShares,
  onStopLocalShare,
  onChangeLocalShare,
  resolveParticipantLabel
}: ScreenShareStageProps) {
  if (!localTrack && remoteShares.length === 0) {
    return null;
  }

  return (
    <section className="shrink-0 border-b border-[var(--catwa-border)] bg-[color:color-mix(in_srgb,var(--catwa-panel)_88%,black_12%)] px-4 py-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--catwa-text-main)]">
          <MonitorUp className="h-4 w-4 text-[var(--catwa-accent)]" />
          Ekran Paylaşımları
        </h3>

        {localTrack ? (
          <div className="flex items-center gap-2">
            <button
              className="rounded-md border border-[var(--catwa-border)] bg-slate-800/70 px-2.5 py-1 text-xs text-slate-200 transition hover:border-[var(--catwa-accent-strong)] hover:text-white"
              onClick={onChangeLocalShare}
              type="button"
            >
              Kaynağı Değiştir
            </button>
            <button
              className="inline-flex items-center gap-1 rounded-md border border-rose-500/45 bg-rose-500/18 px-2.5 py-1 text-xs text-rose-100 transition hover:bg-rose-500/28"
              onClick={onStopLocalShare}
              type="button"
            >
              <StopCircle className="h-3.5 w-3.5" />
              Paylaşımı Durdur
            </button>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
        {localTrack ? (
          <article className="overflow-hidden rounded-xl border border-emerald-500/35 bg-slate-900/70 shadow-[0_14px_32px_-28px_rgba(16,185,129,0.6)]">
            <div className="flex items-center justify-between border-b border-emerald-500/20 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold uppercase tracking-wide text-emerald-200">Sen paylaşıyorsun</p>
                <p className="truncate text-xs text-slate-300">{localSourceLabel || "Paylaşılan kaynak"}</p>
              </div>
              <Video className="h-4 w-4 text-emerald-300" />
            </div>
            <div className="aspect-video bg-slate-950/80">
              <LiveTrackVideo className="h-full w-full object-cover" muted track={localTrack} />
            </div>
          </article>
        ) : null}

        {remoteShares.map((share) => {
          const participant = resolveParticipantLabel(share.participantId, share.participantName);
          const sourceLabel = share.source === "camera" ? "Kamera yayını" : "Ekran paylaşımı";
          return (
            <article
              className="overflow-hidden rounded-xl border border-[var(--catwa-border)] bg-slate-900/65 shadow-[0_14px_30px_-28px_rgba(56,189,248,0.5)]"
              key={share.key}
            >
              <div className="flex items-center justify-between border-b border-[var(--catwa-border)] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold uppercase tracking-wide text-cyan-200">{participant}</p>
                  <p className="truncate text-xs text-slate-300">{sourceLabel}</p>
                </div>
                <Video className="h-4 w-4 text-cyan-300" />
              </div>
              <div className="aspect-video bg-slate-950/80">
                <LiveTrackVideo className="h-full w-full object-cover" track={share.track} />
              </div>
            </article>
          );
        })}
      </div>

      {!localTrack && remoteShares.length === 0 ? (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-[var(--catwa-text-muted)]">
          <VideoOff className="h-3.5 w-3.5" />
          Aktif paylaşım bulunmuyor.
        </p>
      ) : null}
    </section>
  );
}
