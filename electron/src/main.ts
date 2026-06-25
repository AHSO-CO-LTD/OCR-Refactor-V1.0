import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ServiceManager } from "./service-manager";

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

const defaultWindowSettings: DesktopWindowSettings = {
  fullscreen: false,
  frameless: false,
  alwaysOnTop: false,
  zoomFactor: 1,
  windowPreset: "factory",
  width: 1280,
  height: 1080,
};

const defaultTestStorageSettings: DesktopTestStorageSettings = {
  testImageSaveFolderPath: null,
};

let rendererUrl =
  process.env.ELECTRON_RENDERER_URL ?? "http://127.0.0.1:3000/login";

let mainWindow: BrowserWindow | null = null;
let terminalWindow: BrowserWindow | null = null;
let serviceManager: ServiceManager | null = null;
let isQuitting = false;
let windowSettings: DesktopWindowSettings = defaultWindowSettings;
let testStorageSettings: DesktopTestStorageSettings = defaultTestStorageSettings;

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
  const repoRoot = resolve(__dirname, "..", "..");
  serviceManager = new ServiceManager(repoRoot);
  windowSettings = loadWindowSettings();
  testStorageSettings = loadTestStorageSettings();
  registerDesktopIpc();

  createMainWindow();
  createTerminalWindow();
  showStartupPage("Starting local services...");
  serviceManager.onLog((message) => {
    showTerminalLog(message);
  });

  await serviceManager.startAll((message) => {
    showStartupPage(message);
    showTerminalLog(`[status] ${message}`);
  });
  rendererUrl = process.env.ELECTRON_RENDERER_URL ?? serviceManager.getFrontendUrl();

  await loadRendererUrl();
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

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });

  return window;
}

function registerDesktopIpc() {
  ipcMain.handle("desktop:get-test-storage-settings", () => testStorageSettings);
  ipcMain.handle("desktop:get-window-settings", () => windowSettings);
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
          extensions: ["onnx", "pt", "pth", "engine", "xml", "bin", "trt", "tflite", "pb"],
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
    isQuitting = false;
    app.quit();
    return { success: true };
  });
}

function applyWindowSettings(nextSettings: Partial<DesktopWindowSettings>) {
  const previousSettings = windowSettings;
  windowSettings = normalizeWindowSettings({
    ...windowSettings,
    ...nextSettings,
  });
  saveWindowSettings(windowSettings);

  if (!mainWindow || mainWindow.isDestroyed()) {
    return windowSettings;
  }

  const shouldRecreateWindow =
    previousSettings.frameless !== windowSettings.frameless;
  const currentUrl =
    mainWindow.webContents.getURL() && !mainWindow.webContents.getURL().startsWith("data:")
      ? mainWindow.webContents.getURL()
      : rendererUrl;

  if (shouldRecreateWindow) {
    const previousWindow = mainWindow;
    previousWindow.removeAllListeners("closed");
    previousWindow.close();
    mainWindow = null;
    const nextWindow = createMainWindow();
    void loadWindowUrl(nextWindow, currentUrl);
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

function loadWindowSettings() {
  const settingsPath = getWindowSettingsPath();

  if (!existsSync(settingsPath)) {
    return defaultWindowSettings;
  }

  try {
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8")) as Partial<DesktopWindowSettings>;
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
  writeFileSync(getTestStorageSettingsPath(), JSON.stringify(settings, null, 2));
}

function normalizeWindowSettings(settings: DesktopWindowSettings) {
  const presetSize = resolvePresetSize(settings.windowPreset);
  const width =
    settings.windowPreset === "custom" ? clamp(settings.width, 1024, 3840) : presetSize.width;
  const height =
    settings.windowPreset === "custom" ? clamp(settings.height, 720, 2160) : presetSize.height;

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
      return { width: 1280, height: 1080 };
  }
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }

  return Math.min(Math.max(value, min), max);
}

function createTerminalWindow() {
  const window = new BrowserWindow({
    width: 980,
    height: 520,
    minWidth: 720,
    minHeight: 320,
    show: false,
    backgroundColor: "#020617",
    autoHideMenuBar: true,
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

function showStartupPage(message: string) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const document = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Metalcore Washing</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: #f1f5f9;
        color: #0f172a;
        font-family: Arial, sans-serif;
      }
      main {
        width: min(520px, calc(100vw - 48px));
        border: 1px solid #cbd5e1;
        background: #ffffff;
        padding: 28px;
      }
      h1 { margin: 0 0 8px; font-size: 22px; }
      p { margin: 0; color: #475569; line-height: 1.5; }
      .bar {
        height: 4px;
        margin-top: 24px;
        overflow: hidden;
        background: #e2e8f0;
      }
      .bar::after {
        content: "";
        display: block;
        width: 40%;
        height: 100%;
        background: #0891b2;
        animation: loading 1.1s linear infinite;
      }
      @keyframes loading {
        from { transform: translateX(-100%); }
        to { transform: translateX(350%); }
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Metalcore Washing</h1>
      <p>${escapeHtml(message)}</p>
      <div class="bar"></div>
    </main>
  </body>
</html>`;

  try {
    if (!mainWindow.webContents.isDestroyed()) {
      void loadWindowUrl(
        mainWindow,
        `data:text/html;charset=utf-8,${encodeURIComponent(document)}`,
      );
    }
  } catch (e) {
    console.error("Error loading startup page:", e);
  }
}

function showFatalStartupError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error("Fatal startup error:", error);
  showStartupPage(`Startup failed: ${message}`);
  showTerminalLog(`[fatal] ${message}`);
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
  if (isQuitting || !serviceManager) {
    return;
  }

  event.preventDefault();
  isQuitting = true;
  void serviceManager.stopOwned().finally(() => app.quit());
});

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showTerminalLog(message: string) {
  if (!terminalWindow || terminalWindow.isDestroyed()) {
    return;
  }

  try {
    if (!terminalWindow.webContents.isDestroyed()) {
      terminalWindow.webContents.send("terminal-log", message);
    }
  } catch (e) {
    console.error("Error sending terminal log:", e);
  }
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

      clear.addEventListener("click", () => {
        log.textContent = "";
        isFirstLine = true;
      });

      window.ocrDesktop.onTerminalLog((message) => {
        if (isFirstLine) {
          log.textContent = "";
          isFirstLine = false;
        }
        log.textContent += message + "\\n";
        log.scrollTop = log.scrollHeight;
      });
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

    showStartupPage(`frontend: opening login (${attempt}/${attempts})`);
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

  return (
    error instanceof Error &&
    "code" in error &&
    (error as { code?: unknown }).code === "ERR_ABORTED"
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
