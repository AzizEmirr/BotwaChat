import type { AppPreferences } from "./uiPreferences";

export type VoiceVideoPreferences = AppPreferences["voiceVideo"];

const PUSH_TO_TALK_DEFAULT_KEY = "Space";

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, value));
}

export function buildMicrophoneConstraints(preferences: VoiceVideoPreferences): MediaTrackConstraints {
  const constraints: MediaTrackConstraints = {};

  if (preferences.inputDeviceId && preferences.inputDeviceId !== "default") {
    constraints.deviceId = { exact: preferences.inputDeviceId };
  }

  const profile = preferences.voiceProfile;
  const noiseSuppressionEnabled = preferences.noiseSuppression !== "off";
  const echoCancellationEnabled = preferences.echoCancellation;
  const autoGainControlEnabled = profile === "studio" ? false : preferences.autoGainControl;

  constraints.noiseSuppression = profile === "isolation" ? true : noiseSuppressionEnabled;
  constraints.echoCancellation = profile === "isolation" ? true : echoCancellationEnabled;
  constraints.autoGainControl = autoGainControlEnabled;

  const constrained = constraints as MediaTrackConstraints & {
    voiceIsolation?: ConstrainBoolean;
    volume?: ConstrainDouble;
  };

  if (profile === "isolation") {
    constrained.voiceIsolation = true;
  }

  constrained.volume = clamp(preferences.inputVolume, 0, 100) / 100;

  return constraints;
}

export function isPushToTalkHotkey(event: KeyboardEvent): boolean {
  return event.code === PUSH_TO_TALK_DEFAULT_KEY;
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target.closest("[contenteditable='true']")) {
    return true;
  }

  const interactiveTag = target.tagName.toLowerCase();
  if (interactiveTag === "input" || interactiveTag === "textarea" || interactiveTag === "select") {
    return true;
  }

  return target.closest("input, textarea, select, [role='textbox']") !== null;
}
