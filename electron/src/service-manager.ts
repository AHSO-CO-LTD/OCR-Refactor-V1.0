import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { delimiter, dirname, join } from "node:path";
import type {
  StartupHardwareStageId,
  StartupHardwareStageUpdate,
  StartupServiceStageId,
  StartupServiceStageUpdate,
  StartupStageDetail,
  StartupStageStatus,
} from "./startup-types";
import type { ShutdownStageId, ShutdownStageUpdate } from "./shutdown-types";

export type LocalServiceName = "backend" | "device-tool" | "frontend";
export type {
  StartupHardwareStageUpdate,
  StartupServiceStageUpdate,
} from "./startup-types";

export type DongilSyncBootstrapPayload = {
  appVersion?: string;
  credential?: string;
  licenseStatus: "LICENSED" | "UNLICENSED";
  machineId: string;
  machineTypeCode: string;
  serverUrl: string;
};

export type DongilSyncBootstrapResult = {
  data?: {
    assignedMachineTypeCode?: string;
    assignmentCount?: number;
    issuedCredential?: string | null;
    state?:
      | "READY"
      | "REGISTERED_CONFIG_PENDING"
      | "UNAUTHORIZED"
      | "NEEDS_CREDENTIAL_RECOVERY";
  };
};

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

type ServiceCommand = {
  command: string;
  env?: Record<string, string>;
  args: string[];
  cwd: string;
};

const STARTUP_TIMEOUT_MS = 120_000;
const EXISTING_SERVICE_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 500;
const SHUTDOWN_TIMEOUT_MS = 45_000;
const CAMERA_DISCONNECT_POWER_DELAY_MS = 5_000;
const WATCHDOG_INTERVAL_MS = 5_000;
const WATCHDOG_FAILURE_THRESHOLD = 3;
const WATCHDOG_RESTART_COOLDOWN_MS = 20_000;
const BACKEND_MIGRATION_TIMEOUT_MS = 120_000;
const DEVICE_TOOL_API_PREFIX = "/tool/v1";
const DEVICE_TOOL_HEALTH_PATH = "/";
const DEFAULT_PORTS: Record<LocalServiceName, number> = {
  backend: readPortEnv("BACKEND_PORT", 3980),
  "device-tool": readPortEnv("DEVICE_TOOL_PORT", 8668),
  frontend: readPortEnv("FRONTEND_PORT", 3970),
};
const FALLBACK_PORTS: Record<LocalServiceName, { end: number; start: number }> =
  {
    backend: readFallbackRange("BACKEND", DEFAULT_PORTS.backend),
    "device-tool": readFallbackRange(
      "DEVICE_TOOL",
      DEFAULT_PORTS["device-tool"],
    ),
    frontend: readFallbackRange("FRONTEND", DEFAULT_PORTS.frontend),
  };
const FRONTEND_ORIGINS = buildFrontendOrigins()
  .flatMap((port) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`])
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
  const start = readPortEnv(
    `${namePrefix}_FALLBACK_PORT_START`,
    defaultPort + 1,
  );
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

function toStartupServiceStageId(
  serviceName: LocalServiceName,
): StartupServiceStageId {
  if (serviceName === "device-tool") return "deviceTool";
  return serviceName;
}

export class ServiceManager {
  private readonly services: ManagedService[];
  private readonly runtimeRoot: string;
  private readonly desktopInternalToken = randomUUID();
  private backendMigrationsReady = false;
  private logListener: ((message: string) => void) | null = null;
  private watchdogTimer: NodeJS.Timeout | null = null;
  private readonly startupServiceStages = new Map<
    StartupServiceStageId,
    StartupStageStatus
  >([
    ["deviceTool", "pending"],
    ["database", "pending"],
    ["backend", "pending"],
    ["frontend", "pending"],
  ]);
  private startupStageListener:
    | ((stage: StartupServiceStageUpdate) => void)
    | null = null;
  private startupHardwarePromise: Promise<{
    stages: StartupHardwareStageUpdate[];
  }> | null = null;
  private startupHardwareAttempt = 0;

  constructor(repoRoot: string) {
    this.runtimeRoot = repoRoot;
    const toolPython = resolveToolPython(repoRoot);
    const deviceToolCommand = resolveDeviceToolCommand(
      repoRoot,
      toolPython,
      DEFAULT_PORTS["device-tool"],
    );
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
        command: deviceToolCommand.command,
        args: deviceToolCommand.args,
        cwd: deviceToolCommand.cwd,
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
        cwd: frontendCommand.cwd,
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

  async startAll<T = void>(
    onStatus: (message: string) => void,
    onStage?: (stage: StartupServiceStageUpdate) => void,
    onBackendReady?: () => Promise<T>,
  ): Promise<T | undefined> {
    this.startupStageListener = onStage ?? null;
    const startService = async (service: ManagedService) => {
      const stageId = toStartupServiceStageId(service.name);
      this.updateStartupServiceStage(stageId, "running");
      try {
        await this.ensureService(service, onStatus);
        this.updateStartupServiceStage(stageId, "done");
      } catch (error) {
        if (
          service.name === "backend" &&
          this.startupServiceStages.get("database") === "running"
        ) {
          this.updateStartupServiceStage("database", "failed");
        }
        this.updateStartupServiceStage(stageId, "failed");
        throw error;
      }
    };

    const deviceTool = this.services.find(
      (service) => service.name === "device-tool",
    );
    const backend = this.services.find((service) => service.name === "backend");
    const frontend = this.services.find(
      (service) => service.name === "frontend",
    );
    if (!deviceTool || !backend || !frontend) {
      throw new Error("Desktop service configuration is incomplete");
    }

    const infrastructure = await Promise.allSettled([
      startService(deviceTool),
      startService(backend),
    ]);
    const infrastructureFailure = infrastructure.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (infrastructureFailure) throw infrastructureFailure.reason;

    const frontendOperation = startService(frontend);
    const backendReadyOperation = onBackendReady?.();
    const remaining = await Promise.allSettled([
      frontendOperation,
      ...(backendReadyOperation ? [backendReadyOperation] : []),
    ]);
    const remainingFailure = remaining.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (remainingFailure) throw remainingFailure.reason;

    this.startWatchdog();
    return backendReadyOperation
      ? (remaining[1] as PromiseFulfilledResult<T>).value
      : undefined;
  }

  getStartupServiceStages(): StartupServiceStageUpdate[] {
    return [...this.startupServiceStages].map(([id, status]) => ({
      id,
      status,
    }));
  }

  getFrontendUrl() {
    const frontend = this.services.find(
      (service) => service.name === "frontend",
    );
    return `http://127.0.0.1:${frontend?.port ?? DEFAULT_PORTS.frontend}/`;
  }

  getBackendUrl() {
    const backend = this.services.find((service) => service.name === "backend");
    return `http://127.0.0.1:${backend?.port ?? DEFAULT_PORTS.backend}/api/`;
  }

  async bootstrapDongilSync(
    payload: DongilSyncBootstrapPayload,
  ): Promise<DongilSyncBootstrapResult> {
    const response = await fetch(
      `http://127.0.0.1:${this.getServicePort("backend")}/api/internal/dongil-sync/bootstrap`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-internal-token": this.desktopInternalToken,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20_000),
      },
    );
    if (!response.ok) {
      throw new Error((await response.text()) || `Dongil bootstrap failed (${response.status})`);
    }
    return (await response.json()) as DongilSyncBootstrapResult;
  }

  prepareStartupHardware(
    preferredProductId: string | undefined,
    onStage: (stage: StartupHardwareStageUpdate) => void,
  ) {
    if (this.startupHardwarePromise) return this.startupHardwarePromise;
    const attempt = ++this.startupHardwareAttempt;
    const emitCurrentAttempt = (stage: StartupHardwareStageUpdate) => {
      if (attempt === this.startupHardwareAttempt) onStage(stage);
    };
    const operation = this.performStartupHardwarePreparation(
      preferredProductId,
      emitCurrentAttempt,
    );
    this.startupHardwarePromise = operation.finally(() => {
      if (attempt === this.startupHardwareAttempt) {
        this.startupHardwarePromise = null;
      }
    });
    return this.startupHardwarePromise;
  }

  async abortStartupHardware() {
    this.startupHardwareAttempt += 1;
    this.startupHardwarePromise = null;
    const response = await fetch(
      `http://127.0.0.1:${this.getServicePort("backend")}/api/internal/plc-runtime/startup/abort`,
      {
        method: "POST",
        headers: {
          "x-desktop-internal-token": this.desktopInternalToken,
        },
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!response.ok) {
      throw new Error((await response.text()) || `${response.status}`);
    }
  }

  async shutdownHardware(onStage: (stage: ShutdownStageUpdate) => void) {
    const backendPort = this.getServicePort("backend");
    const backendReady = await isHealthOk(
      `http://127.0.0.1:${backendPort}/api/health`,
    );

    if (!backendReady) {
      (["camera", "cameraOutputs", "remainingSignals", "plc"] as const).forEach(
        (id) => onStage({ id, status: "skipped" }),
      );
      this.emitLog(
        "backend",
        "hardware shutdown skipped because backend is not available",
      );
      return;
    }

    const plcConnected = await this.getPlcConnectionForHardwareShutdown();
    const stages: Array<{ id: ShutdownStageId; path: string }> = [
      { id: "camera", path: "shutdown/camera" },
    ];

    if (plcConnected) {
      stages.push(
        { id: "cameraOutputs", path: "shutdown/camera-outputs" },
        { id: "remainingSignals", path: "shutdown/remaining-signals" },
      );
    } else {
      onStage({ id: "cameraOutputs", status: "skipped" });
      onStage({ id: "remainingSignals", status: "skipped" });
      onStage({ id: "plc", status: "skipped" });
    }

    const failures: string[] = [];
    let cameraDisconnected = false;

    for (const stage of stages) {
      if (stage.id === "cameraOutputs" && !cameraDisconnected) {
        onStage({ id: stage.id, status: "skipped" });
        this.emitLog(
          "backend",
          "camera power shutdown skipped because camera disconnect did not complete",
        );
        continue;
      }

      onStage({ id: stage.id, status: "running" });

      try {
        await this.requestBackendHardwareShutdownStage(stage.path);
        if (stage.id === "camera") {
          cameraDisconnected = true;
          this.emitLog(
            "backend",
            "camera disconnected; waiting 5 seconds before turning off camera power",
          );
          await delay(CAMERA_DISCONNECT_POWER_DELAY_MS);
        }
        onStage({ id: stage.id, status: "done" });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${stage.id}: ${message}`);
        onStage({ id: stage.id, status: "failed", error: message });
        this.emitLog(
          "backend",
          `hardware shutdown ${stage.id} failed (${message})`,
        );
      }
    }

    if (failures.length > 0) {
      throw new Error(failures.join("; "));
    }

    if (!plcConnected) {
      return;
    }

    const plcStage = { id: "plc" as const, path: "shutdown/plc" };
    onStage({ id: plcStage.id, status: "running" });
    try {
      await this.requestBackendHardwareShutdownStage(plcStage.path);
      onStage({ id: plcStage.id, status: "done" });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      onStage({
        id: plcStage.id,
        status: "failed",
        error: message,
      });
      this.emitLog(
        "backend",
        `hardware shutdown ${plcStage.id} failed (${message})`,
      );
      throw error;
    }
  }

  private async performStartupHardwarePreparation(
    preferredProductId: string | undefined,
    onStage: (stage: StartupHardwareStageUpdate) => void,
  ) {
    const stages: Array<{
      body?: Record<string, string>;
      id: StartupHardwareStageId;
      path: string;
    }> = [
      { id: "plc", path: "startup/plc" },
      { id: "cameraPower", path: "startup/camera-power" },
      { id: "cameraLight", path: "startup/camera-light" },
      {
        id: "camera",
        path: "startup/camera",
        body: preferredProductId ? { productId: preferredProductId } : {},
      },
      { id: "plcSignals", path: "startup/plc-signals" },
    ];
    const results: StartupHardwareStageUpdate[] = [];

    const runStage = async (stage: (typeof stages)[number]) => {
      onStage({ id: stage.id, status: "running" });
      try {
        const response = await this.requestBackendStartupStage(
          stage.path,
          stage.body,
        );
        const hasFailures = response.details?.some(
          (detail) => detail.status === "failed",
        );
        const result: StartupHardwareStageUpdate = {
          id: stage.id,
          status:
            response.status === "skipped"
              ? "skipped"
              : hasFailures
                ? "warning"
                : "done",
          details: response.details,
        };
        results.push(result);
        onStage(result);
        return result;
      } catch (error) {
        const result: StartupHardwareStageUpdate = {
          id: stage.id,
          status: "failed",
        };
        results.push(result);
        onStage(result);
        this.emitLog(
          "backend",
          `startup ${stage.id} failed (${error instanceof Error ? error.message : String(error)})`,
        );
        return result;
      }
    };

    const skipStage = (stage: (typeof stages)[number]) => {
      const result: StartupHardwareStageUpdate = {
        id: stage.id,
        status: "skipped",
      };
      results.push(result);
      onStage(result);
    };

    const [plcStage, powerStage, lightStage, cameraStage, signalsStage] =
      stages;
    const plc = await runStage(plcStage);
    if (plc.status !== "done") {
      for (const stage of [powerStage, lightStage, cameraStage, signalsStage]) {
        skipStage(stage);
      }
      return { stages: results };
    }

    const cameraBranch = async () => {
      const power = await runStage(powerStage);
      if (power.status === "done") {
        await runStage(lightStage);
        await runStage(cameraStage);
      } else {
        skipStage(lightStage);
        skipStage(cameraStage);
      }
    };

    await Promise.all([cameraBranch(), runStage(signalsStage)]);

    return { stages: results };
  }

  onLog(listener: (message: string) => void) {
    this.logListener = listener;
  }

  async stopOwned(onStatus: (message: string) => void = () => undefined) {
    this.stopWatchdog();
    const ownedServices = [...this.services]
      .reverse()
      .filter(
        (service) => service.startedByApp || service.reusedExistingService,
      );

    for (const service of ownedServices) {
      await this.stopOwnedService(service, onStatus);
    }
  }

  async stopManagedPorts(
    onStatus: (message: string) => void = () => undefined,
  ) {
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
        this.emitLog(
          service.name,
          `port ${service.port} is still open after force cleanup`,
        );
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
    const criticalServices = this.services.filter(
      (service) => service.name === "backend" || service.name === "device-tool",
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
    if (service.name === "backend") {
      await this.ensureBackendMigrationsReady(service, onStatus);
    }

    if (await isPortOpen(service.port)) {
      onStatus(
        `${service.name}: using existing service on port ${service.port}`,
      );
      this.emitLog(
        service.name,
        `using existing service on port ${service.port}`,
      );
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

        this.emitLog(
          service.name,
          `port ${service.port} is still occupied; looking for fallback`,
        );
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
        service.reusedExistingService =
          service.port === DEFAULT_PORTS[service.name];
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

        this.emitLog(
          service.name,
          `port ${service.port} is still occupied; starting fallback`,
        );
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

    onStatus(
      `${service.name}: stopping stale listener on port ${service.port}`,
    );
    await terminateProcessOnPort(service.port);

    const closed = await waitForPortClosed(
      service.port,
      SHUTDOWN_TIMEOUT_MS,
      () => terminateProcessOnPort(service.port),
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
    this.emitLog(
      service.name,
      `launch command=${service.command}; cwd=${service.cwd}; args=${JSON.stringify(service.args)}`,
    );

    const child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: this.createProcessEnv(service),
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
    if (service.name === "device-tool") {
      throw new Error(
        `device-tool must run on configured port ${DEFAULT_PORTS["device-tool"]}; release that port and start again`,
      );
    }

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
      return (
        this.getServicePort("device-tool") === DEFAULT_PORTS["device-tool"]
      );
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
    service.cwd = frontendCommand.cwd;
  }

  private createServiceEnv(service: ManagedService) {
    const backendPort = this.getServicePort("backend");
    const deviceToolPort = this.getServicePort("device-tool");

    if (service.name === "device-tool") {
      return {};
    }

    if (service.name === "backend") {
      return {
        BACKEND_PORT: String(service.port),
        DESKTOP_INTERNAL_TOKEN: this.desktopInternalToken,
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

  private createProcessEnv(service: ManagedService) {
    return {
      ...process.env,
      ...service.env,
      ...this.createServiceEnv(service),
      FRONTEND_ORIGIN: FRONTEND_ORIGINS,
    };
  }

  private async ensureBackendMigrationsReady(
    service: ManagedService,
    onStatus: (message: string) => void,
  ) {
    if (this.backendMigrationsReady) {
      return;
    }

    if (process.env.BACKEND_AUTO_MIGRATE === "false") {
      this.emitLog(
        "backend",
        "database migration check skipped by BACKEND_AUTO_MIGRATE=false",
      );
      this.backendMigrationsReady = true;
      this.updateStartupServiceStage("database", "skipped");
      return;
    }

    if (!existsSync(join(service.cwd, "prisma", "schema.prisma"))) {
      this.emitLog(
        "backend",
        "database migration check skipped; Prisma schema not found",
      );
      this.backendMigrationsReady = true;
      this.updateStartupServiceStage("database", "skipped");
      return;
    }

    onStatus("backend: checking database migrations");
    this.updateStartupServiceStage("database", "running");
    this.emitLog("backend", "checking database migrations");

    const command = resolveNpmCommand([
      "exec",
      "--offline",
      "--",
      "prisma",
      "migrate",
      "deploy",
    ]);
    const result = spawnSync(command.command, command.args, {
      cwd: service.cwd,
      encoding: "utf8",
      env: this.createProcessEnv(service),
      timeout: BACKEND_MIGRATION_TIMEOUT_MS,
      windowsHide: true,
    });

    this.emitSyncOutput("backend", result.stdout, "out");
    this.emitSyncOutput("backend", result.stderr, "err");

    if (result.error) {
      throw new Error(
        `backend database migration failed (${result.error.message})`,
      );
    }

    if (result.status !== 0) {
      throw new Error(
        `backend database migration failed with code ${result.status ?? "unknown"}`,
      );
    }

    this.backendMigrationsReady = true;
    this.updateStartupServiceStage("database", "done");
    onStatus("backend: database migrations ready");
    this.emitLog("backend", "database migrations ready");
  }

  private getRuntimeRoot() {
    return this.runtimeRoot;
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

  private emitSyncOutput(
    serviceName: LocalServiceName,
    chunk: string | null,
    stream: "err" | "out",
  ) {
    if (!chunk) {
      return;
    }

    this.emitChunk(serviceName, chunk, stream);
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

    if (service.name === "backend") {
      await this.stopBackendRuntime(service);
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

    const closed = await waitForPortClosed(
      service.port,
      SHUTDOWN_TIMEOUT_MS,
      () => terminateProcessOnPort(service.port),
    );

    if (closed) {
      onStatus(`${service.name}: stopped`);
      this.emitLog(service.name, "stopped");
    } else {
      onStatus(`${service.name}: port ${service.port} is still open`);
      this.emitLog(
        service.name,
        `port ${service.port} is still open after shutdown`,
      );
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

  private async stopBackendRuntime(service: ManagedService) {
    try {
      await fetch(
        `http://127.0.0.1:${service.port}/api/internal/plc-runtime/shutdown`,
        {
          method: "POST",
          headers: {
            "x-desktop-internal-token": this.desktopInternalToken,
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
    } catch {
      // Nest lifecycle shutdown remains the fallback for non-desktop runtimes.
    }
  }

  private async requestBackendStartupStage(
    path: string,
    body?: Record<string, string>,
  ) {
    const timeoutMs = path === "startup/camera" ? 70_000 : 25_000;
    const response = await fetch(
      `http://127.0.0.1:${this.getServicePort("backend")}/api/internal/plc-runtime/${path}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-desktop-internal-token": this.desktopInternalToken,
        },
        body: JSON.stringify(body ?? {}),
        signal: AbortSignal.timeout(timeoutMs),
      },
    );
    if (!response.ok) {
      throw new Error((await response.text()) || `${response.status}`);
    }
    const payload = (await response.json()) as {
      data?: {
        status?: "done" | "skipped";
        checks?: StartupStageDetail[];
      };
    };
    return {
      status: payload.data?.status ?? "done",
      details: payload.data?.checks,
    };
  }

  private async requestBackendHardwareShutdownStage(path: string) {
    const response = await fetch(
      `http://127.0.0.1:${this.getServicePort("backend")}/api/internal/plc-runtime/${path}`,
      {
        method: "POST",
        headers: {
          "x-desktop-internal-token": this.desktopInternalToken,
        },
        signal: AbortSignal.timeout(20_000),
      },
    );

    if (!response.ok) {
      throw new Error((await response.text()) || `${response.status}`);
    }
  }

  private async getPlcConnectionForHardwareShutdown() {
    try {
      const response = await fetch(
        `http://127.0.0.1:${this.getServicePort("backend")}/api/internal/plc-runtime/shutdown/plan`,
        {
          headers: {
            "x-desktop-internal-token": this.desktopInternalToken,
          },
          signal: AbortSignal.timeout(5_000),
        },
      );

      if (!response.ok) {
        throw new Error((await response.text()) || `${response.status}`);
      }

      const payload = (await response.json()) as {
        data?: { plcConnected?: boolean };
      };
      return payload.data?.plcConnected === true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.emitLog(
        "backend",
        `could not read PLC status before hardware shutdown; using the safe PLC shutdown path (${message})`,
      );
      return true;
    }
  }

  private updateStartupServiceStage(
    id: StartupServiceStageId,
    status: StartupStageStatus,
  ) {
    this.startupServiceStages.set(id, status);
    this.startupStageListener?.({ id, status });
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

function resolveBackendCommand(repoRoot: string): ServiceCommand {
  const backendPath = join(repoRoot, "backend");
  const backendMain = [
    join(backendPath, "dist", "main.js"),
    join(backendPath, "dist", "src", "main.js"),
  ].find((candidate) => existsSync(candidate));

  if (isPackagedRuntime(repoRoot) && backendMain) {
    return {
      command: process.execPath,
      args: [backendMain],
      cwd: backendPath,
      env: { ELECTRON_RUN_AS_NODE: "1", NODE_ENV: "production" },
    };
  }

  const command = resolveNpmCommand(["run", "start"]);

  return { ...command, cwd: backendPath, env: undefined };
}

function resolveFrontendCommand(
  repoRoot: string,
  frontendPath: string,
  port: number,
): ServiceCommand {
  const standaloneServer = findStandaloneFrontendServer(repoRoot);

  if (isPackagedRuntime(repoRoot)) {
    if (!standaloneServer) {
      throw new Error(
        `Packaged frontend server was not found under ${repoRoot}`,
      );
    }

    const nodeExecutable = resolveSystemNodeExecutable();

    if (!nodeExecutable) {
      throw new Error(
        "Packaged frontend requires Node.js, but node.exe was not found. Run the installer repair flow.",
      );
    }

    return {
      // Next.js standalone is a regular Node.js server. Running it through
      // the Electron executable can exit cleanly before it opens its port on
      // packaged Windows builds. Setup already verifies Node.js, so use it
      // directly for the renderer service.
      command: nodeExecutable,
      args: [standaloneServer],
      cwd: dirname(standaloneServer),
      env: { NODE_ENV: "production" },
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
      cwd: frontendPath,
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

  return { ...command, cwd: repoRoot, env: undefined };
}

function resolveSystemNodeExecutable() {
  if (process.platform !== "win32") {
    return "node";
  }

  const configured = process.env.AHSO_NODE_EXECUTABLE?.trim();
  if (configured && existsSync(configured)) {
    return configured;
  }

  const pathValue = process.env.Path ?? process.env.PATH ?? "";
  const candidates = pathValue
    .split(delimiter)
    .map((entry) => entry.trim().replace(/^"|"$/g, ""))
    .filter(Boolean)
    .map((entry) => join(entry, "node.exe"));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
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

  if (configured && canRunToolPython(configured, [])) {
    return { command: configured, args: [] };
  }

  const embeddedPython =
    process.platform === "win32"
      ? join(repoRoot, "tool", "python-embed", "python.exe")
      : join(repoRoot, "tool", "python-embed", "bin", "python");

  if (existsSync(embeddedPython) && canRunToolPython(embeddedPython, [])) {
    return { command: embeddedPython, args: [] };
  }

  const venvPython =
    process.platform === "win32"
      ? join(repoRoot, "tool", ".venv", "Scripts", "python.exe")
      : join(repoRoot, "tool", ".venv", "bin", "python");

  if (existsSync(venvPython) && canRunToolPython(venvPython, [])) {
    return { command: venvPython, args: [] };
  }

  if (process.platform !== "win32") {
    if (canRunToolPython("python3.11", [])) {
      return { command: "python3.11", args: [] };
    }

    if (canRunToolPython("python3", [])) {
      return { command: "python3", args: [] };
    }

    if (canRunToolPython("python", [])) {
      return { command: "python", args: [] };
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

    return { command: "python3.11", args: [] };
  }

  const launcherCandidates = [
    { command: "py", args: ["-3.11"] },
    ...getWindowsPythonLauncherPaths()
      .filter(isPython311Path)
      .map((pythonPath) => ({
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

function resolveDeviceToolCommand(
  repoRoot: string,
  toolPython: { args: string[]; command: string },
  port: number,
): ServiceCommand {
  const configuredToolPath = process.env.DEVICE_TOOL_RUNTIME_ROOT?.trim();
  const toolPath =
    configuredToolPath && existsSync(configuredToolPath)
      ? configuredToolPath
      : join(repoRoot, "tool");

  if (port === 8668) {
    return {
      command: toolPython.command,
      args: [...toolPython.args, "main.py"],
      cwd: toolPath,
    };
  }

  const launchScript = [
    "import os",
    "os.environ.setdefault('DEVICE_API_HOME', os.getcwd())",
    "import uvicorn",
    `uvicorn.run('api.app:app', host='0.0.0.0', port=${port}, log_level='info', ws_ping_interval=None, ws_ping_timeout=None, ws_per_message_deflate=False)`,
  ].join("; ");

  return {
    command: toolPython.command,
    args: [...toolPython.args, "-c", launchScript],
    cwd: toolPath,
  };
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
    "import sys, fastapi, uvicorn; raise SystemExit(0 if sys.version_info[:2] == (3, 11) else 1)",
  ]);
}

function isPython311Path(pythonPath: string) {
  return /(?:Python311|cpython-3\.11|\\3\.11\\)/i.test(pythonPath);
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
