"use client";

export type SoundSettings = {
  masterVolume: number;
  okVolume: number;
  ngVolume: number;
};

const SOUND_SETTINGS_KEY = "ocr_sound_settings";
const SOUND_SETTINGS_EVENT = "ocr-sound-settings-changed";

export const defaultSoundSettings: SoundSettings = {
  masterVolume: 100,
  okVolume: 100,
  ngVolume: 100,
};

export function getSoundSettings(): SoundSettings {
  if (typeof window === "undefined") {
    return defaultSoundSettings;
  }

  const raw = window.localStorage.getItem(SOUND_SETTINGS_KEY);

  if (!raw) {
    return defaultSoundSettings;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<SoundSettings>;
    return normalizeSoundSettings(parsed);
  } catch {
    return defaultSoundSettings;
  }
}

export function saveSoundSettings(settings: Partial<SoundSettings>) {
  if (typeof window === "undefined") {
    return defaultSoundSettings;
  }

  const normalized = normalizeSoundSettings(settings);
  window.localStorage.setItem(SOUND_SETTINGS_KEY, JSON.stringify(normalized));
  window.dispatchEvent(
    new CustomEvent<SoundSettings>(SOUND_SETTINGS_EVENT, {
      detail: normalized,
    }),
  );

  return normalized;
}

export function subscribeSoundSettings(
  listener: (settings: SoundSettings) => void,
) {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<SoundSettings>;
    listener(normalizeSoundSettings(customEvent.detail));
  };

  window.addEventListener(SOUND_SETTINGS_EVENT, handler);
  return () => window.removeEventListener(SOUND_SETTINGS_EVENT, handler);
}

export function getResultSoundLevel(
  settings: SoundSettings,
  result: "OK" | "NG",
) {
  const specific = result === "OK" ? settings.okVolume : settings.ngVolume;
  return Math.min(2, (settings.masterVolume / 100) * (specific / 100) * 2);
}

function normalizeSoundSettings(settings: Partial<SoundSettings>) {
  return {
    masterVolume: clampVolume(settings.masterVolume, defaultSoundSettings.masterVolume),
    okVolume: clampVolume(settings.okVolume, defaultSoundSettings.okVolume),
    ngVolume: clampVolume(settings.ngVolume, defaultSoundSettings.ngVolume),
  };
}

function clampVolume(value: number | undefined, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  return Math.min(100, Math.max(0, Math.round(value)));
}
