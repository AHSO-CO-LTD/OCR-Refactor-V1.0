export type DesktopExitMode = "app-and-hardware" | "app-only";

export type ShutdownStageId =
  | "app"
  | "camera"
  | "cameraOutputs"
  | "plc"
  | "remainingSignals";

export type ShutdownStageStatus =
  | "done"
  | "failed"
  | "pending"
  | "running"
  | "skipped";

export type ShutdownStageUpdate = {
  error?: string;
  id: ShutdownStageId;
  status: ShutdownStageStatus;
};
