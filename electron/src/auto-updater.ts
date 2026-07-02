import { app, ipcMain, type BrowserWindow } from "electron";
import log from "electron-log";
import { autoUpdater } from "electron-updater";

type UpdateStatus =
  | "available"
  | "checking"
  | "downloaded"
  | "downloading"
  | "error"
  | "idle"
  | "not-available";

type RegisterAutoUpdaterOptions = {
  getWindow: () => BrowserWindow | null;
  onLog: (message: string) => void;
};

let registered = false;

export function registerAutoUpdater(options: RegisterAutoUpdaterOptions) {
  if (registered) {
    return;
  }

  registered = true;
  autoUpdater.autoDownload = false;
  autoUpdater.logger = log;

  autoUpdater.on("checking-for-update", () => {
    publish(options, "checking", "Checking for updates...");
  });
  autoUpdater.on("update-available", (info) => {
    publish(options, "available", `Update available: ${info.version}`, {
      version: info.version,
    });
  });
  autoUpdater.on("update-not-available", () => {
    publish(options, "not-available", "No update available.");
  });
  autoUpdater.on("download-progress", (progress) => {
    publish(
      options,
      "downloading",
      `Downloading update: ${Math.round(progress.percent)}%`,
      { percent: progress.percent },
    );
  });
  autoUpdater.on("update-downloaded", (info) => {
    publish(options, "downloaded", `Update downloaded: ${info.version}`, {
      version: info.version,
    });
  });
  autoUpdater.on("error", (error) => {
    publish(options, "error", error.message);
  });

  ipcMain.handle("desktop:check-for-updates", async () => {
    if (!app.isPackaged) {
      publish(options, "idle", "Updates are only checked in packaged builds.");
      return { success: true, skipped: true };
    }

    const result = await autoUpdater.checkForUpdates();
    return { success: true, updateInfo: result?.updateInfo ?? null };
  });

  ipcMain.handle("desktop:download-update", async () => {
    if (!app.isPackaged) {
      return { success: true, skipped: true };
    }

    await autoUpdater.downloadUpdate();
    return { success: true };
  });

  ipcMain.handle("desktop:install-update", () => {
    autoUpdater.quitAndInstall(false, true);
    return { success: true };
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
  details: Record<string, unknown> = {},
) {
  const payload = {
    status,
    message,
    details,
    timestamp: new Date().toISOString(),
  };
  options.onLog(`[update] ${message}`);
  options.getWindow()?.webContents.send("desktop-update-status", payload);
}
