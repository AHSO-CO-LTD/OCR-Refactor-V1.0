"use client";

export type RuntimeTestSettings = {
  ignorePlcInDev: boolean;
  inspectionResultDelayMs: number;
};

const RUNTIME_TEST_SETTINGS_KEY = "ocr_runtime_test_settings";
const RUNTIME_TEST_SETTINGS_EVENT = "ocr-runtime-test-settings-changed";
export const MIN_INSPECTION_RESULT_DELAY_MS = 500;
export const MAX_INSPECTION_RESULT_DELAY_MS = 2000;
export const DEFAULT_INSPECTION_RESULT_DELAY_MS = 2000;

export const defaultRuntimeTestSettings: RuntimeTestSettings = {
  ignorePlcInDev: true,
  inspectionResultDelayMs: DEFAULT_INSPECTION_RESULT_DELAY_MS,
};

export function clampInspectionResultDelayMs(value: number) {
  if (!Number.isFinite(value)) {
    return DEFAULT_INSPECTION_RESULT_DELAY_MS;
  }

  return Math.min(
    MAX_INSPECTION_RESULT_DELAY_MS,
    Math.max(MIN_INSPECTION_RESULT_DELAY_MS, Math.round(value)),
  );
}

function normalizeRuntimeTestSettings(
  settings: Partial<RuntimeTestSettings>,
): RuntimeTestSettings {
  return {
    ...defaultRuntimeTestSettings,
    ...settings,
    inspectionResultDelayMs: clampInspectionResultDelayMs(
      settings.inspectionResultDelayMs ??
        defaultRuntimeTestSettings.inspectionResultDelayMs,
    ),
  };
}

export function getRuntimeTestSettings(): RuntimeTestSettings {
  if (typeof window === "undefined") {
    return defaultRuntimeTestSettings;
  }

  const rawSettings = window.localStorage.getItem(RUNTIME_TEST_SETTINGS_KEY);

  if (!rawSettings) {
    return defaultRuntimeTestSettings;
  }

  try {
    return normalizeRuntimeTestSettings(
      JSON.parse(rawSettings) as Partial<RuntimeTestSettings>,
    );
  } catch {
    return defaultRuntimeTestSettings;
  }
}

export function saveRuntimeTestSettings(settings: RuntimeTestSettings) {
  window.localStorage.setItem(
    RUNTIME_TEST_SETTINGS_KEY,
    JSON.stringify(normalizeRuntimeTestSettings(settings)),
  );
  window.dispatchEvent(new Event(RUNTIME_TEST_SETTINGS_EVENT));
}

export function subscribeRuntimeTestSettings(listener: () => void) {
  window.addEventListener(RUNTIME_TEST_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(RUNTIME_TEST_SETTINGS_EVENT, listener);
}
