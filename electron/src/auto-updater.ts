import { app, ipcMain, type BrowserWindow } from "electron";
import log from "electron-log";
import { autoUpdater, type UpdateInfo } from "electron-updater";

export type UpdateStatus =
  | "available"
  | "checking"
  | "downloaded"
  | "downloading"
  | "error"
  | "idle"
  | "installing"
  | "not-available"
  | "preparing";

export type UpdateStatusPayload = {
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
  status: UpdateStatus;
  timestamp: string;
};

type RegisterAutoUpdaterOptions = {
  authorize: (accessToken: string) => Promise<void>;
  getWindow: () => BrowserWindow | null;
  onLog: (message: string) => void;
  prepareInstall: (targetVersion: string) => Promise<void>;
};

let registered = false;
let latestInfo: UpdateInfo | null = null;
let state: UpdateStatusPayload = createPayload("idle", "Ready to check for updates.");

export function registerAutoUpdater(options: RegisterAutoUpdaterOptions) {
  if (registered) return;

  registered = true;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = log;

  autoUpdater.on("checking-for-update", () => {
    publish(options, "checking", "Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    latestInfo = info;
    publish(options, "available", `Update available: ${info.version}`, infoDetails(info));
  });
  autoUpdater.on("update-not-available", (info) => {
    latestInfo = info;
    publish(options, "not-available", "No update available.", infoDetails(info));
  });
  autoUpdater.on("download-progress", (progress) => {
    publish(options, "downloading", `Downloading update: ${Math.round(progress.percent)}%`, {
      ...infoDetails(latestInfo),
      bytesPerSecond: progress.bytesPerSecond,
      percent: progress.percent,
      total: progress.total,
      transferred: progress.transferred,
    });
  });
  autoUpdater.on("update-downloaded", (info) => {
    latestInfo = info;
    publish(options, "downloaded", `Update downloaded: ${info.version}`, infoDetails(info));
  });
  autoUpdater.on("error", (error) => {
    publish(options, "error", error.message, infoDetails(latestInfo));
  });

  ipcMain.handle("desktop:get-update-status", () => state);
  ipcMain.handle("desktop:check-for-updates", async (_event, accessToken: unknown) => {
    if (!app.isPackaged) {
      publish(options, "idle", "Updates are only checked in packaged builds.");
      return { success: true, skipped: true, state };
    }
    try {
      await options.authorize(String(accessToken ?? ""));
      const result = await autoUpdater.checkForUpdates();
      return { success: true, state, updateInfo: result?.updateInfo ?? null };
    } catch (error) {
      publish(options, "error", errorMessage(error), infoDetails(latestInfo));
      return { error: errorMessage(error), success: false, state };
    }
  });

  ipcMain.handle("desktop:download-update", async (_event, accessToken: unknown) => {
    if (!app.isPackaged) return { success: true, skipped: true, state };
    if (state.status !== "available") {
      return { error: "No update is ready to download.", success: false, state };
    }
    try {
      await options.authorize(String(accessToken ?? ""));
      await autoUpdater.downloadUpdate();
      return { success: true, state };
    } catch (error) {
      publish(options, "error", errorMessage(error), infoDetails(latestInfo));
      return { error: errorMessage(error), success: false, state };
    }
  });

  ipcMain.handle("desktop:install-update", async (_event, accessToken: unknown) => {
    if (!app.isPackaged) return { error: "Packaged app required.", success: false, state };
    if (state.status !== "downloaded" || !latestInfo?.version) {
      return { error: "The update has not finished downloading.", success: false, state };
    }
    try {
      await options.authorize(String(accessToken ?? ""));
      publish(options, "preparing", "Creating recovery checkpoint...", infoDetails(latestInfo));
      await options.prepareInstall(latestInfo.version);
      publish(options, "installing", "Installing update and restarting...", infoDetails(latestInfo));
      setImmediate(() => autoUpdater.quitAndInstall(false, true));
      return { success: true, state };
    } catch (error) {
      publish(options, "error", errorMessage(error), infoDetails(latestInfo));
      return { error: errorMessage(error), success: false, state };
    }
  });

  if (app.isPackaged) {
    setTimeout(() => {
      void autoUpdater.checkForUpdates().catch((error: Error) => {
        publish(options, "error", error.message);
      });
    }, 15_000);
  }
}

function publish(
  options: RegisterAutoUpdaterOptions,
  status: UpdateStatus,
  message: string,
  details: UpdateStatusPayload["details"] = {},
) {
  state = createPayload(status, message, details);
  options.onLog(`[update] ${message}`);
  options.getWindow()?.webContents.send("desktop-update-status", state);
}

function createPayload(
  status: UpdateStatus,
  message: string,
  details: UpdateStatusPayload["details"] = {},
): UpdateStatusPayload {
  return {
    currentVersion: app.getVersion(),
    details,
    message,
    status,
    timestamp: new Date().toISOString(),
  };
}

function infoDetails(info: UpdateInfo | null): UpdateStatusPayload["details"] {
  if (!info) return {};
  return {
    releaseDate: info.releaseDate,
    releaseName: typeof info.releaseName === "string" ? info.releaseName : undefined,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    version: info.version,
  };
}

function normalizeReleaseNotes(notes: UpdateInfo["releaseNotes"]) {
  if (typeof notes === "string") return notes;
  if (!Array.isArray(notes)) return undefined;
  return notes
    .map((note) => (typeof note === "string" ? note : note.note))
    .filter(Boolean)
    .join("\n\n");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
