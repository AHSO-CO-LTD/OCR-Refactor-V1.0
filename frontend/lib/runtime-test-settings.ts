"use client";

export type RuntimeTestSettings = {
  ignorePlcInDev: boolean;
};

const RUNTIME_TEST_SETTINGS_KEY = "ocr_runtime_test_settings";
const RUNTIME_TEST_SETTINGS_EVENT = "ocr-runtime-test-settings-changed";

export const defaultRuntimeTestSettings: RuntimeTestSettings = {
  ignorePlcInDev: true,
};

export function getRuntimeTestSettings(): RuntimeTestSettings {
  if (typeof window === "undefined") {
    return defaultRuntimeTestSettings;
  }

  const rawSettings = window.localStorage.getItem(RUNTIME_TEST_SETTINGS_KEY);

  if (!rawSettings) {
    return defaultRuntimeTestSettings;
  }

  try {
    return {
      ...defaultRuntimeTestSettings,
      ...(JSON.parse(rawSettings) as Partial<RuntimeTestSettings>),
    };
  } catch {
    return defaultRuntimeTestSettings;
  }
}

export function saveRuntimeTestSettings(settings: RuntimeTestSettings) {
  window.localStorage.setItem(RUNTIME_TEST_SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new Event(RUNTIME_TEST_SETTINGS_EVENT));
}

export function subscribeRuntimeTestSettings(listener: () => void) {
  window.addEventListener(RUNTIME_TEST_SETTINGS_EVENT, listener);
  return () => window.removeEventListener(RUNTIME_TEST_SETTINGS_EVENT, listener);
}
