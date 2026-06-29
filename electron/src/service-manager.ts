import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createConnection } from "node:net";
import { join } from "node:path";

export type LocalServiceName = "backend" | "device-tool" | "frontend";

type LocalServiceDefinition = {
  command: string;
  args: string[];
  cwd: string;
  healthUrl: string;
  name: LocalServiceName;
  port: number;
};

type ManagedService = LocalServiceDefinition & {
  owned: boolean;
  process: ChildProcess | null;
};

const STARTUP_TIMEOUT_MS = 120_000;
const EXISTING_SERVICE_TIMEOUT_MS = 10_000;
const HEALTH_POLL_MS = 500;
const DEVICE_TOOL_API_PREFIX = "/tool/v1";
const DEFAULT_PORTS: Record<LocalServiceName, number> = {
  backend: 4000,
  "device-tool": 8000,
  frontend: 3000,
};
const FALLBACK_PORTS: Record<LocalServiceName, { end: number; start: number }> = {
  backend: { start: 4001, end: 4099 },
  "device-tool": { start: 8001, end: 8099 },
  frontend: { start: 3001, end: 3099 },
};
const FRONTEND_ORIGINS = Array.from({ length: 100 }, (_, index) => index + 3000)
  .flatMap((port) => [
    `http://127.0.0.1:${port}`,
    `http://localhost:${port}`,
  ])
  .join(",");

export class ServiceManager {
  private readonly services: ManagedService[];
  private logListener: ((message: string) => void) | null = null;

  constructor(repoRoot: string) {
    const toolPython = resolveToolPython(repoRoot);
    const backendCommand = resolveNpmCommand([
      "run",
      "dev",
      "-w",
      "@ocr/backend",
    ]);
    const frontendCommand = resolveNpmCommand([
      "run",
      "dev",
      "-w",
      "@ocr/frontend",
      "--",
      "--port",
      "3000",
    ]);

    this.services = [
      {
        name: "device-tool",
        command: toolPython.command,
        args: [...toolPython.args, "main.py"],
        cwd: join(repoRoot, "tool"),
        healthUrl: `http://127.0.0.1:8000${DEVICE_TOOL_API_PREFIX}/health`,
        port: 8000,
        owned: false,
        process: null,
      },
      {
        name: "backend",
        command: backendCommand.command,
        args: backendCommand.args,
        cwd: repoRoot,
        healthUrl: "http://127.0.0.1:4000/api/health",
        port: 4000,
        owned: false,
        process: null,
      },
      {
        name: "frontend",
        command: frontendCommand.command,
        args: frontendCommand.args,
        cwd: repoRoot,
        healthUrl: "http://127.0.0.1:3000/login",
        port: 3000,
        owned: false,
        process: null,
      },
    ];
  }

  async startAll(onStatus: (message: string) => void) {
    for (const service of this.services) {
      await this.ensureService(service, onStatus);
    }
  }

  getFrontendUrl() {
    const frontend = this.services.find((service) => service.name === "frontend");
    return `http://127.0.0.1:${frontend?.port ?? 3000}/login`;
  }

  onLog(listener: (message: string) => void) {
    this.logListener = listener;
  }

  async stopOwned() {
    const ownedServices = [...this.services].reverse().filter(
      (service) => service.owned && service.process,
    );

    await Promise.all(
      ownedServices.map(async (service) => {
        const child = service.process;
        service.process = null;
        service.owned = false;

        if (!child || child.killed) {
          return;
        }

        if (process.platform === "win32" && child.pid) {
          await terminateWindowsProcessTree(child.pid);
          return;
        }

        child.kill("SIGTERM");
      }),
    );
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
          `port ${service.port} is occupied; looking for fallback`,
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
        this.emitLog(service.name, "ready");
        return;
      } catch {
        onStatus(
          `${service.name}: existing port ${service.port} is not responding`,
        );
        this.emitLog(
          service.name,
          `existing port ${service.port} is not responding; starting fallback`,
        );
        await this.prepareFallbackPort(service, onStatus);
      }
    }

    await this.startOwnedService(service, onStatus);
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
        ...this.createServiceEnv(service),
        FRONTEND_ORIGIN: FRONTEND_ORIGINS,
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    service.process = child;
    service.owned = true;
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
      service.healthUrl = `http://127.0.0.1:${service.port}${DEVICE_TOOL_API_PREFIX}/health`;
      return;
    }

    if (service.name === "backend") {
      service.healthUrl = `http://127.0.0.1:${service.port}/api/health`;
      return;
    }

    service.healthUrl = `http://127.0.0.1:${service.port}/login`;
    const frontendCommand = resolveNpmCommand([
      "run",
      "dev",
      "-w",
      "@ocr/frontend",
      "--",
      "--port",
      String(service.port),
    ]);
    service.command = frontendCommand.command;
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
    };
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

  return process.platform === "win32"
    ? { command: "py", args: ["-3.9"] }
    : { command: "python3", args: [] };
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

async function findAvailablePort(startPort: number, endPort: number) {
  for (let port = startPort; port <= endPort; port += 1) {
    if (!(await isPortOpen(port))) {
      return port;
    }
  }

  return null;
}

function terminateWindowsProcessTree(pid: number) {
  return new Promise<void>((resolve) => {
    const taskkill = spawn("taskkill.exe", ["/pid", String(pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
    taskkill.once("exit", () => resolve());
    taskkill.once("error", () => resolve());
  });
}
