import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ocrDesktop", {
  applyWindowSettings(settings: Record<string, unknown>) {
    return ipcRenderer.invoke("desktop:apply-window-settings", settings);
  },
  exitApp(mode: "app-and-hardware" | "app-only" = "app-only") {
    return ipcRenderer.invoke("desktop:exit-app", mode);
  },
  checkForUpdates(accessToken: string) {
    return ipcRenderer.invoke("desktop:check-for-updates", accessToken);
  },
  getUpdateStatus() {
    return ipcRenderer.invoke("desktop:get-update-status");
  },
  getUpdateRecovery() {
    return ipcRenderer.invoke("desktop:get-update-recovery");
  },
  acknowledgeUpdateRecovery() {
    return ipcRenderer.invoke("desktop:acknowledge-update-recovery");
  },
  downloadUpdate(accessToken: string) {
    return ipcRenderer.invoke("desktop:download-update", accessToken);
  },
  installUpdate(accessToken: string) {
    return ipcRenderer.invoke("desktop:install-update", accessToken);
  },
  restartApp() {
    return ipcRenderer.invoke("desktop:restart-app");
  },
  getTestStorageSettings() {
    return ipcRenderer.invoke("desktop:get-test-storage-settings");
  },
  getWindowSettings() {
    return ipcRenderer.invoke("desktop:get-window-settings");
  },
  getTerminalLogs() {
    return ipcRenderer.invoke("desktop:get-terminal-logs");
  },
  getStartupSnapshot() {
    return ipcRenderer.invoke("desktop:get-startup-snapshot");
  },
  exportStartupLog(context?: Record<string, unknown>) {
    return ipcRenderer.invoke("desktop:export-startup-log", context);
  },
  exportUpdateLog() {
    return ipcRenderer.invoke("desktop:export-update-log");
  },
  getLanguagePreference() {
    return ipcRenderer.invoke("desktop:get-language-preference");
  },
  setLanguagePreference(language: "en" | "vi") {
    return ipcRenderer.invoke("desktop:set-language-preference", language);
  },
  setCloseConfirmationReady(ready: boolean) {
    return ipcRenderer.invoke("desktop:set-close-confirmation-ready", ready);
  },
  openTerminalWindow() {
    return ipcRenderer.invoke("desktop:open-terminal-window");
  },
  saveTestStorageSettings(settings: Record<string, unknown>) {
    return ipcRenderer.invoke("desktop:save-test-storage-settings", settings);
  },
  selectFolder() {
    return ipcRenderer.invoke("desktop:select-folder");
  },
  selectModelFile() {
    return ipcRenderer.invoke("desktop:select-model-file");
  },
  onTerminalLog(callback: (message: string) => void) {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on("terminal-log", listener);

    return () => {
      ipcRenderer.removeListener("terminal-log", listener);
    };
  },
  onShutdownStatus(callback: (message: string) => void) {
    const listener = (_event: unknown, message: string) => callback(message);
    ipcRenderer.on("desktop-shutdown-status", listener);

    return () => {
      ipcRenderer.removeListener("desktop-shutdown-status", listener);
    };
  },
  onShutdownStage(callback: (stage: Record<string, unknown>) => void) {
    const listener = (_event: unknown, stage: Record<string, unknown>) =>
      callback(stage);
    ipcRenderer.on("desktop-shutdown-stage", listener);

    return () => {
      ipcRenderer.removeListener("desktop-shutdown-stage", listener);
    };
  },
  onCloseRequested(callback: () => void) {
    const listener = () => callback();
    ipcRenderer.on("desktop-close-requested", listener);

    return () => {
      ipcRenderer.removeListener("desktop-close-requested", listener);
    };
  },
  onStartupSnapshot(callback: (payload: Record<string, unknown>) => void) {
    const listener = (_event: unknown, payload: Record<string, unknown>) =>
      callback(payload);
    ipcRenderer.on("desktop-startup-snapshot", listener);

    return () => {
      ipcRenderer.removeListener("desktop-startup-snapshot", listener);
    };
  },
  onUpdateStatus(callback: (payload: Record<string, unknown>) => void) {
    const listener = (_event: unknown, payload: Record<string, unknown>) =>
      callback(payload);
    ipcRenderer.on("desktop-update-status", listener);

    return () => {
      ipcRenderer.removeListener("desktop-update-status", listener);
    };
  },
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
