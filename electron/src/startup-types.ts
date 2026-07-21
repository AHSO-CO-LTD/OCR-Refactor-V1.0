export type StartupHardwareStageId =
  | "plc"
  | "cameraPower"
  | "cameraLight"
  | "camera"
  | "plcSignals";

export type StartupServiceStageId =
  | "deviceTool"
  | "database"
  | "backend"
  | "frontend";

export type StartupStageId =
  | StartupServiceStageId
  | "license"
  | StartupHardwareStageId;

export type StartupStageStatus =
  | "pending"
  | "running"
  | "done"
  | "warning"
  | "skipped"
  | "failed";

export type StartupStageDetail = {
  id: string;
  label?: string;
  status: "done" | "failed" | "skipped";
  error?: string;
};

export type StartupStageUpdate = {
  id: StartupStageId;
  status: StartupStageStatus;
  details?: StartupStageDetail[];
};

export type StartupHardwareStageUpdate = StartupStageUpdate & {
  id: StartupHardwareStageId;
};

export type StartupServiceStageUpdate = StartupStageUpdate & {
  id: StartupServiceStageId;
};

export type StartupPhase = "running" | "blocked" | "warning" | "finished";

export type StartupSnapshot = {
  error: string | null;
  language: "en" | "vi";
  phase: StartupPhase;
  stages: StartupStageUpdate[];
};

export const STARTUP_STAGE_IDS: StartupStageId[] = [
  "deviceTool",
  "backend",
  "frontend",
  "database",
  "license",
  "plc",
  "cameraPower",
  "cameraLight",
  "camera",
  "plcSignals",
];

export function createPendingStartupStages() {
  return STARTUP_STAGE_IDS.map<StartupStageUpdate>((id) => ({
    id,
    status: "pending",
  }));
}
