import { env } from "./env";

export type ReleaseChannel = "stable";
export const RELEASE_CHANNEL_STORAGE_KEY = "catwa.release.channel";

export type ReleaseDownloadLinks = {
  stable: string;
  portable: string;
};

export const RELEASE_CHANNEL_LABELS: Record<ReleaseChannel, string> = {
  stable: "Stable"
};

export function getReleaseChannel(): ReleaseChannel {
  return "stable";
}

export function getReleaseChannelLabel(channel: ReleaseChannel): string {
  return RELEASE_CHANNEL_LABELS[channel];
}

export function getReleaseDownloads(): ReleaseDownloadLinks {
  return env.downloads;
}

export function setReleaseChannel(channel: ReleaseChannel): void {
  void channel;
}

export function getUpdaterRequestHeaders(channel = getReleaseChannel()): HeadersInit {
  return {
    "X-Release-Channel": channel,
    "X-Catwa-Desktop": "true",
    "Cache-Control": "no-cache",
    Pragma: "no-cache"
  };
}
