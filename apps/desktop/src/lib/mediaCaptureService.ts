import {
  Track,
  createLocalVideoTrack,
  LocalAudioTrack,
  LocalVideoTrack,
  type LocalTrack,
  type VideoResolution
} from "livekit-client";
import { listDesktopScreenShareSources } from "./desktopBridge";
import { isTauriDesktop } from "./runtime";

export type ScreenShareTab = "applications" | "entire-screen" | "devices";
export type ScreenShareQuality = "720p" | "1080p";
export type ScreenShareFPS = 15 | 30 | 60;

export type ScreenShareSelection =
  | {
      tab: "applications";
      sourceId?: string;
      label?: string;
    }
  | {
      tab: "entire-screen";
      sourceId?: string;
      monitorId?: string;
      label?: string;
    }
  | {
      tab: "devices";
      deviceId: string;
      label?: string;
    };

export type ScreenShareStartOptions = {
  selection: ScreenShareSelection;
  quality: ScreenShareQuality;
  fps: ScreenShareFPS;
  includeSystemAudio: boolean;
};

export type ScreenShareCaptureResult = {
  tracks: LocalTrack[];
  primaryVideoTrack: LocalVideoTrack;
  sourceKind: "application" | "screen" | "device";
  sourceLabel: string;
};

export type NativeScreenShareSource = {
  id: string;
  label: string;
  description: string;
  thumbnailDataUrl?: string | null;
};

export type NativeScreenShareSources = {
  applications: NativeScreenShareSource[];
  screens: NativeScreenShareSource[];
};

export type CameraDevice = {
  deviceId: string;
  label: string;
};

function resolutionForQuality(quality: ScreenShareQuality): VideoResolution {
  if (quality === "720p") {
    return {
      width: 1280,
      height: 720,
      frameRate: 30
    };
  }

  return {
    width: 1920,
    height: 1080,
    frameRate: 30
  };
}

async function applyTrackFPS(track: LocalVideoTrack, fps: ScreenShareFPS): Promise<void> {
  const mediaTrack = track.mediaStreamTrack;
  if (typeof mediaTrack.applyConstraints !== "function") {
    return;
  }

  try {
    await mediaTrack.applyConstraints({
      frameRate: { ideal: fps, max: fps }
    });
  } catch {
    // Some browser/runtime combinations may reject frame constraints.
  }
}

async function startNativeDesktopCapture(
  sourceId: string,
  quality: ScreenShareQuality,
  fps: ScreenShareFPS,
  includeSystemAudio: boolean
): Promise<{ videoTrack: LocalVideoTrack; audioTracks: LocalTrack[] }> {
  const resolution = resolutionForQuality(quality);
  const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
  if (!mediaDevices?.getUserMedia) {
    throw new Error("Masaüstü ekran yakalama API'si bu ortamda kullanılamıyor.");
  }

  const videoConstraints = {
    mandatory: {
      chromeMediaSource: "desktop",
      chromeMediaSourceId: sourceId,
      minWidth: 640,
      minHeight: 360,
      maxWidth: resolution.width,
      maxHeight: resolution.height,
      maxFrameRate: fps
    }
  } as unknown as MediaTrackConstraints;

  const audioConstraints = includeSystemAudio
    ? ({
        mandatory: {
          chromeMediaSource: "desktop",
          chromeMediaSourceId: sourceId
        }
      } as unknown as MediaTrackConstraints)
    : false;

  const stream = await mediaDevices.getUserMedia({
    audio: audioConstraints,
    video: videoConstraints
  } as MediaStreamConstraints);

  const mediaVideoTrack = stream.getVideoTracks()[0];
  if (!mediaVideoTrack) {
    stream.getTracks().forEach((track) => {
      try {
        track.stop();
      } catch {
        // noop
      }
    });
    throw new Error("Masaüstü kaynağından video izi alınamadı.");
  }

  const localVideoTrack = new LocalVideoTrack(mediaVideoTrack, { frameRate: fps }, true);
  localVideoTrack.source = Track.Source.ScreenShare;
  await applyTrackFPS(localVideoTrack, fps);

  const localAudioTracks: LocalTrack[] = stream.getAudioTracks().map((mediaAudioTrack) => {
    const localAudioTrack = new LocalAudioTrack(mediaAudioTrack, {}, true);
    localAudioTrack.source = Track.Source.ScreenShareAudio;
    return localAudioTrack;
  });

  return {
    videoTrack: localVideoTrack,
    audioTracks: localAudioTracks
  };
}

export async function captureScreenShare(options: ScreenShareStartOptions): Promise<ScreenShareCaptureResult> {
  const { selection, quality, fps } = options;
  const desktopRuntime = isTauriDesktop();

  if (selection.tab === "devices") {
    const cameraTrack = await createLocalVideoTrack({
      deviceId: selection.deviceId ? { exact: selection.deviceId } : undefined,
      frameRate: fps,
      resolution: resolutionForQuality(quality)
    });
    cameraTrack.source = Track.Source.Camera;
    await applyTrackFPS(cameraTrack, fps);

    return {
      tracks: [cameraTrack],
      primaryVideoTrack: cameraTrack,
      sourceKind: "device",
      sourceLabel: selection.label?.trim() || "Kamera"
    };
  }

  if (!desktopRuntime) {
    throw new Error("Ekran paylaşımı yalnızca Catwa Desktop uygulamasında desteklenir.");
  }

  const sourceId = selection.sourceId?.trim();
  if (!sourceId) {
    throw new Error("Masaüstü paylaşımı için bir kaynak seçmelisin.");
  }

  const { videoTrack, audioTracks } = await startNativeDesktopCapture(sourceId, quality, fps, options.includeSystemAudio);
  const sourceLabel = selection.label?.trim() || (selection.tab === "applications" ? "Uygulama" : "Tüm Ekran");

  return {
    tracks: [videoTrack, ...audioTracks],
    primaryVideoTrack: videoTrack,
    sourceKind: selection.tab === "applications" ? "application" : "screen",
    sourceLabel
  };
}

export function stopCapturedTracks(tracks: LocalTrack[]): void {
  for (const track of tracks) {
    try {
      track.stop();
    } catch {
      // noop
    }
  }
}

export function isDisplayCaptureSupported(): boolean {
  return isTauriDesktop();
}

export async function listCameraDevices(): Promise<CameraDevice[]> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.enumerateDevices) {
    return [];
  }

  const devices = await navigator.mediaDevices.enumerateDevices();
  const cameras = devices.filter((device) => device.kind === "videoinput");
  return cameras.map((device, index) => ({
    deviceId: device.deviceId,
    label: device.label?.trim() || `Kamera ${index + 1}`
  }));
}

export async function listNativeScreenShareSources(): Promise<NativeScreenShareSources> {
  if (!isTauriDesktop()) {
    return { applications: [], screens: [] };
  }

  const payload = await listDesktopScreenShareSources();
  return {
    applications: Array.isArray(payload?.applications) ? payload.applications : [],
    screens: Array.isArray(payload?.screens) ? payload.screens : []
  };
}

export function mapScreenShareError(error: unknown): string {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    if (name.includes("notallowed")) {
      return "Ekran paylaşım izni verilmedi.";
    }
    if (name.includes("notfound")) {
      return "Paylaşılabilecek bir kaynak bulunamadı.";
    }
    if (name.includes("overconstrained")) {
      return "Seçilen kalite veya FPS bu cihazda desteklenmiyor.";
    }
    if (name.includes("abort")) {
      return "Ekran paylaşımı başlatılırken işlem iptal edildi.";
    }
    if (error.message.trim()) {
      return error.message;
    }
  }

  return "Ekran paylaşımı başlatılamadı.";
}
