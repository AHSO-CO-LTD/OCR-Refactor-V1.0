import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";

export type LocalServiceName = "backend" | "device-tool" | "frontend";

type LocalServiceDefinition = {
  command: string;
  env?: Record<string, string>;
  args: string[];
  cwd: string;
  healthUrl: string;
  name: LocalServiceName;
  port: number;
};

type ManagedService = LocalServiceDefinition & {
  lastRestartAt: number;
  missedHealthChecks: number;
  owned: boolean;
  process: ChildProcess | null;
  restartInProgress: boolean;
  reusedExistingService: boolean;
  startedByApp: boolean;
};

const STARTUP_TIMEOUT_MS = 120_000;
const EXISTING_SERVICE_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 45_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const WATCHDOG_FAILURE_THRESHOLD = 3;
const WATCHDOG_RESTART_COOLDOWN_MS = 20_000;
const DEVICE_TOOL_API_PREFIX = "/tool/v1";
const DEVICE_TOOL_HEALTH_PATH = "/";
const DEFAULT_PORTS: Record<LocalServiceName, number> = {
  backend: readPortEnv("BACKEND_PORT", 3979),
  "device-tool": readPortEnv("DEVICE_TOOL_PORT", 8000),
  frontend: readPortEnv("FRONTEND_PORT", 3969),
};
const FALLBACK_PORTS: Record<LocalServiceName, { end: number; start: number }> = {
  backend: readFallbackRange("BACKEND", DEFAULT_PORTS.backend),
  "device-tool": readFallbackRange("DEVICE_TOOL", DEFAULT_PORTS["device-tool"]),
  frontend: readFallbackRange("FRONTEND", DEFAULT_PORTS.frontend),
};
const FRONTEND_ORIGINS = buildFrontendOrigins()
  .flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ])
  .join(",");

function readPortEnv(name: string, fallback: number) {
  const rawValue = process.env[name];

  if (!rawValue) {
    return fallback;
  }

  const port = Number.parseInt(rawValue, 10);
  return isValidPort(port) ? port : fallback;
}

function readFallbackRange(
  namePrefix: string,
  defaultPort: number,
): { end: number; start: number } {
  const start = readPortEnv(`${namePrefix}_FALLBACK_PORT_START`, defaultPort + 1);
  const end = readPortEnv(`${namePrefix}_FALLBACK_PORT_END`, defaultPort + 99);

  if (start > end) {
    return { start: defaultPort + 1, end: defaultPort + 99 };
  }

  return { start, end };
}

function buildFrontendOrigins() {
  const ports = new Set<number>([DEFAULT_PORTS.frontend]);

  for (
    let port = FALLBACK_PORTS.frontend.start;
    port <= FALLBACK_PORTS.frontend.end;
    port += 1
  ) {
    ports.add(port);
  }

  return [...ports];
}

function isValidPort(port: number) {
  return Number.isInteger(port) && port > 0 && port <= 65535;
}

export class ServiceManager {
  private readonly services: ManagedService[];
  private logListener: ((message: string) => void) | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;

  constructor(repoRoot: string) {
    const toolPython = resolveToolPython(repoRoot);
    const backendCommand = resolveBackendCommand(repoRoot);
    const frontendPath = join(repoRoot, "frontend");
    const frontendCommand = resolveFrontendCommand(
      repoRoot,
      frontendPath,
      DEFAULT_PORTS.frontend,
    );

    this.services = [
      {
        name: "device-tool",
        command: toolPython.command,
        args: [...toolPython.args, "main.py"],
        cwd: join(repoRoot, "tool"),
        healthUrl: `http://127.0.0.1:${DEFAULT_PORTS["device-tool"]}${DEVICE_TOOL_HEALTH_PATH}`,
        port: DEFAULT_PORTS["device-tool"],
        lastRestartAt: 0,
        missedHealthChecks: 0,
        owned: false,
        process: null,
        restartInProgress: false,
        reusedExistingService: false,
        startedByApp: false,
      },
      {
        name: "backend",
        command: backendCommand.command,
        env: backendCommand.env,
        args: backendCommand.args,
        cwd: backendCommand.cwd,
        healthUrl: `http://127.0.0.1:${DEFAULT_PORTS.backend}/api/health`,
        port: DEFAULT_PORTS.backend,
        lastRestartAt: 0,
        missedHealthChecks: 0,
        owned: false,
        process: null,
        restartInProgress: false,
        reusedExistingService: false,
        startedByApp: false,
      },
      {
        name: "frontend",
        command: frontendCommand.command,
        env: frontendCommand.env,
        args: frontendCommand.args,
        cwd: frontendPath,
        healthUrl: `http://127.0.0.1:${DEFAULT_PORTS.frontend}/login`,
        port: DEFAULT_PORTS.frontend,
        lastRestartAt: 0,
        missedHealthChecks: 0,
        owned: false,
        process: null,
        restartInProgress: false,
        reusedExistingService: false,
        startedByApp: false,
      },
    ];
  }

  async startAll(onStatus: (message: string) => void) {
    for (const service of this.services) {
      await this.ensureService(service, onStatus);
    }

    this.startWatchdog();
  }

  getFrontendUrl() {
    const frontend = this.services.find((service) => service.name === "frontend");
    return `http://127.0.0.1:${frontend?.port ?? DEFAULT_PORTS.frontend}/`;
  }

  onLog(listener: (message: string) => void) {
    this.logListener = listener;
  }

  async stopOwned(onStatus: (message: string) => void = () => undefined) {
    this.stopWatchdog();
    const ownedServices = [...this.services]
      .reverse()
      .filter((service) => service.startedByApp || service.reusedExistingService);

    for (const service of ownedServices) {
      await this.stopOwnedService(service, onStatus);
    }
  }

  async stopManagedPorts(onStatus: (message: string) => void = () => undefined) {
    this.stopWatchdog();

    for (const service of [...this.services].reverse()) {
      if (!(await isPortOpen(service.port))) {
        continue;
      }

      onStatus(`${service.name}: forcing port ${service.port} cleanup`);
      this.emitLog(service.name, `forcing port ${service.port} cleanup`);
      await terminateProcessOnPort(service.port);

      const closed = await waitForPortClosed(service.port, 5_000, () =>
        terminateProcessOnPort(service.port),
      );

      if (closed) {
        onStatus(`${service.name}: port ${service.port} released`);
        this.emitLog(service.name, `port ${service.port} released`);
      } else {
        onStatus(`${service.name}: port ${service.port} is still open`);
        this.emitLog(service.name, `port ${service.port} is still open after force cleanup`);
      }
    }
  }

  private startWatchdog() {
    this.stopWatchdog();
    this.watchdogTimer = setInterval(() => {
      void this.checkCriticalServices();
    }, WATCHDOG_INTERVAL_MS);
    this.watchdogTimer.unref?.();
    this.emitLog("backend", "watchdog enabled for backend and device-tool");
  }

  private stopWatchdog() {
    if (!this.watchdogTimer) {
      return;
    }

    clearInterval(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  private async checkCriticalServices() {
    const criticalServices = this.services.filter((service) =>
      service.name === "backend" || service.name === "device-tool",
    );

    for (const service of criticalServices) {
      await this.checkCriticalService(service);
    }
  }

  private async checkCriticalService(service: ManagedService) {
    if (service.restartInProgress) {
      return;
    }

    const healthy = await isHealthOk(service.healthUrl);

    if (healthy) {
      if (service.missedHealthChecks > 0) {
        this.emitLog(service.name, "watchdog health recovered");
      }
      service.missedHealthChecks = 0;
      return;
    }

    service.missedHealthChecks += 1;
    this.emitLog(
      service.name,
      `watchdog health check failed (${service.missedHealthChecks}/${WATCHDOG_FAILURE_THRESHOLD})`,
    );

    if (service.missedHealthChecks < WATCHDOG_FAILURE_THRESHOLD) {
      return;
    }

    const now = Date.now();

    if (now - service.lastRestartAt < WATCHDOG_RESTART_COOLDOWN_MS) {
      this.emitLog(service.name, "watchdog restart skipped during cooldown");
      return;
    }

    await this.restartCriticalService(service);
  }

  private async restartCriticalService(service: ManagedService) {
    service.restartInProgress = true;
    service.lastRestartAt = Date.now();
    this.emitLog(service.name, "watchdog restarting service");

    try {
      const portOpen = await isPortOpen(service.port);

      if (portOpen && !service.startedByApp) {
        this.emitLog(
          service.name,
          `port ${service.port} is occupied by an external service; watchdog will not kill it`,
        );
        return;
      }

      if (portOpen || service.process) {
        await this.stopOwnedService(service, () => undefined);
      }

      if (await isPortOpen(service.port)) {
        this.emitLog(
          service.name,
          `port ${service.port} is still occupied; restart postponed`,
        );
        return;
      }

      await this.startOwnedService(service, () => undefined);
      service.missedHealthChecks = 0;
      this.emitLog(service.name, "watchdog restart complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitLog(service.name, `watchdog restart failed (${message})`);
    } finally {
      service.restartInProgress = false;
    }
  }

  private async ensureService(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    if (await isPortOpen(service.port)) {
      onStatus(`${service.name}: using existing service on port ${service.port}`);
      this.emitLog(service.name, `using existing service on port ${service.port}`);
      if (!this.canReuseExistingService(service)) {
        onStatus(`${service.name}: port ${service.port} is occupied`);
        this.emitLog(
          service.name,
          `port ${service.port} is occupied; trying to reclaim default port`,
        );
        if (await this.reclaimDefaultPort(service, onStatus)) {
          await this.startOwnedService(service, onStatus);
          return;
        }

        this.emitLog(service.name, `port ${service.port} is still occupied; looking for fallback`);
        await this.prepareFallbackPort(service, onStatus);
        await this.startOwnedService(service, onStatus);
        return;
      }

      try {
        await waitForHealth(
          service.healthUrl,
          EXISTING_SERVICE_TIMEOUT_MS,
          undefined,
          (message) => {
            onStatus(`${service.name}: ${message}`);
            this.emitLog(service.name, message);
          },
        );
        onStatus(`${service.name}: ready`);
        service.reusedExistingService = service.port === DEFAULT_PORTS[service.name];
        if (service.reusedExistingService) {
          this.emitLog(
            service.name,
            `adopted existing service on port ${service.port} for shutdown cleanup`,
          );
        }
        this.emitLog(service.name, "ready");
        return;
      } catch {
        onStatus(
          `${service.name}: existing port ${service.port} is not responding`,
        );
        this.emitLog(
          service.name,
          `existing port ${service.port} is not responding; trying to reclaim default port`,
        );
        if (await this.reclaimDefaultPort(service, onStatus)) {
          await this.startOwnedService(service, onStatus);
          return;
        }

        this.emitLog(service.name, `port ${service.port} is still occupied; starting fallback`);
        await this.prepareFallbackPort(service, onStatus);
      }
    }

    await this.startOwnedService(service, onStatus);
  }

  private async reclaimDefaultPort(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    if (service.port !== DEFAULT_PORTS[service.name]) {
      return false;
    }

    onStatus(`${service.name}: stopping stale listener on port ${service.port}`);
    await terminateProcessOnPort(service.port);

    const closed = await waitForPortClosed(service.port, SHUTDOWN_TIMEOUT_MS, () =>
      terminateProcessOnPort(service.port),
    );

    if (closed) {
      onStatus(`${service.name}: reclaimed port ${service.port}`);
      this.emitLog(service.name, `reclaimed port ${service.port}`);
    }

    return closed;
  }

  private async startOwnedService(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    if (await isPortOpen(service.port)) {
      throw new Error(
        `${service.name} port ${service.port} is still in use and cannot be started`,
      );
    }

    this.configureServiceForPort(service);

    onStatus(`${service.name}: starting on port ${service.port}`);
    this.emitLog(service.name, `starting on port ${service.port}`);

    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: {
        ...process.env,
        ...service.env,
        ...this.createServiceEnv(service),
        FRONTEND_ORIGIN: FRONTEND_ORIGINS,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    service.process = child;
    service.owned = true;
    service.reusedExistingService = false;
    service.startedByApp = true;
    let spawnError: Error | null = null;
    this.attachProcessLogs(service, child);

    child.once("error", (error) => {
      spawnError = error;
      onStatus(`${service.name}: failed to start (${error.message})`);
      this.emitLog(service.name, `failed to start (${error.message})`);
    });
    child.once("exit", (code) => {
      if (service.process === child) {
        service.process = null;
        service.owned = false;
      }

      this.emitLog(
        service.name,
        `exited${typeof code === "number" ? ` with code ${code}` : ""}`,
      );

      if (code && code !== 0) {
        onStatus(`${service.name}: exited with code ${code}`);
      }
    });

    await waitForHealth(service.healthUrl, STARTUP_TIMEOUT_MS, () => {
      if (spawnError) {
        throw spawnError;
      }

      if (child.exitCode !== null) {
        throw new Error(
          `${service.name} exited before becoming ready (code ${child.exitCode})`,
        );
      }
    });
    onStatus(`${service.name}: ready`);
    this.emitLog(service.name, "ready");
  }

  private async prepareFallbackPort(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    const range = FALLBACK_PORTS[service.name];
    const fallbackPort = await findAvailablePort(range.start, range.end);

    if (!fallbackPort) {
      throw new Error(
        `${service.name} on port ${service.port} is not responding and no fallback port is available`,
      );
    }

    service.port = fallbackPort;
    this.configureServiceForPort(service);
    onStatus(`${service.name}: using fallback port ${fallbackPort}`);
    this.emitLog(service.name, `using fallback port ${fallbackPort}`);
  }

  private canReuseExistingService(service: ManagedService) {
    if (service.name === "backend") {
      return this.getServicePort("device-tool") === DEFAULT_PORTS["device-tool"];
    }

    if (service.name === "frontend") {
      return this.getServicePort("backend") === DEFAULT_PORTS.backend;
    }

    return true;
  }

  private configureServiceForPort(service: ManagedService) {
    if (service.name === "device-tool") {
      service.healthUrl = `http://127.0.0.1:${service.port}${DEVICE_TOOL_HEALTH_PATH}`;
      return;
    }

    if (service.name === "backend") {
      service.healthUrl = `http://127.0.0.1:${service.port}/api/health`;
      return;
    }

    service.healthUrl = `http://127.0.0.1:${service.port}/login`;
    const frontendCommand = resolveFrontendCommand(
      this.getRuntimeRoot(),
      service.cwd,
      service.port,
    );
    service.command = frontendCommand.command;
    service.env = frontendCommand.env;
    service.args = frontendCommand.args;
  }

  private createServiceEnv(service: ManagedService) {
    const backendPort = this.getServicePort("backend");
    const deviceToolPort = this.getServicePort("device-tool");

    if (service.name === "device-tool") {
      return {
        API_PORT: String(service.port),
        DEVICE_TOOL_PORT: String(service.port),
      };
    }

    if (service.name === "backend") {
      return {
        BACKEND_PORT: String(service.port),
        DEVICE_TOOL_BASE_URL: `http://127.0.0.1:${deviceToolPort}`,
        DEVICE_TOOL_API_PREFIX,
      };
    }

    return {
      NEXT_DIST_DIR: `.next-electron-${service.port}`,
      NEXT_PUBLIC_API_BASE_URL: `http://127.0.0.1:${backendPort}/api`,
      PORT: String(service.port),
    };
  }

  private getRuntimeRoot() {
    return join(this.services[0].cwd, "..");
  }

  private getServicePort(serviceName: LocalServiceName) {
    return (
      this.services.find((service) => service.name === serviceName)?.port ??
      DEFAULT_PORTS[serviceName]
    );
  }

  private attachProcessLogs(service: ManagedService, child: ChildProcess) {
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");

    child.stdout?.on("data", (chunk: string) => {
      this.emitChunk(service.name, chunk, "out");
    });
    child.stderr?.on("data", (chunk: string) => {
      this.emitChunk(service.name, chunk, "err");
    });
  }

  private emitChunk(
    serviceName: LocalServiceName,
    chunk: string,
    stream: "err" | "out",
  ) {
    const lines = chunk
      .split(/\r?\n/)
      .map((line) => line.trimEnd())
      .filter(Boolean);

    for (const line of lines) {
      this.emitLog(serviceName, `${stream}> ${line}`);
    }
  }

  private emitLog(serviceName: LocalServiceName, message: string) {
    this.logListener?.(
      `[${new Date().toLocaleTimeString("en-GB", { hour12: false })}] [${serviceName}] ${message}`,
    );
  }

  private async stopOwnedService(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    onStatus(`${service.name}: stopping`);
    this.emitLog(service.name, "stopping");

    if (service.name === "device-tool") {
      await this.stopDeviceToolRuntime(service);
    }

    const child = service.process;
    service.process = null;
    service.owned = false;

    if (child && !child.killed && child.exitCode === null) {
      child.kill("SIGTERM");
      await waitForChildExit(child, 5_000);

      if (await isPortOpen(service.port)) {
        await terminateProcessTree(child.pid);
        await waitForChildExit(child, 5_000);
      }

      closeChildPipes(child);
    } else {
      await terminateProcessOnPort(service.port);
    }

    if (await isPortOpen(service.port)) {
      this.emitLog(
        service.name,
        `port ${service.port} is still open; stopping listener process`,
      );
      await terminateProcessOnPort(service.port);
    }

    const closed = await waitForPortClosed(service.port, SHUTDOWN_TIMEOUT_MS, () =>
      terminateProcessOnPort(service.port),
    );

    if (closed) {
      onStatus(`${service.name}: stopped`);
      this.emitLog(service.name, "stopped");
    } else {
      onStatus(`${service.name}: port ${service.port} is still open`);
      this.emitLog(service.name, `port ${service.port} is still open after shutdown`);
    }

    service.startedByApp = false;
    service.reusedExistingService = false;
  }

  private async stopDeviceToolRuntime(service: ManagedService) {
    const baseUrl = `http://127.0.0.1:${service.port}${DEVICE_TOOL_API_PREFIX}`;
    const requests = await this.getDeviceToolCleanupUrls(baseUrl);

    for (const url of requests) {
      try {
        await fetch(url, {
          method: "POST",
          signal: AbortSignal.timeout(3_000),
        });
      } catch {
        // Device cleanup is best-effort; process shutdown below is the fallback.
      }
    }
  }

  private async getDeviceToolCleanupUrls(baseUrl: string) {
    try {
      const response = await fetch(`${baseUrl}/camera/list`, {
        signal: AbortSignal.timeout(3_000),
      });
      const payload = (await response.json()) as {
        data?: Array<{ id?: unknown }>;
        status?: string;
      };
      const serials = Array.isArray(payload.data)
        ? payload.data
            .map((item) => (typeof item.id === "string" ? item.id : null))
            .filter((id): id is string => Boolean(id))
        : [];

      return serials.flatMap((serial) => [
        `${baseUrl}/camera/${encodeURIComponent(serial)}/AI/yolo_ocr/stop`,
        `${baseUrl}/basler_area/${encodeURIComponent(serial)}/disconnect`,
      ]);
    } catch {
      return [];
    }
  }
}

function resolveNpmCommand(args: string[]) {
  if (process.platform !== "win32") {
    return { command: "npm", args };
  }

  return {
    command: process.env.ComSpec ?? "C:\\Windows\\System32\\cmd.exe",
    args: ["/d", "/s", "/c", `npm ${args.join(" ")}`],
  };
}

function resolveBackendCommand(repoRoot: string) {
  const backendMain = [
    join(repoRoot, "backend", "dist", "main.js"),
    join(repoRoot, "backend", "dist", "src", "main.js"),
  ].find((candidate) => existsSync(candidate));

  if (isPackagedRuntime(repoRoot) && backendMain) {
    return {
      command: process.execPath,
      args: [backendMain],
      cwd: join(repoRoot, "backend"),
      env: { ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production" },
    };
  }

  const command = resolveNpmCommand([
    "run",
    "start",
    "-w",
    "@ocr/backend",
  ]);

  return { ...command, cwd: repoRoot, env: undefined };
}

function resolveFrontendCommand(
  repoRoot: string,
  frontendPath: string,
  port: number,
) {
  const standaloneServer = findStandaloneFrontendServer(repoRoot);

  if (isPackagedRuntime(repoRoot) && standaloneServer) {
    return {
      command: process.execPath,
      args: [standaloneServer],
      cwd: dirname(standaloneServer),
      env: { ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production" },
    };
  }

  const nextBin = join(
    frontendPath,
    "..",
    "node_modules",
    "next",
    "dist",
    "bin",
    "next",
  );

  if (existsSync(nextBin)) {
    return {
      command: process.execPath,
      args: [nextBin, "dev", "--webpack", "--port", String(port)],
      env: undefined,
    };
  }

  const command = resolveNpmCommand([
    "run",
    "dev",
    "-w",
    "@ocr/frontend",
    "--",
    "--port",
    String(port),
  ]);

  return { ...command, env: undefined };
}

function isPackagedRuntime(repoRoot: string) {
  return (
    process.env.OCR_PACKAGED_RUNTIME === "true" ||
    existsSync(join(repoRoot, "runtime-manifest.json"))
  );
}

function findStandaloneFrontendServer(repoRoot: string) {
  const candidates = [
    join(repoRoot, "frontend-standalone", "server.js"),
    join(repoRoot, "frontend-standalone", "frontend", "server.js"),
    join(repoRoot, "frontend", ".next", "standalone", "server.js"),
    join(repoRoot, "frontend", ".next", "standalone", "frontend", "server.js"),
  ];

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveToolPython(repoRoot: string) {
  const configured = process.env.DEVICE_TOOL_PYTHON;

  if (configured) {
    return { command: configured, args: [] };
  }

  const venvPython =
    process.platform === "win32"
      ? join(repoRoot, "tool", ".venv", "Scripts", "python.exe")
      : join(repoRoot, "tool", ".venv", "bin", "python");

  if (existsSync(venvPython)) {
    return { command: venvPython, args: [] };
  }

  if (process.platform !== "win32") {
    if (canRunToolPython("python3", [])) {
      return { command: "python3", args: [] };
    }

    return { command: "python", args: [] };
  }

  const launcherCandidates = [
    { command: "py", args: ["-3.11"] },
    ...getWindowsPythonLauncherPaths().map((pythonPath) => ({
      command: pythonPath,
      args: [],
    })),
    { command: "python", args: [] },
  ];

  for (const candidate of launcherCandidates) {
    if (canRunToolPython(candidate.command, candidate.args)) {
      return candidate;
    }
  }

  if (canRun("uv", ["--version"])) {
    return {
      command: "uv",
      args: [
        "run",
        "--python",
        "3.11",
        "--with-requirements",
        "requirements.txt",
        "python",
      ],
    };
  }

  return { command: "py", args: ["-3.11"] };
}

function canRun(command: string, args: string[]) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    windowsHide: true,
  });

  return result.status === 0;
}

function canRunToolPython(command: string, args: string[]) {
  return canRun(command, [
    ...args,
    "-c",
    "import fastapi, uvicorn",
  ]);
}

function getWindowsPythonLauncherPaths() {
  const result = spawnSync("py", ["-0p"], {
    encoding: "utf8",
    windowsHide: true,
  });

  if (result.status !== 0) {
    return [];
  }

  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;

  return output
    .split(/\r?\n/)
    .map((line) => line.match(/([A-Za-z]:\\.*?python\.exe)\s*$/i)?.[1])
    .filter((pythonPath): pythonPath is string => Boolean(pythonPath));
}

async function waitForHealth(
  url: string,
  timeoutMs: number,
  assertRunning?: () => void,
  onProgress?: (message: string) => void,
) {
  const startedAt = Date.now();
  let nextProgressAt = startedAt + 5_000;

  while (Date.now() - startedAt < timeoutMs) {
    assertRunning?.();

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (response.ok) {
        return;
      }
    } catch {
      // Service is still starting.
    }

    const now = Date.now();
    if (now >= nextProgressAt) {
      onProgress?.(
        `waiting for health (${Math.round((now - startedAt) / 1000)}s)`,
      );
      nextProgressAt = now + 5_000;
    }

    await delay(HEALTH_POLL_MS);
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function isHealthOk(url: string) {
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
    return response.ok;
  } catch {
    return false;
  }
}

function isPortOpen(port: number) {
  return new Promise<boolean>((resolve) => {
    const socket = createConnection({ host: "127.0.0.1", port });

    socket.setTimeout(500);
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("timeout", () => {
      socket.destroy();
      resolve(false);
    });
    socket.once("error", () => resolve(false));
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function waitForChildExit(child: ChildProcess, timeoutMs: number) {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }

  return new Promise<void>((resolve) => {
    const timeout = setTimeout(resolve, timeoutMs);

    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function closeChildPipes(child: ChildProcess) {
  child.stdout?.destroy();
  child.stderr?.destroy();
}

async function findAvailablePort(startPort: number, endPort: number) {
  for (let port = startPort; port <= endPort; port += 1) {
    if (!(await isPortOpen(port))) {
      return port;
    }
  }

  return null;
}

async function waitForPortClosed(
  port: number,
  timeoutMs: number,
  onStillOpen?: () => Promise<void>,
) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (!(await isPortOpen(port))) {
      return true;
    }

    await onStillOpen?.();
    await delay(HEALTH_POLL_MS);
  }

  return !(await isPortOpen(port));
}

async function terminateProcessTree(pid?: number) {
  if (!pid) {
    return;
  }

  if (process.platform === "win32") {
    await terminateWindowsProcessTree(pid);
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    // Already stopped.
  }
}

async function terminateProcessOnPort(port: number) {
  if (process.platform !== "win32") {
    return;
  }

  const pids = await findWindowsPidsByPort(port);

  for (const pid of pids) {
    await terminateWindowsProcessTree(pid);
  }
}

function terminateWindowsProcessTree(pid: number) {
  return new Promise<void>((resolve) => {
    const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.once("exit", async () => {
      await terminateWindowsDescendants(pid);
      resolve();
    });
    taskkill.once("error", async () => {
      await terminateWindowsDescendants(pid);
      resolve();
    });
  });
}

function terminateWindowsDescendants(pid: number) {
  return new Promise<void>((resolve) => {
    const script = [
      "$ErrorActionPreference='SilentlyContinue';",
      `$root=${pid};`,
      "$all=Get-CimInstance Win32_Process;",
      "$targets=@();",
      "$front=@($root);",
      "while($front.Count -gt 0){",
      "  $next=@();",
      "  foreach($parent in $front){",
      "    $children=$all | Where-Object { $_.ParentProcessId -eq $parent };",
      "    foreach($child in $children){",
      "      $targets += [int]$child.ProcessId;",
      "      $next += [int]$child.ProcessId;",
      "    }",
      "  }",
      "  $front=$next;",
      "}",
      "$targets | Sort-Object -Descending -Unique | ForEach-Object { Stop-Process -Id $_ -Force };",
      "Stop-Process -Id $root -Force;",
    ].join(" ");
    const powershell = spawn(
      "powershell.exe",
      ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
      {
        stdio: "ignore",
        windowsHide: true,
      },
    );

    powershell.once("exit", () => resolve());
    powershell.once("error", () => resolve());
  });
}

function findWindowsPidsByPort(port: number) {
  return new Promise<number[]>((resolve) => {
    const child = spawn("netstat.exe", ["-ano", "-p", "tcp"], {
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    let output = "";

    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      output += chunk;
    });
    child.once("exit", () => {
      const pids = output
        .split(/\r?\n/)
        .map((line) => parseWindowsNetstatPid(line, port))
        .filter((pid) => Number.isInteger(pid) && pid > 0);
      resolve(Array.from(new Set(pids)));
    });
    child.once("error", () => resolve([]));
  });
}

function parseWindowsNetstatPid(line: string, port: number) {
  const columns = line.trim().split(/\s+/);

  if (columns.length < 5 || columns[0].toUpperCase() !== "TCP") {
    return Number.NaN;
  }

  const localAddress = columns[1];
  const state = columns[3]?.toUpperCase();
  const pid = Number.parseInt(columns[4] ?? "", 10);

  if (state !== "LISTENING" || !localAddress.endsWith(`:${port}`)) {
    return Number.NaN;
  }

  return pid;
}
