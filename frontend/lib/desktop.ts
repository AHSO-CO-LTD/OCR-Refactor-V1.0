"use client";

export type DesktopWindowPreset =
  | "factory"
  | "hd"
  | "fullHd"
  | "fourThree"
  | "custom";

export type DesktopWindowSettings = {
  fullscreen: boolean;
  frameless: boolean;
  alwaysOnTop: boolean;
  zoomFactor: number;
  windowPreset: DesktopWindowPreset;
  width: number;
  height: number;
};

export type DesktopTestStorageSettings = {
  testImageSaveFolderPath: string | null;
};

export type DesktopBridge = {
  applyWindowSettings(
    settings: Partial<DesktopWindowSettings>,
  ): Promise<DesktopWindowSettings>;
  exitApp(): Promise<{ success: boolean }>;
  getTestStorageSettings(): Promise<DesktopTestStorageSettings>;
  getWindowSettings(): Promise<DesktopWindowSettings>;
  saveTestStorageSettings(
    settings: DesktopTestStorageSettings,
  ): Promise<DesktopTestStorageSettings>;
  selectFolder(): Promise<{ canceled: boolean; folderPath: string | null }>;
  selectModelFile(): Promise<{ canceled: boolean; filePath: string | null }>;
  onTerminalLog(callback: (message: string) => void): () => void;
  platform: string;
  versions: {
    chrome: string;
    electron: string;
    node: string;
  };
};

declare global {
  interface Window {
    ocrDesktop?: DesktopBridge;
  }
}

export const defaultDesktopWindowSettings: DesktopWindowSettings = {
  fullscreen: false,
  frameless: false,
  alwaysOnTop: false,
  zoomFactor: 1,
  windowPreset: "factory",
  width: 1280,
  height: 1080,
};

export const defaultDesktopTestStorageSettings: DesktopTestStorageSettings = {
  testImageSaveFolderPath: null,
};

export function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.ocrDesktop ?? null;
}

export function isDesktopRuntime() {
  return Boolean(getDesktopBridge());
}
