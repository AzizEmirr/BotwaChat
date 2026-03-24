import { useEffect, useRef } from "react";
import type { LocalVideoTrack, RemoteVideoTrack } from "livekit-client";

type LiveTrackVideoProps = {
  track: LocalVideoTrack | RemoteVideoTrack;
  muted?: boolean;
  className?: string;
};

export function LiveTrackVideo({ track, muted = false, className }: LiveTrackVideoProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) {
      return;
    }

    element.muted = muted;
    element.playsInline = true;
    element.autoplay = true;

    track.attach(element);
    const playPromise = element.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {
        // Autoplay bazı ortamlarda engellenebilir.
      });
    }

    return () => {
      track.detach(element);
      element.srcObject = null;
    };
  }, [muted, track]);

  return <video className={className} ref={videoRef} />;
}
