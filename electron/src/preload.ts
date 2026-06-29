import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("ocrDesktop", {
  applyWindowSettings(settings: Record<string, unknown>) {
    return ipcRenderer.invoke("desktop:apply-window-settings", settings);
  },
  exitApp() {
    return ipcRenderer.invoke("desktop:exit-app");
  },
  getTestStorageSettings() {
    return ipcRenderer.invoke("desktop:get-test-storage-settings");
  },
  getWindowSettings() {
    return ipcRenderer.invoke("desktop:get-window-settings");
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
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node,
  },
});
