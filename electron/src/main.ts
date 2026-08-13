import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Notification,
  shell,
  type OpenDialogOptions,
} from "electron";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { registerAutoUpdater } from "./auto-updater";
import {
  getLocalMachineIdentity,
  type LocalMachineIdentity,
} from "./license/local-machine-identity";
import {
  loadMachineCredential,
  saveMachineCredential,
} from "./license/machine-credential-store";
import { ServiceManager } from "./service-manager";
import { createStartupDocument } from "./startup-page";
import { UpdateRecoveryManager } from "./update-recovery";
import {
  createPendingStartupStages,
  type StartupHardwareStageUpdate,
  type StartupPhase,
  type StartupServiceStageUpdate,
  type StartupSnapshot,
  type StartupStageId,
  type StartupStageUpdate,
} from "./startup-types";
import type { DesktopExitMode, ShutdownStageUpdate } from "./shutdown-types";

type WindowPreset = "factory" | "hd" | "fullHd" | "fourThree" | "custom";

type DesktopWindowSettings = {
  fullscreen: boolean;
  frameless: boolean;
  alwaysOnTop: boolean;
  zoomFactor: number;
  windowPreset: WindowPreset;
  width: number;
  height: number;
};

type DesktopTestStorageSettings = {
  testImageSaveFolderPath: string | null;
};

type DesktopLanguage = "en" | "vi";

type StartupLogContext = {
  error?: string | null;
  stages?: StartupStageUpdate[];
};

const defaultWindowSettings: DesktopWindowSettings = {
  fullscreen: false,
  frameless: false,
  alwaysOnTop: false,
  zoomFactor: 1,
  windowPreset: "factory",
  width: 1280,
  height: 1024,
};

const defaultTestStorageSettings: DesktopTestStorageSettings = {
  testImageSaveFolderPath: null,
};

const terminalLogLimit = 1200;
const terminalShortcutPresses = 5;
const terminalShortcutWindowMs = 4_000;

let rendererUrl =
  process.env.ELECTRON_RENDERER_URL ??
  `http://127.0.0.1:${process.env.FRONTEND_PORT ?? "3970"}/`;

let mainWindow: BrowserWindow | null = null;
let terminalWindow: BrowserWindow | null = null;
let serviceManager: ServiceManager | null = null;
let updateRecoveryManager: UpdateRecoveryManager | null = null;
let isQuitting = false;
let closeConfirmationReady = false;
let shutdownPromise: Promise<{ success: boolean }> | null = null;
let restartPromise: Promise<{ success: boolean }> | null = null;
let windowSettings: DesktopWindowSettings = defaultWindowSettings;
let testStorageSettings: DesktopTestStorageSettings =
  defaultTestStorageSettings;
let desktopLanguage: DesktopLanguage = "vi";
let terminalShortcutCount = 0;
let terminalShortcutLastAt = 0;
const terminalLogs: string[] = [];
let startupError: string | null = null;
let startupPhase: StartupPhase = "running";
let localMachineIdentity: LocalMachineIdentity | null = null;
let dongilBootstrapTimer: NodeJS.Timeout | null = null;
let dongilBootstrapPromise: Promise<void> | null = null;
let startupStages = new Map<StartupStageId, StartupStageUpdate>(
  createPendingStartupStages().map((stage) => [stage.id, stage]),
);

if (relaunchAsAdminIfNeeded()) {
  app.exit(0);
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) {
      return;
    }

    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }

    mainWindow.focus();
  });

  app.whenReady().then(startDesktopApp).catch(showFatalStartupError);
}

async function startDesktopApp() {
  const runtimeRoot = getRuntimeRoot();
  loadRuntimeEnv(runtimeRoot);
  serviceManager = new ServiceManager(runtimeRoot);
  updateRecoveryManager = new UpdateRecoveryManager({
    onLog: showTerminalLog,
    programDataRoot: getProgramDataRoot(),
    runtimeRoot,
    userDataRoot: app.getPath("userData"),
  });
  windowSettings = loadWindowSettings();
  testStorageSettings = loadTestStorageSettings();
  desktopLanguage = loadDesktopLanguage();
  resetStartupState();
  registerDesktopIpc();
  registerAutoUpdater({
    armInstallFallback: armUpdateInstallerFallback,
    authorize: authorizeUpdateAccess,
    getWindow: () => mainWindow,
    onLog: showTerminalLog,
    prepareInstall: prepareUpdateInstall,
  });

  createMainWindow();
  showStartupPage();
  await updateRecoveryManager.markStartupValidationStarted();
  serviceManager.onLog((message) => {
    showTerminalLog(message);
  });

  const startupResult = await serviceManager.startAll(
    (message) => {
      showTerminalLog(`[status] ${message}`);
    },
    emitStartupServiceStage,
    runRemainingStartupChecks,
  );
  const frontendUrl =
    process.env.ELECTRON_RENDERER_URL ?? serviceManager.getFrontendUrl();

  if (!startupResult) {
    await updateRecoveryManager.markStartupHealthy();
    return;
  }

  startupPhase = startupResult.hardwareWarning ? "warning" : "finished";
  broadcastStartupSnapshot();
  await updateRecoveryManager.markStartupHealthy();
  rendererUrl = new URL(
    startupResult.requiresAdminSetup ? "setup" : "login",
    frontendUrl,
  ).toString();

  await loadRendererUrl();
}

async function authorizeUpdateAccess(accessToken: string) {
  if (!accessToken || !serviceManager)
    throw new Error("Update authorization is required.");
  const response = await fetch(
    new URL("auth/me", serviceManager.getBackendUrl()),
    {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!response.ok) throw new Error("Update authorization failed.");
  const payload = (await response.json()) as {
    data?: { user?: { role?: string } };
  };
  const role = payload.data?.user?.role;
  if (role !== "admin" && role !== "dev") {
    throw new Error(
      "Only administrator and developer roles can manage updates.",
    );
  }
}

function createMainWindow() {
  const settings = windowSettings;
  const window = new BrowserWindow({
    width: settings.width,
    height: settings.height,
    minWidth: 1024,
    minHeight: 720,
    show: false,
    frame: !settings.frameless,
    fullscreen: settings.fullscreen,
    alwaysOnTop: settings.alwaysOnTop,
    backgroundColor: "#f1f5f9",
    autoHideMenuBar: true,
    icon: getApplicationIconPath(),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.js"),
      sandbox: true,
    },
  });
  mainWindow = window;
  window.webContents.setZoomFactor(settings.zoomFactor);

  window.once("ready-to-show", () => {
    window.show();
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });
  bindTerminalShortcut(window);

  window.webContents.on(
    "did-start-navigation",
    (_event, _url, isInPlace, isMainFrame) => {
      if (isMainFrame && !isInPlace) {
        closeConfirmationReady = false;
      }
    },
  );

  window.on("close", (event) => {
    if (isQuitting || !serviceManager) {
      return;
    }

    event.preventDefault();

    if (requestRendererCloseConfirmation(window)) {
      return;
    }

    void requestAppShutdown();
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function registerDesktopIpc() {
  ipcMain.handle(
    "desktop:get-test-storage-settings",
    () => testStorageSettings,
  );
  ipcMain.handle("desktop:get-window-settings", () => windowSettings);
  ipcMain.handle("desktop:get-terminal-logs", () => [...terminalLogs]);
  ipcMain.handle("desktop:get-startup-snapshot", () => getStartupSnapshot());
  ipcMain.handle(
    "desktop:get-update-recovery",
    () => updateRecoveryManager?.getNotice() ?? null,
  );
  ipcMain.handle("desktop:acknowledge-update-recovery", async () => {
    await updateRecoveryManager?.acknowledgeNotice();
    return { success: true };
  });
  ipcMain.handle("desktop:get-language-preference", () => desktopLanguage);
  ipcMain.handle(
    "desktop:set-close-confirmation-ready",
    (event, ready: boolean) => {
      if (
        !mainWindow ||
        mainWindow.isDestroyed() ||
        event.sender !== mainWindow.webContents
      ) {
        return { success: false };
      }

      closeConfirmationReady = ready === true;
      return { success: true };
    },
  );
  ipcMain.handle(
    "desktop:set-language-preference",
    (_event, language: DesktopLanguage) => {
      if (language !== "en" && language !== "vi") return desktopLanguage;
      desktopLanguage = language;
      saveDesktopLanguage(language);
      broadcastStartupSnapshot();
      return desktopLanguage;
    },
  );
  ipcMain.handle(
    "desktop:export-startup-log",
    (_event, context?: StartupLogContext) => exportStartupLog(context),
  );
  ipcMain.handle("desktop:open-terminal-window", () => {
    createTerminalWindow();
    showTerminalLog("[terminal] Opened from dev settings.");
    return { success: true };
  });
  ipcMain.handle(
    "desktop:apply-window-settings",
    (_event, nextSettings: Partial<DesktopWindowSettings>) => {
      return applyWindowSettings(nextSettings);
    },
  );
  ipcMain.handle(
    "desktop:save-test-storage-settings",
    (_event, nextSettings: Partial<DesktopTestStorageSettings>) => {
      testStorageSettings = normalizeTestStorageSettings({
        ...testStorageSettings,
        ...nextSettings,
      });
      saveTestStorageSettings(testStorageSettings);
      return testStorageSettings;
    },
  );
  ipcMain.handle("desktop:select-folder", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "Select test image folder",
      properties: ["openDirectory", "createDirectory", "promptToCreate"],
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

    return {
      canceled: result.canceled,
      folderPath: result.filePaths[0] ?? null,
    };
  });
  ipcMain.handle("desktop:select-model-file", async () => {
    const dialogOptions: OpenDialogOptions = {
      title: "Select OCR model",
      properties: ["openFile"],
      filters: [
        {
          name: "Model files",
          extensions: [
            "onnx",
            "pt",
            "pth",
            "engine",
            "xml",
            "bin",
            "trt",
            "tflite",
            "pb",
          ],
        },
        { name: "All files", extensions: ["*"] },
      ],
    };
    const result =
      mainWindow && !mainWindow.isDestroyed()
        ? await dialog.showOpenDialog(mainWindow, dialogOptions)
        : await dialog.showOpenDialog(dialogOptions);

    return {
      canceled: result.canceled,
      filePath: result.filePaths[0] ?? null,
    };
  });
  ipcMain.handle("desktop:exit-app", () => {
    return requestAppShutdown("app-and-hardware");
  });
  ipcMain.handle("desktop:restart-app", () => {
    return requestAppRestart();
  });
  ipcMain.handle("desktop:export-update-log", () => exportUpdateLog());
}

function emitStartupHardwareStage(stage: StartupHardwareStageUpdate) {
  updateStartupStage(stage);
}

function emitStartupServiceStage(stage: StartupServiceStageUpdate) {
  updateStartupStage(stage);
}

function resetStartupState() {
  startupError = null;
  startupPhase = "running";
  startupStages = new Map(
    createPendingStartupStages().map((stage) => [stage.id, stage]),
  );
}

function updateStartupStage(stage: StartupStageUpdate) {
  startupStages.set(stage.id, {
    ...startupStages.get(stage.id),
    ...stage,
  });
  broadcastStartupSnapshot();
}

function getStartupSnapshot(): StartupSnapshot {
  return {
    error: startupError,
    language: desktopLanguage,
    phase: startupPhase,
    stages: [...startupStages.values()],
  };
}

function broadcastStartupSnapshot() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send("desktop-startup-snapshot", getStartupSnapshot());
}

async function runRemainingStartupChecks() {
  if (!serviceManager) {
    throw new Error("Service manager is unavailable");
  }

  const backendUrl = serviceManager.getBackendUrl();
  updateStartupStage({ id: "license", status: "running" });

  const setupPromise = requestStartupJson<{
    data?: { requiresAdminSetup?: boolean };
  }>(new URL("setup/status", backendUrl).toString());
  const licensePromise = requestStartupJson<{
    data?: {
      code?: string | null;
      donglePresent?: boolean | null;
      licensed?: boolean | null;
      message?: string | null;
      status?: string;
    };
  }>(new URL("system/license/public", backendUrl).toString());
  const hardwarePromise = serviceManager.prepareStartupHardware(
    undefined,
    emitStartupHardwareStage,
  );

  const [setupResult, licenseResult, hardwareResult] = await Promise.allSettled(
    [setupPromise, licensePromise, hardwarePromise],
  );

  if (setupResult.status === "rejected") {
    await cleanupBlockedStartupHardware();
    throw setupResult.reason;
  }

  if (licenseResult.status === "rejected") {
    await cleanupBlockedStartupHardware();
    blockStartup("license", errorMessage(licenseResult.reason));
    return null;
  }

  const license = licenseResult.value;
  if (license.data?.licensed !== true || license.data?.donglePresent !== true) {
    updateStartupStage({ id: "license", status: "failed" });
    const reason = [license.data?.code, license.data?.message]
      .filter(Boolean)
      .join(": ");
    await cleanupBlockedStartupHardware();
    blockStartup("license", reason || "License dongle is unavailable");
    return null;
  }

  let identity: LocalMachineIdentity;
  try {
    identity = await getLocalMachineIdentity();
  } catch (error) {
    updateStartupStage({ id: "license", status: "failed" });
    await cleanupBlockedStartupHardware();
    blockStartup("license", `Machine identity check failed: ${errorMessage(error)}`);
    return null;
  }

  updateStartupStage({ id: "license", status: "done" });
  startDongilBootstrapLoop(identity);

  const requiresAdminSetup =
    setupResult.value.data?.requiresAdminSetup === true;
  if (hardwareResult.status === "rejected") {
    showTerminalLog(
      `[startup] hardware preparation failed: ${errorMessage(hardwareResult.reason)}`,
    );
    return { hardwareWarning: true, requiresAdminSetup };
  }

  const hardwareWarning = hardwareResult.value.stages.some(
    (stage) => stage.status === "failed" || stage.status === "warning",
  );
  return { hardwareWarning, requiresAdminSetup };
}

function startDongilBootstrapLoop(identity: LocalMachineIdentity) {
  localMachineIdentity = identity;
  void bootstrapDongilSync();
  if (dongilBootstrapTimer) return;
  dongilBootstrapTimer = setInterval(() => void bootstrapDongilSync(), 30_000);
}

function bootstrapDongilSync() {
  if (dongilBootstrapPromise) return dongilBootstrapPromise;
  dongilBootstrapPromise = performDongilBootstrap()
    .catch((error) => {
      showTerminalLog(`[dongil] bootstrap deferred: ${errorMessage(error)}`);
    })
    .finally(() => {
      dongilBootstrapPromise = null;
    });
  return dongilBootstrapPromise;
}

async function performDongilBootstrap() {
  const identity = localMachineIdentity;
  if (!identity || !serviceManager || isQuitting) return;

  const serverUrl = process.env.DONGIL_SERVER_URL?.trim().replace(/\/+$/, "");
  if (!serverUrl) return;

  const credential = loadMachineCredential(identity.machineId, serverUrl);
  try {
    const response = await serviceManager.bootstrapDongilSync({
      serverUrl,
      machineId: identity.machineId,
      machineTypeCode:
        process.env.DONGIL_MACHINE_TYPE_CODE?.trim() || "WASHING_MACHINE",
      licenseStatus: identity.licenseStatus,
      appVersion: app.getVersion(),
      credential: credential ?? undefined,
    });
    const issuedCredential = response.data?.issuedCredential;
    if (issuedCredential) {
      saveMachineCredential(identity.machineId, serverUrl, issuedCredential);
    }
    const state = response.data?.state ?? "UNKNOWN";
    showTerminalLog(
      `[dongil] state=${state}; machine=${identity.machineId}; authorization=DONGLE`,
    );
  } catch (error) {
    showTerminalLog(`[dongil] bootstrap deferred: ${errorMessage(error)}`);
  }
}

async function cleanupBlockedStartupHardware() {
  if (!serviceManager) return;
  try {
    await serviceManager.abortStartupHardware();
    showTerminalLog("[startup] blocked hardware cleanup completed");
  } catch (error) {
    showTerminalLog(
      `[startup] blocked hardware cleanup failed: ${errorMessage(error)}`,
    );
  }
}

function blockStartup(id: StartupStageId, error: string) {
  startupError = error;
  startupPhase = "blocked";
  updateStartupStage({ id, status: "failed" });
  showTerminalLog(`[startup] blocked at ${id}: ${error}`);
}

async function requestStartupJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error((await response.text()) || `${response.status}`);
  }
  return (await response.json()) as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function exportStartupLog(context?: StartupLogContext) {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(".", "-");
  const options = {
    title:
      desktopLanguage === "vi" ? "Lưu nhật ký khởi động" : "Save startup log",
    defaultPath: join(
      app.getPath("documents"),
      `AHSO-OCR-startup-${timestamp}.log`,
    ),
    filters: [{ name: "Log", extensions: ["log", "txt"] }],
  };
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);

  if (result.canceled || !result.filePath) {
    return { canceled: true, filePath: null };
  }

  const stageSnapshot = context?.stages ?? getStartupSnapshot().stages;
  const content = [
    "AHSO OCR startup diagnostic log",
    `Exported at: ${new Date().toISOString()}`,
    `Platform: ${process.platform}`,
    `Electron: ${process.versions.electron}`,
    `Node: ${process.versions.node}`,
    `Startup stages: ${JSON.stringify(stageSnapshot)}`,
    `Blocking error: ${context?.error ?? startupError ?? "none"}`,
    "",
    ...terminalLogs,
    "",
  ].join("\r\n");
  writeFileSync(result.filePath, content, "utf8");
  return { canceled: false, filePath: result.filePath };
}

function getRuntimeRoot() {
  if (app.isPackaged) {
    return join(process.resourcesPath, "runtime");
  }

  return resolve(__dirname, "..", "..");
}

function getApplicationIconPath() {
  const iconPath = app.isPackaged
    ? join(process.resourcesPath, "logo", "applogo.ico")
    : resolve(__dirname, "../../shared/logo/applogo.ico");

  return existsSync(iconPath) ? iconPath : undefined;
}

function loadRuntimeEnv(runtimeRoot: string) {
  const envPaths = app.isPackaged
    ? [
        join(getProgramDataRoot(), ".env"),
        join(runtimeRoot, ".env"),
        join(runtimeRoot, "backend", ".env"),
      ]
    : [join(runtimeRoot, ".env"), join(runtimeRoot, "backend", ".env")];

  for (const envPath of envPaths) {
    if (!existsSync(envPath)) {
      continue;
    }

    const envContent = readRuntimeEnvFile(envPath, app.isPackaged);
    if (!envContent) {
      continue;
    }

    const env = parseEnvFile(envContent);

    for (const [key, value] of Object.entries(env)) {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    }
  }

  if (app.isPackaged) {
    process.env.OCR_PACKAGED_RUNTIME = "true";
  }
}

function readRuntimeEnvFile(envPath: string, isRequired: boolean) {
  try {
    return readFileSync(envPath, "utf8");
  } catch (error) {
    if (isRequired) {
      throw createRuntimeEnvReadError(envPath, error);
    }

    console.warn(`Could not read development env file ${envPath}:`, error);
    return null;
  }
}

function createRuntimeEnvReadError(envPath: string, error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : "Unknown error while reading runtime environment file.";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code)
      : null;

  if (code === "EACCES" || code === "EPERM") {
    return new Error(
      [
        `Cannot read runtime environment file: ${envPath}`,
        "The file exists, but Windows denied access to the desktop app.",
        "Run the installer bootstrap again or repair the file ACL so the signed-in app user can read this .env file.",
        `Original error: ${message}`,
      ].join(" "),
    );
  }

  return new Error(
    `Cannot read runtime environment file ${envPath}: ${message}`,
  );
}

function parseEnvFile(content: string) {
  const result: Record<string, string> = {};

  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");

    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    result[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return result;
}

function getProgramDataRoot() {
  const basePath =
    process.env.PROGRAMDATA ??
    (process.platform === "win32"
      ? "C:\\ProgramData"
      : app.getPath("userData"));

  return join(basePath, "AHSO OCR");
}

function applyWindowSettings(nextSettings: Partial<DesktopWindowSettings>) {
  windowSettings = normalizeWindowSettings({
    ...windowSettings,
    ...nextSettings,
  });
  saveWindowSettings(windowSettings);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return windowSettings;
  }

  mainWindow.setAlwaysOnTop(windowSettings.alwaysOnTop);
  mainWindow.setFullScreen(windowSettings.fullscreen);
  mainWindow.webContents.setZoomFactor(windowSettings.zoomFactor);

  if (!windowSettings.fullscreen) {
    mainWindow.setSize(windowSettings.width, windowSettings.height, true);
    mainWindow.center();
  }

  return windowSettings;
}

function getWindowSettingsPath() {
  return join(app.getPath("userData"), "window-settings.json");
}

function getTestStorageSettingsPath() {
  return join(app.getPath("userData"), "test-storage-settings.json");
}

function getLanguageSettingsPath() {
  return join(app.getPath("userData"), "language-settings.json");
}

function loadDesktopLanguage(): DesktopLanguage {
  const settingsPath = getLanguageSettingsPath();
  if (existsSync(settingsPath)) {
    try {
      const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as {
        language?: unknown;
      };
      if (parsed.language === "en" || parsed.language === "vi") {
        return parsed.language;
      }
    } catch {
      // Fall back to the operating system locale.
    }
  }
  return app.getLocale().toLowerCase().startsWith("vi") ? "vi" : "en";
}

function saveDesktopLanguage(language: DesktopLanguage) {
  writeFileSync(
    getLanguageSettingsPath(),
    JSON.stringify({ language }, null, 2),
    "utf8",
  );
}

function loadWindowSettings() {
  const settingsPath = getWindowSettingsPath();

  if (!existsSync(settingsPath)) {
    return defaultWindowSettings;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(settingsPath, "utf8"),
    ) as Partial<DesktopWindowSettings>;
    return normalizeWindowSettings({
      ...defaultWindowSettings,
      ...parsed,
    });
  } catch {
    return defaultWindowSettings;
  }
}

function loadTestStorageSettings() {
  const settingsPath = getTestStorageSettingsPath();

  if (!existsSync(settingsPath)) {
    return defaultTestStorageSettings;
  }

  try {
    const parsed = JSON.parse(
      readFileSync(settingsPath, "utf8"),
    ) as Partial<DesktopTestStorageSettings>;
    return normalizeTestStorageSettings({
      ...defaultTestStorageSettings,
      ...parsed,
    });
  } catch {
    return defaultTestStorageSettings;
  }
}

function saveWindowSettings(settings: DesktopWindowSettings) {
  writeFileSync(getWindowSettingsPath(), JSON.stringify(settings, null, 2));
}

function saveTestStorageSettings(settings: DesktopTestStorageSettings) {
  writeFileSync(
    getTestStorageSettingsPath(),
    JSON.stringify(settings, null, 2),
  );
}

function normalizeWindowSettings(settings: DesktopWindowSettings) {
  const presetSize = resolvePresetSize(settings.windowPreset);
  const width =
    settings.windowPreset === "custom"
      ? clamp(settings.width, 1024, 3840)
      : presetSize.width;
  const height =
    settings.windowPreset === "custom"
      ? clamp(settings.height, 720, 2160)
      : presetSize.height;

  return {
    fullscreen: Boolean(settings.fullscreen),
    frameless: Boolean(settings.frameless),
    alwaysOnTop: Boolean(settings.alwaysOnTop),
    zoomFactor: clamp(settings.zoomFactor, 0.75, 1.5),
    windowPreset: settings.windowPreset,
    width,
    height,
  };
}

function normalizeTestStorageSettings(
  settings: Partial<DesktopTestStorageSettings>,
): DesktopTestStorageSettings {
  return {
    testImageSaveFolderPath:
      typeof settings.testImageSaveFolderPath === "string" &&
      settings.testImageSaveFolderPath.trim().length > 0
        ? settings.testImageSaveFolderPath.trim()
        : null,
  };
}

function resolvePresetSize(preset: WindowPreset) {
  switch (preset) {
    case "hd":
      return { width: 1366, height: 768 };
    case "fullHd":
      return { width: 1920, height: 1080 };
    case "fourThree":
      return { width: 1280, height: 960 };
    case "factory":
    case "custom":
    default:
      return { width: 1280, height: 1024 };
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function createTerminalWindow() {
  if (terminalWindow && !terminalWindow.isDestroyed()) {
    if (terminalWindow.isMinimized()) {
      terminalWindow.restore();
    }

    terminalWindow.show();
    terminalWindow.focus();
    return terminalWindow;
  }

  const window = new BrowserWindow({
    width: 980,
    height: 520,
    minWidth: 720,
    minHeight: 320,
    show: false,
    backgroundColor: "#020617",
    autoHideMenuBar: true,
    icon: getApplicationIconPath(),
    title: "OCR Terminal",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: join(__dirname, "preload.js"),
      sandbox: true,
    },
  });
  terminalWindow = window;

  window.once("ready-to-show", () => {
    window.show();
  });

  window.on("closed", () => {
    if (terminalWindow === window) {
      terminalWindow = null;
    }
  });

  void loadWindowUrl(
    window,
    `data:text/html;charset=utf-8,${encodeURIComponent(createTerminalDocument())}`,
  );

  return window;
}

function showStartupPage() {
  if (!mainWindow || mainWindow.isDestroyed()) return;

  const document = createStartupDocument(getStartupSnapshot());
  void loadWindowUrl(
    mainWindow,
    `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
  );
}

function showFatalStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Fatal startup error:", error);
  const runningStage = [...startupStages.values()].find(
    (stage) => stage.status === "running",
  );
  startupError = message;
  startupPhase = "blocked";
  if (runningStage) {
    startupStages.set(runningStage.id, { ...runningStage, status: "failed" });
  }
  showStartupPage();
  showTerminalLog(`[fatal] ${message}`);
  void rollbackFailedUpdate(error);
}

async function rollbackFailedUpdate(error: unknown) {
  if (!updateRecoveryManager) return;

  try {
    await serviceManager?.stopOwned(showTerminalLog);
    await serviceManager?.stopManagedPorts(showTerminalLog);
    const rollbackStarted =
      await updateRecoveryManager.rollbackAfterStartupFailure(error);
    if (rollbackStarted) {
      isQuitting = true;
      app.exit(1);
    }
  } catch (rollbackError) {
    const message = errorMessage(rollbackError);
    startupError = `${errorMessage(error)} Rollback failed: ${message}`;
    showTerminalLog(`[update] Rollback failed: ${message}`);
    showStartupPage();
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (!mainWindow) {
    const window = createMainWindow();
    void loadWindowUrl(window, rendererUrl);
  }
});

app.on("before-quit", (event) => {
  if (dongilBootstrapTimer) {
    clearInterval(dongilBootstrapTimer);
    dongilBootstrapTimer = null;
  }
  if (isQuitting || !serviceManager) {
    return;
  }

  event.preventDefault();
  void requestAppShutdown();
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    reportShutdownStatus(`Received ${signal}; shutting down services...`);
    void requestAppShutdown();
  });
}

async function requestAppShutdown(mode: DesktopExitMode = "app-and-hardware") {
  if (shutdownPromise) {
    return shutdownPromise;
  }

  if (restartPromise) {
    return restartPromise;
  }

  shutdownPromise = shutdownAndQuit(mode).catch((error) => {
    shutdownPromise = null;
    throw error;
  });
  return shutdownPromise;
}

async function requestAppRestart() {
  if (restartPromise) {
    return restartPromise;
  }

  if (shutdownPromise) {
    return shutdownPromise;
  }

  restartPromise = shutdownAndRestart();
  return restartPromise;
}

async function prepareUpdateInstall(targetVersion: string) {
  if (!updateRecoveryManager || !serviceManager) {
    throw new Error("Desktop update services are not ready.");
  }

  await updateRecoveryManager.prepare(targetVersion);
  isQuitting = true;
  reportShutdownStatus("Preparing machine and local services for update...");
  try {
    await serviceManager.stopOwned(reportShutdownStatus);
    await serviceManager.stopManagedPorts(reportShutdownStatus);
    reportShutdownStatus("Local services are ready for update.");
  } catch (error) {
    isQuitting = false;
    throw error;
  }
}

async function armUpdateInstallerFallback() {
  if (!updateRecoveryManager) {
    throw new Error("Desktop update recovery is not ready.");
  }

  await updateRecoveryManager.armInstallerFailureRollback();
}

function requestRendererCloseConfirmation(window: BrowserWindow) {
  if (
    !closeConfirmationReady ||
    window.isDestroyed() ||
    window.webContents.isDestroyed()
  ) {
    return false;
  }

  try {
    if (window.isMinimized()) {
      window.restore();
    }

    window.show();
    window.focus();
    window.webContents.send("desktop-close-requested");
    return true;
  } catch (error) {
    console.error("Error requesting close confirmation:", error);
    return false;
  }
}

async function shutdownAndQuit(mode: DesktopExitMode) {
  if (mode === "app-and-hardware") {
    isQuitting = false;
    reportShutdownStatus("Preparing hardware shutdown...");
    try {
      await serviceManager?.shutdownHardware(reportShutdownStage);
    } catch (error) {
      const message = errorMessage(error);
      console.error("Hardware shutdown failed; continuing app shutdown:", error);
      reportShutdownStatus(
        "Hardware shutdown failed. Closing the application anyway.",
      );
      showHardwareShutdownWarning(message);
    }
  }

  isQuitting = true;
  reportShutdownStage({ id: "app", status: "running" });
  reportShutdownStatus("Preparing shutdown...");

  try {
    await serviceManager?.stopOwned(reportShutdownStatus);
    await serviceManager?.stopManagedPorts(reportShutdownStatus);
    reportShutdownStage({ id: "app", status: "done" });
    reportShutdownStatus("Shutdown complete.");
  } catch (error) {
    reportShutdownStage({
      id: "app",
      status: "failed",
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    app.quit();
  }

  return { success: true };
}

function showHardwareShutdownWarning(message: string) {
  if (!Notification.isSupported()) {
    return;
  }

  const isVietnamese = desktopLanguage === "vi";
  new Notification({
    title: isVietnamese
      ? "Không thể tắt hoàn toàn phần cứng"
      : "Hardware shutdown was incomplete",
    body: isVietnamese
      ? "Ứng dụng sẽ đóng. Vui lòng kiểm tra camera và PLC trước khi khởi động lại."
      : "The application will close. Check the camera and PLC before restarting.",
    silent: false,
  }).show();
  showTerminalLog(`[shutdown] Hardware warning: ${message}`);
}

async function shutdownAndRestart() {
  isQuitting = true;
  reportShutdownStatus("Restarting app...");

  try {
    await serviceManager?.stopOwned(reportShutdownStatus);
    await serviceManager?.stopManagedPorts(reportShutdownStatus);
    reportShutdownStatus("Restarting app...");
  } finally {
    app.relaunch();
    app.exit(0);
  }

  return { success: true };
}

async function exportUpdateLog() {
  const timestamp = new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(".", "-");
  const options = {
    title:
      desktopLanguage === "vi" ? "Lưu nhật ký cập nhật" : "Save update log",
    defaultPath: join(
      app.getPath("documents"),
      `AHSO-OCR-update-${timestamp}.log`,
    ),
    filters: [{ name: "Log", extensions: ["log", "txt"] }],
  };
  const result =
    mainWindow && !mainWindow.isDestroyed()
      ? await dialog.showSaveDialog(mainWindow, options)
      : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath)
    return { canceled: true, filePath: null };

  writeFileSync(
    result.filePath,
    [
      "AHSO OCR update diagnostic log",
      `Exported at: ${new Date().toISOString()}`,
      `App version: ${app.getVersion()}`,
      `Platform: ${process.platform}`,
      "",
      ...terminalLogs.filter(
        (line) => line.includes("[update]") || line.includes("[fatal]"),
      ),
      "",
    ].join("\r\n"),
    "utf8",
  );
  return { canceled: false, filePath: result.filePath };
}

function showTerminalLog(message: string) {
  terminalLogs.push(message);

  if (terminalLogs.length > terminalLogLimit) {
    terminalLogs.splice(0, terminalLogs.length - terminalLogLimit);
  }

  sendTerminalLog(mainWindow, message);
  sendTerminalLog(terminalWindow, message);
}

function sendTerminalLog(window: BrowserWindow | null, message: string) {
  if (!window || window.isDestroyed()) {
    return;
  }

  try {
    if (!window.webContents.isDestroyed()) {
      window.webContents.send("terminal-log", message);
    }
  } catch (e) {
    console.error("Error sending terminal log:", e);
  }
}

function bindTerminalShortcut(window: BrowserWindow) {
  window.webContents.on("before-input-event", (event, input) => {
    const isF12 =
      input.type === "keyDown" && (input.key === "F12" || input.code === "F12");

    if (!isF12) {
      return;
    }

    event.preventDefault();
    handleTerminalShortcutPress();
  });
}

function handleTerminalShortcutPress() {
  const now = Date.now();

  if (now - terminalShortcutLastAt > terminalShortcutWindowMs) {
    terminalShortcutCount = 0;
  }

  terminalShortcutLastAt = now;
  terminalShortcutCount += 1;

  if (terminalShortcutCount < terminalShortcutPresses) {
    return;
  }

  terminalShortcutCount = 0;
  createTerminalWindow();
  showTerminalLog("[terminal] Opened by F12 shortcut.");
}

function createTerminalDocument() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>OCR Terminal</title>
    <style>
      :root {
        color-scheme: dark;
      }
      body {
        margin: 0;
        background: #020617;
        color: #e2e8f0;
        font-family: Consolas, "Courier New", monospace;
      }
      header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        padding: 12px 16px;
        border-bottom: 1px solid #1e293b;
        background: #0f172a;
      }
      h1 {
        margin: 0;
        font-size: 14px;
        font-weight: 600;
      }
      button {
        border: 1px solid #334155;
        background: #111827;
        color: #e2e8f0;
        padding: 8px 12px;
        font: inherit;
        cursor: pointer;
      }
      #log {
        height: calc(100vh - 54px);
        overflow: auto;
        padding: 14px 16px 24px;
        white-space: pre-wrap;
        word-break: break-word;
        font-size: 13px;
        line-height: 1.45;
      }
      .muted {
        color: #94a3b8;
      }
    </style>
  </head>
  <body>
    <header>
      <h1>OCR Terminal</h1>
      <button id="clear" type="button">Clear</button>
    </header>
    <div id="log"><span class="muted">Waiting for service logs...</span></div>
    <script>
      const log = document.getElementById("log");
      const clear = document.getElementById("clear");
      let isFirstLine = true;

      function appendLine(message) {
        if (isFirstLine) {
          log.textContent = "";
          isFirstLine = false;
        }

        log.textContent += message + "\\n";
        log.scrollTop = log.scrollHeight;
      }
      clear.addEventListener("click", () => {
        log.textContent = "";
        isFirstLine = true;
      });

      window.ocrDesktop.getTerminalLogs().then((messages) => {
        if (messages.length === 0) {
          return;
        }

        messages.forEach(appendLine);
      });

      window.ocrDesktop.onTerminalLog(appendLine);
    </script>
  </body>
</html>`;
}

async function loadRendererUrl() {
  const attempts = 5;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const loaded = await loadWindowUrl(mainWindow, rendererUrl, {
      ignoreAborted: false,
    });

    if (loaded) {
      return;
    }

    showTerminalLog(
      `[startup] renderer navigation retry ${attempt}/${attempts}`,
    );
    await delay(1_000);
  }

  throw new Error(`Failed to open renderer: ${rendererUrl}`);
}

async function loadWindowUrl(
  window: BrowserWindow | null,
  url: string,
  options: { ignoreAborted?: boolean } = {},
) {
  if (!window || window.isDestroyed() || window.webContents.isDestroyed()) {
    return false;
  }

  try {
    await window.loadURL(url);
    return true;
  } catch (error) {
    if (isIgnoredNavigationAbort(error, options.ignoreAborted ?? true)) {
      return false;
    }

    console.error(error);
    return false;
  }
}

function isIgnoredNavigationAbort(error: unknown, ignoreAborted: boolean) {
  if (!ignoreAborted) {
    return false;
  }

  if (!(error instanceof Error)) {
    return false;
  }

  const navigationError = error as { code?: unknown; errno?: unknown };

  return navigationError.code === "ERR_ABORTED" || navigationError.errno === -3;
}

function reportShutdownStatus(message: string) {
  showTerminalLog(`[shutdown] ${message}`);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  try {
    if (!mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send("desktop-shutdown-status", message);
    }
  } catch (e) {
    console.error("Error sending shutdown status:", e);
  }
}

function reportShutdownStage(stage: ShutdownStageUpdate) {
  showTerminalLog(
    `[shutdown] ${stage.id}: ${stage.status}${stage.error ? ` (${stage.error})` : ""}`,
  );

  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.webContents.isDestroyed()
  ) {
    return;
  }

  try {
    mainWindow.webContents.send("desktop-shutdown-stage", stage);
  } catch (error) {
    console.error("Error sending shutdown stage:", error);
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function relaunchAsAdminIfNeeded() {
  if (
    process.env.AHSO_ELECTRON_SKIP_ADMIN_RELAUNCH === "1" ||
    process.platform !== "win32" ||
    isRunningAsAdministrator()
  ) {
    return false;
  }

  const result = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      buildRunAsAdminCommand(),
    ],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  if (result.error) {
    console.error("Failed to request administrator privileges:", result.error);
    return true;
  }

  if (result.status !== 0) {
    console.error("Administrator privilege request was not completed.");
  }

  return true;
}

function isRunningAsAdministrator() {
  const result = spawnSync("fltmc.exe", [], {
    stdio: "ignore",
    windowsHide: true,
  });

  return result.status === 0;
}

function buildRunAsAdminCommand() {
  const executablePath = process.execPath;
  const args = app.isPackaged ? [] : process.argv.slice(1);
  const argumentList = args.length
    ? ` -ArgumentList ${args.map(toPowerShellString).join(",")}`
    : "";

  return [
    "Start-Process",
    `-FilePath ${toPowerShellString(executablePath)}`,
    argumentList.trim(),
    `-WorkingDirectory ${toPowerShellString(process.cwd())}`,
    "-Verb RunAs",
  ]
    .filter(Boolean)
    .join(" ");
}

function toPowerShellString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}
