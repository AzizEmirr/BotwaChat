export const UI_PREFERENCES_STORAGE_KEY = "catwa.uiPreferences.v2";
export const UI_PREFERENCES_EVENT = "catwa:ui-preferences-changed";

export type ThemeMode = "dark" | "graphite" | "night" | "amoled" | "light";
export type ThemePreset =
  | "dawn-light"
  | "graphite-core"
  | "soft-dark"
  | "default-dark"
  | "midnight"
  | "pure-black"
  | "aurora-sky"
  | "sunset-pop"
  | "mint-bloom"
  | "rose-candy"
  | "violet-storm"
  | "forest-wave"
  | "ocean-depth"
  | "ember-glow";
export type UiDensity = "comfortable" | "normal" | "compact";
export type MessageDisplayMode = "default" | "compact";
export type VoiceProfileMode = "isolation" | "studio" | "custom";
export type DmSpamFilter = "all" | "non-friends" | "off";
export type FirstDayOfWeek = "monday" | "sunday";
export type LanguageCode = "tr-TR" | "en-US";

export type AppPreferences = {
  appearance: {
    theme: ThemeMode;
    themePreset: ThemePreset;
    accentColor: string;
    accentSaturation: number;
    accentIntensity: number;
    density: UiDensity;
    iconStyle: "classic" | "filled" | "minimal";
    messageDisplay: MessageDisplayMode;
    messageGroupGap: number;
    chatFontSize: number;
    uiZoom: number;
  };
  accessibility: {
    reducedMotion: boolean;
    highContrast: boolean;
    screenReaderHints: boolean;
    disableAnimatedEmoji: boolean;
  };
  voiceVideo: {
    inputDeviceId: string;
    outputDeviceId: string;
    inputVolume: number;
    outputVolume: number;
    voiceProfile: VoiceProfileMode;
    noiseSuppression: "standard" | "off";
    echoCancellation: boolean;
    pushToTalk: boolean;
    autoGainControl: boolean;
  };
  chat: {
    showLinkMedia: boolean;
    showUploadedMedia: boolean;
    showAltText: boolean;
    showEmbeds: boolean;
    showEmojiReactions: boolean;
    autoEmojiConvert: boolean;
    allowSensitiveDM: boolean;
    allowSensitiveServer: boolean;
    dmSpamFilter: DmSpamFilter;
  };
  languageTime: {
    language: LanguageCode;
    use24HourClock: boolean;
    timezone: string;
    firstDayOfWeek: FirstDayOfWeek;
  };
  windows: {
    openOnStartup: boolean;
    startMinimized: boolean;
    closeButtonMinimizes: boolean;
    systemHelperEnabled: boolean;
  };
  streamerMode: {
    enabled: boolean;
    hidePersonalInfo: boolean;
    hideInviteLinks: boolean;
    hideSounds: boolean;
    hideNotificationPreview: boolean;
  };
  advanced: {
    hardwareAcceleration: boolean;
    openDevToolsOnLaunch: boolean;
    sendDiagnostics: boolean;
    experimentalFeatures: boolean;
  };
};

export const THEME_OPTIONS: Array<{ id: ThemeMode; label: string; swatch: string; presetId: ThemePreset }> = [
  { id: "light", label: "Açık", swatch: "linear-gradient(135deg, #f5f7fb 0%, #dde4f3 100%)", presetId: "dawn-light" },
  { id: "graphite", label: "Grafit", swatch: "linear-gradient(135deg, #2f3241 0%, #252836 100%)", presetId: "graphite-core" },
  { id: "dark", label: "Koyu", swatch: "linear-gradient(135deg, #1f2231 0%, #171a27 100%)", presetId: "soft-dark" },
  { id: "night", label: "Gece", swatch: "linear-gradient(135deg, #121624 0%, #0d1020 100%)", presetId: "default-dark" },
  { id: "amoled", label: "AMOLED", swatch: "linear-gradient(135deg, #050507 0%, #000000 100%)", presetId: "pure-black" }
];

type ThemePresetOption = {
  id: ThemePreset;
  label: string;
  description: string;
  swatch: string;
  mode: ThemeMode;
  category: "base" | "gradient";
  accent: string;
  accentSecondary: string;
  tintPrimary: string;
  tintSecondary: string;
  surfaceTint: number;
  panelTint: number;
  glow: [string, string, string];
};

export const THEME_PRESET_OPTIONS: ThemePresetOption[] = [
  {
    id: "dawn-light",
    label: "Dawn Light",
    description: "Aydınlık, sade ve net görünüm.",
    swatch: "linear-gradient(140deg, #f8f9fd 0%, #e6ebff 100%)",
    mode: "light",
    category: "base",
    accent: "#5d6dff",
    accentSecondary: "#7c8dff",
    tintPrimary: "#7b8cff",
    tintSecondary: "#95c3ff",
    surfaceTint: 0.12,
    panelTint: 0.1,
    glow: ["#7f8cff", "#87d2ff", "#c7d1ff"]
  },
  {
    id: "graphite-core",
    label: "Graphite Core",
    description: "Nötr ve dengeli gri tonlar.",
    swatch: "linear-gradient(140deg, #2f3241 0%, #222838 100%)",
    mode: "graphite",
    category: "base",
    accent: "#6f8cff",
    accentSecondary: "#7ca6ff",
    tintPrimary: "#586173",
    tintSecondary: "#4a5366",
    surfaceTint: 0.08,
    panelTint: 0.08,
    glow: ["#6d7d97", "#5a87d8", "#6d73b0"]
  },
  {
    id: "soft-dark",
    label: "Soft Dark",
    description: "Yumuşak koyu kontrast.",
    swatch: "linear-gradient(140deg, #242a3a 0%, #1b2132 100%)",
    mode: "dark",
    category: "base",
    accent: "#7ac7ff",
    accentSecondary: "#6ee7c9",
    tintPrimary: "#6f7fa2",
    tintSecondary: "#4d667f",
    surfaceTint: 0.11,
    panelTint: 0.14,
    glow: ["#72b8ff", "#58dcb6", "#6a78ff"]
  },
  {
    id: "default-dark",
    label: "Default Dark",
    description: "Klasik Catwa koyu görünüm.",
    swatch: "linear-gradient(140deg, #171c2c 0%, #101627 100%)",
    mode: "night",
    category: "base",
    accent: "#6b7bff",
    accentSecondary: "#57c8ff",
    tintPrimary: "#6174ff",
    tintSecondary: "#3e91ff",
    surfaceTint: 0.16,
    panelTint: 0.16,
    glow: ["#5f72ff", "#40c4ff", "#4f60db"]
  },
  {
    id: "midnight",
    label: "Midnight",
    description: "Derin mavi gece tonu.",
    swatch: "linear-gradient(140deg, #0d1326 0%, #060b17 100%)",
    mode: "night",
    category: "base",
    accent: "#6e8bff",
    accentSecondary: "#4ca8ff",
    tintPrimary: "#3049a9",
    tintSecondary: "#1d7cb9",
    surfaceTint: 0.2,
    panelTint: 0.2,
    glow: ["#4d63dd", "#3a93dd", "#243b94"]
  },
  {
    id: "pure-black",
    label: "AMOLED / Pure Black",
    description: "Minimum ışık, maksimum kontrast.",
    swatch: "linear-gradient(140deg, #050507 0%, #000000 100%)",
    mode: "amoled",
    category: "base",
    accent: "#4dd8b6",
    accentSecondary: "#2ea4ff",
    tintPrimary: "#2cb596",
    tintSecondary: "#1e5e9d",
    surfaceTint: 0.12,
    panelTint: 0.14,
    glow: ["#29a889", "#2a86cf", "#20395e"]
  },
  {
    id: "aurora-sky",
    label: "Aurora Sky",
    description: "Turkuaz-mor geçişli canlı tema.",
    swatch: "linear-gradient(135deg, #26d0ce 0%, #6e61ff 48%, #8d4cff 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#5fc8ff",
    accentSecondary: "#8a63ff",
    tintPrimary: "#27c6cf",
    tintSecondary: "#7f59ff",
    surfaceTint: 0.26,
    panelTint: 0.26,
    glow: ["#27c7cf", "#7f59ff", "#5a74ff"]
  },
  {
    id: "sunset-pop",
    label: "Sunset Pop",
    description: "Sıcak gün batımı geçişi.",
    swatch: "linear-gradient(135deg, #ff7a59 0%, #ff4d8d 45%, #7d4dff 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#ff7d63",
    accentSecondary: "#a368ff",
    tintPrimary: "#ff7a59",
    tintSecondary: "#9a4fff",
    surfaceTint: 0.25,
    panelTint: 0.24,
    glow: ["#ff7e5f", "#b95cff", "#ff4f8f"]
  },
  {
    id: "mint-bloom",
    label: "Mint Bloom",
    description: "Ferah mint + yumuşak mavi.",
    swatch: "linear-gradient(135deg, #49dcb1 0%, #3ab7ff 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#43d7b2",
    accentSecondary: "#58b9ff",
    tintPrimary: "#3ecda8",
    tintSecondary: "#4da9ff",
    surfaceTint: 0.24,
    panelTint: 0.22,
    glow: ["#44d7b3", "#51b5ff", "#2f9ea0"]
  },
  {
    id: "rose-candy",
    label: "Rose Candy",
    description: "Pembe-lila enerjik geçiş.",
    swatch: "linear-gradient(135deg, #ff6cb3 0%, #d66bff 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#ff72b5",
    accentSecondary: "#c479ff",
    tintPrimary: "#ff6db8",
    tintSecondary: "#b56cff",
    surfaceTint: 0.24,
    panelTint: 0.23,
    glow: ["#ff77bd", "#c578ff", "#d052c0"]
  },
  {
    id: "violet-storm",
    label: "Violet Storm",
    description: "Koyu mor + elektrik mavi.",
    swatch: "linear-gradient(135deg, #3f2b96 0%, #5b7cfa 100%)",
    mode: "night",
    category: "gradient",
    accent: "#6a73ff",
    accentSecondary: "#5da8ff",
    tintPrimary: "#5437c7",
    tintSecondary: "#4e85ff",
    surfaceTint: 0.27,
    panelTint: 0.26,
    glow: ["#5f45dd", "#4e97ff", "#4c40a7"]
  },
  {
    id: "forest-wave",
    label: "Forest Wave",
    description: "Yeşil-mavi dengeli geçiş.",
    swatch: "linear-gradient(135deg, #146a52 0%, #2f8de4 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#4bcf8e",
    accentSecondary: "#59a8ff",
    tintPrimary: "#2f9c76",
    tintSecondary: "#3d7dd8",
    surfaceTint: 0.26,
    panelTint: 0.25,
    glow: ["#44b986", "#4f93eb", "#3b7957"]
  },
  {
    id: "ocean-depth",
    label: "Ocean Depth",
    description: "Derin mavi-siyan okyanus tonu.",
    swatch: "linear-gradient(135deg, #114b8a 0%, #1fb6ff 100%)",
    mode: "night",
    category: "gradient",
    accent: "#2ea7ff",
    accentSecondary: "#42d7ff",
    tintPrimary: "#1d6eb3",
    tintSecondary: "#1f9fd5",
    surfaceTint: 0.28,
    panelTint: 0.26,
    glow: ["#258ef2", "#2dc5ff", "#205f99"]
  },
  {
    id: "ember-glow",
    label: "Ember Glow",
    description: "Turuncu-amber sıcak tema.",
    swatch: "linear-gradient(135deg, #a84b1c 0%, #ff9f1a 100%)",
    mode: "dark",
    category: "gradient",
    accent: "#ff9d3f",
    accentSecondary: "#ff6f3a",
    tintPrimary: "#c26d30",
    tintSecondary: "#d65a30",
    surfaceTint: 0.24,
    panelTint: 0.22,
    glow: ["#ff9f45", "#ff763f", "#b55e31"]
  }
];

type ThemePalette = {
  bg0: string;
  bg1: string;
  bg2: string;
  bg3: string;
  panel: string;
  panelAlt: string;
  border: string;
  textMain: string;
  textMuted: string;
  textSoft: string;
};

const THEME_PALETTES: Record<ThemeMode, ThemePalette> = {
  light: {
    bg0: "#e9eefb",
    bg1: "#dde4f3",
    bg2: "#ced9f2",
    bg3: "#bfcbe6",
    panel: "#eff3ff",
    panelAlt: "#e2e8f7",
    border: "rgba(69, 89, 121, 0.26)",
    textMain: "#0f172a",
    textMuted: "#334155",
    textSoft: "#475569"
  },
  graphite: {
    bg0: "#262c3d",
    bg1: "#1c2131",
    bg2: "#141826",
    bg3: "#101321",
    panel: "#1d2231",
    panelAlt: "#161b2a",
    border: "rgba(148, 163, 184, 0.18)",
    textMain: "#e5e7eb",
    textMuted: "#9ca3af",
    textSoft: "#94a3b8"
  },
  dark: {
    bg0: "#1d2335",
    bg1: "#141b2d",
    bg2: "#101626",
    bg3: "#0b1220",
    panel: "#131a2b",
    panelAlt: "#0f1524",
    border: "rgba(148, 163, 184, 0.19)",
    textMain: "#e2e8f0",
    textMuted: "#9aa7bc",
    textSoft: "#8b9ab1"
  },
  night: {
    bg0: "#111933",
    bg1: "#0b1020",
    bg2: "#080d19",
    bg3: "#060a14",
    panel: "#0f172a",
    panelAlt: "#0a1120",
    border: "rgba(148, 163, 184, 0.17)",
    textMain: "#e2e8f0",
    textMuted: "#94a3b8",
    textSoft: "#8697ae"
  },
  amoled: {
    bg0: "#090b14",
    bg1: "#05070f",
    bg2: "#020306",
    bg3: "#000000",
    panel: "#050507",
    panelAlt: "#000000",
    border: "rgba(120, 132, 152, 0.26)",
    textMain: "#e5e7eb",
    textMuted: "#9ca3af",
    textSoft: "#8794a9"
  }
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function normalizeHex(value: string): string {
  const cleaned = value.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) {
    return "#6b7bff";
  }
  if (cleaned.length === 3) {
    return `#${cleaned
      .split("")
      .map((ch) => ch + ch)
      .join("")
      .toLowerCase()}`;
  }
  return `#${cleaned.toLowerCase()}`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = normalizeHex(hex);
  const raw = normalized.slice(1);
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function toRgba(hex: string, alpha: number): string {
  const rgb = hexToRgb(hex);
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp(alpha, 0, 1)})`;
}

function blendHex(baseHex: string, mixHex: string, mixAmount: number): string {
  const base = hexToRgb(baseHex);
  const mix = hexToRgb(mixHex);
  const amount = clamp(mixAmount, 0, 1);
  return rgbToHex(
    base.r + (mix.r - base.r) * amount,
    base.g + (mix.g - base.g) * amount,
    base.b + (mix.b - base.b) * amount
  );
}

function buildSurfaceGradient(baseHex: string, tintHex: string, topAlpha: number, bottomAlpha: number): string {
  const topColor = toRgba(blendHex(baseHex, tintHex, 0.35), topAlpha);
  const bottomColor = toRgba(baseHex, bottomAlpha);
  return `linear-gradient(160deg, ${topColor} 0%, ${bottomColor} 100%)`;
}

function resolveTintedPalette(base: ThemePalette, preset: ThemePresetOption): ThemePalette {
  const isLight = preset.mode === "light";
  const surfaceTint = clamp(preset.surfaceTint, 0, 0.5);
  const panelTint = clamp(preset.panelTint, 0, 0.5);

  return {
    bg0: blendHex(base.bg0, preset.tintPrimary, surfaceTint * 0.66),
    bg1: blendHex(base.bg1, preset.tintPrimary, surfaceTint * 0.54),
    bg2: blendHex(base.bg2, preset.tintSecondary, surfaceTint * 0.48),
    bg3: blendHex(base.bg3, preset.tintSecondary, surfaceTint * 0.38),
    panel: blendHex(base.panel, preset.tintPrimary, panelTint * 0.46),
    panelAlt: blendHex(base.panelAlt, preset.tintSecondary, panelTint * 0.4),
    border: toRgba(blendHex(base.textMuted, preset.tintPrimary, isLight ? 0.18 : 0.28), isLight ? 0.28 : 0.22),
    textMain: blendHex(base.textMain, preset.tintSecondary, isLight ? 0.03 : 0.06),
    textMuted: blendHex(base.textMuted, preset.tintPrimary, isLight ? 0.08 : 0.16),
    textSoft: blendHex(base.textSoft, preset.tintSecondary, isLight ? 0.08 : 0.14)
  };
}

function getBasePresetByTheme(theme: ThemeMode): ThemePreset {
  return THEME_OPTIONS.find((option) => option.id === theme)?.presetId ?? "default-dark";
}

function normalizePreferences(input: Partial<AppPreferences> | null | undefined): AppPreferences {
  const defaults = getDefaultAppPreferences();
  if (!input) {
    return defaults;
  }

  const merged: AppPreferences = {
    appearance: {
      ...defaults.appearance,
      ...input.appearance
    },
    accessibility: {
      ...defaults.accessibility,
      ...input.accessibility
    },
    voiceVideo: {
      ...defaults.voiceVideo,
      ...input.voiceVideo
    },
    chat: {
      ...defaults.chat,
      ...input.chat
    },
    languageTime: {
      ...defaults.languageTime,
      ...input.languageTime
    },
    windows: {
      ...defaults.windows,
      ...input.windows
    },
    streamerMode: {
      ...defaults.streamerMode,
      ...input.streamerMode
    },
    advanced: {
      ...defaults.advanced,
      ...input.advanced
    }
  };

  if (merged.voiceVideo.noiseSuppression !== "standard" && merged.voiceVideo.noiseSuppression !== "off") {
    merged.voiceVideo.noiseSuppression = "standard";
  }

  const fallbackPresetId = getBasePresetByTheme((merged.appearance.theme ?? "night") as ThemeMode);
  const preset = THEME_PRESET_OPTIONS.find((item) => item.id === (merged.appearance.themePreset as ThemePreset)) ?? getThemePresetById(fallbackPresetId);

  merged.appearance.themePreset = preset.id;
  merged.appearance.theme = preset.mode;
  if (!["comfortable", "normal", "compact"].includes(merged.appearance.density)) {
    merged.appearance.density = defaults.appearance.density;
  }
  if (!["classic", "filled", "minimal"].includes(merged.appearance.iconStyle)) {
    merged.appearance.iconStyle = defaults.appearance.iconStyle;
  }
  if (!["default", "compact"].includes(merged.appearance.messageDisplay)) {
    merged.appearance.messageDisplay = defaults.appearance.messageDisplay;
  }
  merged.appearance.accentColor = normalizeHex(preset.accent);
  merged.appearance.accentSaturation = 100;
  merged.appearance.accentIntensity = 100;
  merged.appearance.messageGroupGap = clamp(Math.round(merged.appearance.messageGroupGap), 0, 24);
  merged.appearance.chatFontSize = clamp(Math.round(merged.appearance.chatFontSize), 12, 24);
  merged.appearance.uiZoom = clamp(Math.round(merged.appearance.uiZoom), 50, 200);

  return merged;
}

export function getDefaultAppPreferences(): AppPreferences {
  return {
    appearance: {
      theme: "night",
      themePreset: "default-dark",
      accentColor: "#6b7bff",
      accentSaturation: 100,
      accentIntensity: 100,
      density: "normal",
      iconStyle: "classic",
      messageDisplay: "default",
      messageGroupGap: 16,
      chatFontSize: 16,
      uiZoom: 100
    },
    accessibility: {
      reducedMotion: false,
      highContrast: false,
      screenReaderHints: true,
      disableAnimatedEmoji: false
    },
    voiceVideo: {
      inputDeviceId: "default",
      outputDeviceId: "default",
      inputVolume: 85,
      outputVolume: 55,
      voiceProfile: "custom",
      noiseSuppression: "standard",
      echoCancellation: true,
      pushToTalk: false,
      autoGainControl: true
    },
    chat: {
      showLinkMedia: true,
      showUploadedMedia: true,
      showAltText: false,
      showEmbeds: true,
      showEmojiReactions: true,
      autoEmojiConvert: true,
      allowSensitiveDM: true,
      allowSensitiveServer: true,
      dmSpamFilter: "non-friends"
    },
    languageTime: {
      language: "tr-TR",
      use24HourClock: true,
      timezone: "Europe/Istanbul",
      firstDayOfWeek: "monday"
    },
    windows: {
      openOnStartup: false,
      startMinimized: false,
      closeButtonMinimizes: false,
      systemHelperEnabled: true
    },
    streamerMode: {
      enabled: false,
      hidePersonalInfo: true,
      hideInviteLinks: true,
      hideSounds: false,
      hideNotificationPreview: false
    },
    advanced: {
      hardwareAcceleration: true,
      openDevToolsOnLaunch: false,
      sendDiagnostics: false,
      experimentalFeatures: false
    }
  };
}

function readLegacyPreferences(): Partial<AppPreferences> | null {
  try {
    const raw = window.localStorage.getItem("catwa.uiPreferences.v1");
    if (!raw) {
      return null;
    }
    return JSON.parse(raw) as Partial<AppPreferences>;
  } catch {
    return null;
  }
}

export function loadAppPreferences(): AppPreferences {
  const defaults = getDefaultAppPreferences();

  try {
    const raw = window.localStorage.getItem(UI_PREFERENCES_STORAGE_KEY);
    if (raw) {
      return normalizePreferences(JSON.parse(raw) as Partial<AppPreferences>);
    }

    const legacy = readLegacyPreferences();
    if (legacy) {
      const migrated = normalizePreferences(legacy);
      saveAppPreferences(migrated);
      return migrated;
    }
  } catch {
    return defaults;
  }

  return defaults;
}

export function saveAppPreferences(value: AppPreferences): void {
  const normalized = normalizePreferences(value);
  window.localStorage.setItem(UI_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized));
  window.dispatchEvent(new CustomEvent(UI_PREFERENCES_EVENT, { detail: normalized }));
}

export function getThemePresetById(id: ThemePreset): (typeof THEME_PRESET_OPTIONS)[number] {
  return THEME_PRESET_OPTIONS.find((item) => item.id === id) ?? THEME_PRESET_OPTIONS.find((item) => item.id === "default-dark") ?? THEME_PRESET_OPTIONS[0];
}

export function applyThemePreset(prefs: AppPreferences, presetId: ThemePreset): AppPreferences {
  const preset = getThemePresetById(presetId);
  return {
    ...prefs,
    appearance: {
      ...prefs.appearance,
      themePreset: preset.id,
      theme: preset.mode,
      accentColor: preset.accent,
      accentSaturation: 100,
      accentIntensity: 100
    }
  };
}

export function applyAppPreferences(value: AppPreferences): void {
  const normalized = normalizePreferences(value);
  const root = document.documentElement;
  const preset = getThemePresetById(normalized.appearance.themePreset);
  const basePalette = THEME_PALETTES[preset.mode];
  const palette = resolveTintedPalette(basePalette, preset);
  const accent = preset.accent;
  const accentSecondary = preset.accentSecondary;
  const accentBlend = blendHex(accent, accentSecondary, 0.42);
  const accentRgb = hexToRgb(accent);
  const shellGradient = [
    `radial-gradient(circle at 12% -8%, ${toRgba(preset.tintPrimary, preset.mode === "light" ? 0.28 : 0.2)} 0%, transparent 46%)`,
    `radial-gradient(circle at 92% 10%, ${toRgba(preset.tintSecondary, preset.mode === "light" ? 0.24 : 0.18)} 0%, transparent 44%)`,
    `radial-gradient(circle at 52% 102%, ${toRgba(accentSecondary, preset.mode === "light" ? 0.16 : 0.14)} 0%, transparent 56%)`,
    `linear-gradient(150deg, ${palette.bg0} 0%, ${palette.bg1} 36%, ${palette.bg3} 100%)`
  ].join(", ");

  root.style.setProperty("--catwa-bg-0", palette.bg0);
  root.style.setProperty("--catwa-bg-1", palette.bg1);
  root.style.setProperty("--catwa-bg-2", palette.bg2);
  root.style.setProperty("--catwa-bg-3", palette.bg3);
  root.style.setProperty("--catwa-panel", palette.panel);
  root.style.setProperty("--catwa-panel-alt", palette.panelAlt);
  root.style.setProperty("--catwa-border", palette.border);
  root.style.setProperty("--catwa-text-main", palette.textMain);
  root.style.setProperty("--catwa-text-muted", palette.textMuted);
  root.style.setProperty("--catwa-text-soft", palette.textSoft);
  root.style.setProperty("--catwa-accent", accent);
  root.style.setProperty("--catwa-accent-secondary", accentSecondary);
  root.style.setProperty("--catwa-accent-rgb", `${accentRgb.r}, ${accentRgb.g}, ${accentRgb.b}`);
  root.style.setProperty("--catwa-accent-gradient", `linear-gradient(135deg, ${accent} 0%, ${accentSecondary} 100%)`);
  root.style.setProperty(
    "--catwa-accent-soft-gradient",
    `linear-gradient(135deg, ${toRgba(accent, 0.34)} 0%, ${toRgba(accentSecondary, 0.32)} 100%)`
  );
  root.style.setProperty("--catwa-accent-soft", toRgba(accentBlend, 0.24));
  root.style.setProperty("--catwa-accent-softest", toRgba(accentBlend, 0.14));
  root.style.setProperty("--catwa-accent-strong", toRgba(blendHex(accent, accentSecondary, 0.22), 0.4));
  root.style.setProperty("--catwa-accent-ring", toRgba(blendHex(accent, accentSecondary, 0.14), 0.58));
  root.style.setProperty("--catwa-danger", "#fb7185");
  root.style.setProperty("--catwa-danger-soft", "rgba(244, 63, 94, 0.2)");
  root.style.setProperty("--catwa-success", "#34d399");
  root.style.setProperty("--catwa-success-soft", "rgba(16, 185, 129, 0.2)");
  root.style.setProperty("--catwa-slate-950", toRgba(palette.bg3, 0.96));
  root.style.setProperty("--catwa-slate-900", toRgba(palette.bg2, 0.9));
  root.style.setProperty("--catwa-slate-800", toRgba(palette.bg1, 0.82));
  root.style.setProperty("--catwa-slate-700", toRgba(palette.panel, 0.74));
  root.style.setProperty("--catwa-slate-600", toRgba(palette.panelAlt, 0.66));
  root.style.setProperty("--catwa-slate-500", palette.textSoft);
  root.style.setProperty("--catwa-slate-400", palette.textMuted);
  root.style.setProperty("--catwa-slate-300", "color-mix(in srgb, var(--catwa-text-main) 84%, white 16%)");
  root.style.setProperty("--catwa-slate-200", "color-mix(in srgb, var(--catwa-text-main) 92%, white 8%)");
  root.style.setProperty("--catwa-slate-100", palette.textMain);
  root.style.setProperty("--catwa-border-soft", "color-mix(in srgb, var(--catwa-border) 70%, transparent)");
  root.style.setProperty("--catwa-border-strong", "color-mix(in srgb, var(--catwa-border) 115%, transparent)");
  root.style.setProperty("--catwa-glow-a", toRgba(preset.glow[0], preset.mode === "light" ? 0.22 : 0.18));
  root.style.setProperty("--catwa-glow-b", toRgba(preset.glow[1], preset.mode === "light" ? 0.2 : 0.15));
  root.style.setProperty("--catwa-glow-c", toRgba(preset.glow[2], preset.mode === "light" ? 0.18 : 0.13));
  root.style.setProperty("--catwa-surface-grad-950", buildSurfaceGradient(palette.bg3, preset.tintSecondary, 0.98, 0.94));
  root.style.setProperty("--catwa-surface-grad-900", buildSurfaceGradient(palette.bg2, preset.tintPrimary, 0.92, 0.88));
  root.style.setProperty("--catwa-surface-grad-800", buildSurfaceGradient(palette.bg1, preset.tintPrimary, 0.86, 0.8));
  root.style.setProperty("--catwa-surface-grad-700", buildSurfaceGradient(palette.panel, preset.tintSecondary, 0.8, 0.74));
  root.style.setProperty("--catwa-surface-grad-600", buildSurfaceGradient(palette.panelAlt, preset.tintSecondary, 0.74, 0.68));
  root.style.setProperty(
    "--catwa-overlay-color",
    preset.mode === "light" ? "rgba(15, 23, 42, 0.35)" : "rgba(2, 6, 23, 0.62)"
  );

  root.style.setProperty("--catwa-chat-font-size", `${normalized.appearance.chatFontSize}px`);
  root.style.setProperty("--catwa-message-gap", `${normalized.appearance.messageGroupGap}px`);
  root.style.setProperty("--catwa-ui-zoom", `${normalized.appearance.uiZoom / 100}`);
  root.style.setProperty("--catwa-shell-bg", shellGradient);

  root.setAttribute("data-catwa-theme", preset.mode);
  root.setAttribute("data-catwa-density", normalized.appearance.density);
  root.setAttribute("data-catwa-icon-style", normalized.appearance.iconStyle);
  root.setAttribute("data-catwa-reduced-motion", normalized.accessibility.reducedMotion ? "1" : "0");
  root.setAttribute("data-catwa-high-contrast", normalized.accessibility.highContrast ? "1" : "0");
  root.setAttribute("data-catwa-streamer-mode", normalized.streamerMode.enabled ? "1" : "0");
  root.setAttribute(
    "data-catwa-streamer-hide-personal",
    normalized.streamerMode.enabled && normalized.streamerMode.hidePersonalInfo ? "1" : "0"
  );
  root.setAttribute(
    "data-catwa-streamer-hide-invites",
    normalized.streamerMode.enabled && normalized.streamerMode.hideInviteLinks ? "1" : "0"
  );
  root.style.setProperty("color-scheme", preset.mode === "light" ? "light" : "dark");
}

