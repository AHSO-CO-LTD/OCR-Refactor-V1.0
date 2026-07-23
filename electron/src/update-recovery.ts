import { app } from "electron";
import { spawn } from "node:child_process";
import { createWriteStream, existsSync, promises as fs } from "node:fs";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

type RecoveryStatus = "completed" | "installing" | "rolled-back" | "validating";

type BackedUpFile = {
  backupPath: string;
  targetPath: string;
};

type UpdateRecoveryRecord = {
  backupDirectory: string;
  backedUpFiles: BackedUpFile[];
  createdAt: string;
  databaseBackupPath: string;
  failure?: string;
  fromVersion: string;
  previousInstallerPath: string;
  status: RecoveryStatus;
  targetVersion: string;
  updatedAt: string;
};

export type UpdateRecoveryNotice = {
  failure?: string;
  fromVersion: string;
  status: "completed" | "rolled-back";
  targetVersion: string;
};

type UpdateRecoveryManagerOptions = {
  onLog: (message: string) => void;
  programDataRoot: string;
  userDataRoot: string;
};

const releaseApiBase =
  "https://api.github.com/repos/AHSO-CO-LTD/OCR-Refactor-V1.0/releases/tags";

export class UpdateRecoveryManager {
  private readonly markerPath: string;
  private readonly updatesRoot: string;

  constructor(private readonly options: UpdateRecoveryManagerOptions) {
    this.updatesRoot = join(options.programDataRoot, "updates");
    this.markerPath = join(this.updatesRoot, "pending-update.json");
  }

  async prepare(targetVersion: string) {
    if (!app.isPackaged) {
      throw new Error("Update recovery preparation is only available in packaged builds.");
    }

    const fromVersion = app.getVersion();
    const backupDirectory = join(
      this.updatesRoot,
      "backups",
      `${fromVersion}-to-${targetVersion}-${Date.now()}`,
    );
    await fs.mkdir(backupDirectory, { recursive: true });

    this.options.onLog("[update] Backing up runtime configuration...");
    const backedUpFiles = await this.backupConfiguration(backupDirectory);
    const databaseBackupPath = join(backupDirectory, "database.dump");
    await this.backupDatabase(databaseBackupPath);

    this.options.onLog("[update] Ensuring the current installer is available for rollback...");
    const previousInstallerPath = await this.ensureCurrentInstaller(fromVersion);
    const now = new Date().toISOString();
    const record: UpdateRecoveryRecord = {
      backupDirectory,
      backedUpFiles,
      createdAt: now,
      databaseBackupPath,
      fromVersion,
      previousInstallerPath,
      status: "installing",
      targetVersion,
      updatedAt: now,
    };
    await this.writeRecord(record);
    this.options.onLog(`[update] Recovery checkpoint ready for ${fromVersion}.`);
    return record;
  }

  async armInstallerFailureRollback() {
    const record = await this.readRecord();
    if (!record || record.status !== "installing") {
      throw new Error("Update recovery checkpoint is not ready for installation.");
    }

    if (!existsSync(record.previousInstallerPath)) {
      throw new Error(`Rollback installer is missing: ${record.previousInstallerPath}`);
    }

    const fallbackScript = createInstallerFailureRollbackScript(this.markerPath);
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-WindowStyle",
        "Hidden",
        "-Command",
        fallbackScript,
      ],
      {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      },
    );
    child.unref();
    this.options.onLog("[update] Installer rollback watchdog armed.");
  }

  async markStartupValidationStarted() {
    const record = await this.readRecord();
    if (!record || record.status !== "installing") return;

    if (record.fromVersion === app.getVersion()) {
      await this.writeRecord({
        ...record,
        failure: "The update installer did not replace the current application version.",
        status: "rolled-back",
        updatedAt: new Date().toISOString(),
      });
      this.options.onLog("[update] Update installer did not replace the current version; keeping it active.");
      return;
    }

    await this.writeRecord({
      ...record,
      status: "validating",
      updatedAt: new Date().toISOString(),
    });
    this.options.onLog(
      `[update] Validating startup for ${record.fromVersion} -> ${record.targetVersion}.`,
    );
  }

  async markStartupHealthy() {
    const record = await this.readRecord();
    if (
      !record ||
      (record.status !== "installing" && record.status !== "validating") ||
      record.fromVersion === app.getVersion()
    ) {
      return;
    }

    await this.writeRecord({
      ...record,
      status: "completed",
      updatedAt: new Date().toISOString(),
    });
    this.options.onLog(
      `[update] Update ${record.fromVersion} -> ${record.targetVersion} passed startup validation.`,
    );
  }

  async rollbackAfterStartupFailure(error: unknown) {
    const record = await this.readRecord();
    if (
      !record ||
      (record.status !== "installing" && record.status !== "validating") ||
      record.fromVersion === app.getVersion()
    ) {
      return false;
    }

    const failure = error instanceof Error ? error.message : String(error);
    this.options.onLog(`[update] Startup validation failed: ${failure}`);
    this.options.onLog("[update] Restoring the database and previous configuration...");
    await this.restoreDatabase(record.databaseBackupPath);
    await this.restoreConfiguration(record.backedUpFiles);
    await this.writeRecord({
      ...record,
      failure,
      status: "rolled-back",
      updatedAt: new Date().toISOString(),
    });

    if (!existsSync(record.previousInstallerPath)) {
      throw new Error(
        `Rollback installer is missing: ${record.previousInstallerPath}`,
      );
    }

    this.options.onLog(`[update] Launching rollback installer ${basename(record.previousInstallerPath)}.`);
    const child = spawn(record.previousInstallerPath, ["/S", "--updated"], {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
    });
    child.unref();
    return true;
  }

  async getNotice(): Promise<UpdateRecoveryNotice | null> {
    const record = await this.readRecord();
    if (!record || (record.status !== "completed" && record.status !== "rolled-back")) {
      return null;
    }
    return {
      failure: record.failure,
      fromVersion: record.fromVersion,
      status: record.status,
      targetVersion: record.targetVersion,
    };
  }

  async acknowledgeNotice() {
    const record = await this.readRecord();
    if (!record || record.status === "installing") return;
    await fs.rm(this.markerPath, { force: true });
  }

  private async backupConfiguration(backupDirectory: string) {
    const candidates = [
      join(this.options.programDataRoot, ".env"),
      join(this.options.programDataRoot, "support-dev-credential.json"),
      join(this.options.userDataRoot, "window-settings.json"),
      join(this.options.userDataRoot, "test-storage-settings.json"),
      join(this.options.userDataRoot, "language-settings.json"),
    ];
    const backedUpFiles: BackedUpFile[] = [];

    for (const [index, targetPath] of candidates.entries()) {
      if (!existsSync(targetPath)) continue;
      const backupPath = join(backupDirectory, `config-${index}-${basename(targetPath)}`);
      await fs.copyFile(targetPath, backupPath);
      backedUpFiles.push({ backupPath, targetPath });
    }

    if (!backedUpFiles.some((file) => basename(file.targetPath) === ".env")) {
      throw new Error("Runtime .env was not found; update cannot create a safe checkpoint.");
    }
    return backedUpFiles;
  }

  private async restoreConfiguration(files: BackedUpFile[]) {
    for (const file of files) {
      await fs.mkdir(dirname(file.targetPath), { recursive: true });
      await fs.copyFile(file.backupPath, file.targetPath);
    }
  }

  private async backupDatabase(outputPath: string) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is missing; database backup cannot run.");
    }
    const database = parseDatabaseUrl(databaseUrl);
    const pgDump = await findPostgresTool("pg_dump.exe");
    await runProcess(pgDump, [
      "--format=custom",
      "--no-owner",
      "--no-privileges",
      "--host",
      database.host,
      "--port",
      database.port,
      "--username",
      database.user,
      "--dbname",
      database.name,
      "--file",
      outputPath,
    ], { PGPASSWORD: database.password });
    const stat = await fs.stat(outputPath);
    if (stat.size <= 0) throw new Error("PostgreSQL backup is empty.");
    this.options.onLog(`[update] Database backup created (${stat.size} bytes).`);
  }

  private async restoreDatabase(backupPath: string) {
    if (!existsSync(backupPath)) throw new Error(`Database backup is missing: ${backupPath}`);
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) throw new Error("DATABASE_URL is missing; database cannot be restored.");
    const database = parseDatabaseUrl(databaseUrl);
    const pgRestore = await findPostgresTool("pg_restore.exe");
    await runProcess(pgRestore, [
      "--clean",
      "--if-exists",
      "--no-owner",
      "--no-privileges",
      "--exit-on-error",
      "--host",
      database.host,
      "--port",
      database.port,
      "--username",
      database.user,
      "--dbname",
      database.name,
      backupPath,
    ], { PGPASSWORD: database.password });
  }

  private async ensureCurrentInstaller(version: string) {
    const installerDirectory = join(this.updatesRoot, "installers");
    await fs.mkdir(installerDirectory, { recursive: true });
    const expectedName = `AHSO-OCR-Setup-${version}-x64.exe`;
    const expectedPath = join(installerDirectory, expectedName);
    if (existsSync(expectedPath)) {
      if (await isInstallerValid(expectedPath)) return expectedPath;
      await fs.rm(expectedPath, { force: true });
    }

    const existing = (await fs.readdir(installerDirectory)).find(
      (name) => name.endsWith(".exe") && name.includes(version),
    );
    if (existing) {
      const existingPath = join(installerDirectory, existing);
      if (await isInstallerValid(existingPath)) return existingPath;
      await fs.rm(existingPath, { force: true });
    }

    const releaseResponse = await fetch(`${releaseApiBase}/v${version}`, {
      headers: { Accept: "application/vnd.github+json", "User-Agent": "AHSO-OCR-Updater" },
    });
    if (!releaseResponse.ok) {
      throw new Error(`Cannot locate rollback release v${version} (${releaseResponse.status}).`);
    }
    const release = (await releaseResponse.json()) as {
      assets?: Array<{ browser_download_url?: string; name?: string }>;
    };
    const asset = release.assets?.find(
      (item) => item.name === expectedName || item.name?.endsWith(".exe"),
    );
    if (!asset?.browser_download_url) {
      throw new Error(`Release v${version} does not contain a Windows Setup .exe for rollback.`);
    }
    const download = await fetch(asset.browser_download_url, {
      headers: { "User-Agent": "AHSO-OCR-Updater" },
    });
    if (!download.ok || !download.body) {
      throw new Error(`Cannot download rollback installer (${download.status}).`);
    }
    await pipeline(
      createReadStreamFromResponse(download),
      createWriteStream(expectedPath),
    );
    await assertInstallerValid(expectedPath);
    return expectedPath;
  }

  private async readRecord(): Promise<UpdateRecoveryRecord | null> {
    if (!existsSync(this.markerPath)) return null;
    try {
      return JSON.parse(await fs.readFile(this.markerPath, "utf8")) as UpdateRecoveryRecord;
    } catch (error) {
      this.options.onLog(`[update] Cannot read recovery marker: ${String(error)}`);
      return null;
    }
  }

  private async writeRecord(record: UpdateRecoveryRecord) {
    await fs.mkdir(this.updatesRoot, { recursive: true });
    await fs.writeFile(this.markerPath, JSON.stringify(record, null, 2), "utf8");
  }
}

function createInstallerFailureRollbackScript(markerPath: string) {
  const watchdogTimeoutSeconds = 180;
  const escapedMarkerPath = markerPath.replace(/'/g, "''");

  return [
    "$ErrorActionPreference = 'Stop'",
    `Start-Sleep -Seconds ${watchdogTimeoutSeconds}`,
    `$markerPath = '${escapedMarkerPath}'`,
    "if (-not (Test-Path -LiteralPath $markerPath)) { exit 0 }",
    "$record = Get-Content -LiteralPath $markerPath -Raw | ConvertFrom-Json",
    "if ($record.status -ne 'installing') { exit 0 }",
    "if (-not $record.previousInstallerPath -or -not (Test-Path -LiteralPath $record.previousInstallerPath)) { exit 0 }",
    "$record.status = 'rolled-back'",
    "$record.failure = 'The update installer did not restart the new application before the recovery timeout.'",
    "$record.updatedAt = [DateTime]::UtcNow.ToString('o')",
    "$record | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $markerPath -Encoding UTF8",
    "Start-Process -FilePath $record.previousInstallerPath -ArgumentList @('/S', '--updated') -WindowStyle Hidden",
  ].join("; ");
}

function createReadStreamFromResponse(response: Response) {
  const body = response.body;
  if (!body) throw new Error("Download response did not contain a body.");
  return Readable.fromWeb(
    body as unknown as import("node:stream/web").ReadableStream,
  );
}

async function findPostgresTool(name: "pg_dump.exe" | "pg_restore.exe") {
  const postgresRoot = "C:\\Program Files\\PostgreSQL";
  if (existsSync(postgresRoot)) {
    const versions = await fs.readdir(postgresRoot, { withFileTypes: true });
    const candidates = versions
      .filter((item) => item.isDirectory())
      .map((item) => join(postgresRoot, item.name, "bin", name))
      .filter(existsSync)
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
    if (candidates[0]) return candidates[0];
  }
  return name;
}

function runProcess(command: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...extraEnv },
      windowsHide: true,
    });
    let stderr = "";
    child.stderr?.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${basename(command)} failed with code ${code ?? "unknown"}: ${stderr.trim()}`));
    });
  });
}

function parseDatabaseUrl(databaseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is invalid; update checkpoint cannot continue.");
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  const user = decodeURIComponent(parsed.username);
  if (!parsed.hostname || !name || !user) {
    throw new Error("DATABASE_URL is incomplete; update checkpoint cannot continue.");
  }
  return {
    host: parsed.hostname,
    name,
    password: decodeURIComponent(parsed.password),
    port: parsed.port || "5432",
    user,
  };
}

async function assertInstallerValid(filePath: string) {
  const stat = await fs.stat(filePath);
  if (stat.size < 1024 * 1024) {
    throw new Error(`Rollback installer is incomplete: ${filePath}`);
  }
}

async function isInstallerValid(filePath: string) {
  try {
    await assertInstallerValid(filePath);
    return true;
  } catch {
    return false;
  }
}
