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

export type DesktopStartupHardwareStageId =
  | "plc"
  | "cameraPower"
  | "cameraLight"
  | "camera"
  | "plcSignals";

export type DesktopStartupStageStatus =
  | "pending"
  | "running"
  | "done"
  | "warning"
  | "skipped"
  | "failed";

export type DesktopStartupStageDetail = {
  id: string;
  label?: string;
  status: "done" | "failed" | "skipped";
  error?: string;
};

export type DesktopStartupHardwareStage = {
  id: DesktopStartupHardwareStageId;
  status: DesktopStartupStageStatus;
  details?: DesktopStartupStageDetail[];
};

export type DesktopStartupServiceStage = {
  id: "deviceTool" | "database" | "backend" | "frontend";
  status: DesktopStartupStageStatus;
};

export type DesktopStartupStage = {
  id:
    | DesktopStartupServiceStage["id"]
    | DesktopStartupHardwareStageId
    | "license";
  status: DesktopStartupStageStatus;
  details?: DesktopStartupStageDetail[];
};

export type DesktopStartupSnapshot = {
  error: string | null;
  language: "en" | "vi";
  phase: "running" | "blocked" | "warning" | "finished";
  stages: DesktopStartupStage[];
};

export type DesktopStartupLogContext = {
  error?: string | null;
  stages: Array<{
    id: string;
    status: DesktopStartupStageStatus;
    details?: DesktopStartupStageDetail[];
  }>;
};

export type DesktopUpdateStatus =
  | "available"
  | "checking"
  | "downloaded"
  | "downloading"
  | "error"
  | "idle"
  | "installing"
  | "not-available"
  | "preparing";

export type DesktopUpdateState = {
  currentVersion: string;
  details: {
    bytesPerSecond?: number;
    percent?: number;
    releaseDate?: string;
    releaseName?: string;
    releaseNotes?: string;
    total?: number;
    transferred?: number;
    version?: string;
  };
  message: string;
  status: DesktopUpdateStatus;
  timestamp: string;
};

export type DesktopUpdateRecoveryNotice = {
  failure?: string;
  fromVersion: string;
  status: "completed" | "rolled-back";
  targetVersion: string;
};

export type DesktopUpdateActionResult = {
  error?: string;
  skipped?: boolean;
  state?: DesktopUpdateState;
  success: boolean;
};

export type DesktopExitMode = "app-and-hardware" | "app-only";

export type DesktopShutdownStageId =
  | "app"
  | "camera"
  | "cameraOutputs"
  | "plc"
  | "remainingSignals";

export type DesktopShutdownStageStatus =
  | "done"
  | "failed"
  | "pending"
  | "running"
  | "skipped";

export type DesktopShutdownStageUpdate = {
  error?: string;
  id: DesktopShutdownStageId;
  status: DesktopShutdownStageStatus;
};

export type DesktopBridge = {
  applyWindowSettings(
    settings: Partial<DesktopWindowSettings>,
  ): Promise<DesktopWindowSettings>;
  acknowledgeUpdateRecovery(): Promise<{ success: boolean }>;
  checkForUpdates(accessToken: string): Promise<DesktopUpdateActionResult>;
  downloadUpdate(accessToken: string): Promise<DesktopUpdateActionResult>;
  exitApp(mode?: DesktopExitMode): Promise<{ success: boolean }>;
  getTestStorageSettings(): Promise<DesktopTestStorageSettings>;
  getTerminalLogs(): Promise<string[]>;
  getStartupSnapshot(): Promise<DesktopStartupSnapshot>;
  getUpdateRecovery(): Promise<DesktopUpdateRecoveryNotice | null>;
  getUpdateStatus(): Promise<DesktopUpdateState>;
  exportStartupLog(
    context?: DesktopStartupLogContext,
  ): Promise<{ canceled: boolean; filePath: string | null }>;
  exportUpdateLog(): Promise<{ canceled: boolean; filePath: string | null }>;
  getLanguagePreference(): Promise<"en" | "vi">;
  getWindowSettings(): Promise<DesktopWindowSettings>;
  installUpdate(accessToken: string): Promise<DesktopUpdateActionResult>;
  openTerminalWindow(): Promise<{ success: boolean }>;
  restartApp(): Promise<{ success: boolean }>;
  setCloseConfirmationReady(ready: boolean): Promise<{ success: boolean }>;
  setLanguagePreference(language: "en" | "vi"): Promise<"en" | "vi">;
  saveTestStorageSettings(
    settings: DesktopTestStorageSettings,
  ): Promise<DesktopTestStorageSettings>;
  selectFolder(): Promise<{ canceled: boolean; folderPath: string | null }>;
  selectModelFile(): Promise<{ canceled: boolean; filePath: string | null }>;
  onTerminalLog(callback: (message: string) => void): () => void;
  onCloseRequested(callback: () => void): () => void;
  onShutdownStage(
    callback: (stage: DesktopShutdownStageUpdate) => void,
  ): () => void;
  onShutdownStatus(callback: (message: string) => void): () => void;
  onStartupSnapshot(
    callback: (payload: DesktopStartupSnapshot) => void,
  ): () => void;
  onUpdateStatus(callback: (payload: DesktopUpdateState) => void): () => void;
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
