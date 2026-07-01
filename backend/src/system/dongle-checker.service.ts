import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { execFile, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type DongleCheckResult = {
  ok: boolean;
  retcode: number | null;
  checkedAt: string;
  code: string;
  message: string;
  dllPath: string | null;
};

type DongleHelperPayload = {
  ok?: boolean;
  retcode?: number | null;
  checkedAt?: string;
  error?: string;
};

@Injectable()
export class DongleCheckerService {
  constructor(private readonly configService: ConfigService) {}

  async check(): Promise<DongleCheckResult> {
    if (this.isMockMode()) {
      return {
        ok: true,
        retcode: 0,
        checkedAt: new Date().toISOString(),
        code: 'DONGLE_MOCK_OK',
        message: 'Dongle mock mode is enabled',
        dllPath: null,
      };
    }

    const dllPath = this.resolveDllPath();

    if (!dllPath || !existsSync(dllPath)) {
      return {
        ok: false,
        retcode: null,
        checkedAt: new Date().toISOString(),
        code: 'DONGLE_DLL_NOT_FOUND',
        message: 'Dongle DLL was not found',
        dllPath,
      };
    }

    const helperPath = resolve(process.cwd(), 'scripts', 'check-dongle.py');

    if (!existsSync(helperPath)) {
      return {
        ok: false,
        retcode: null,
        checkedAt: new Date().toISOString(),
        code: 'DONGLE_HELPER_NOT_FOUND',
        message: 'Dongle helper script was not found',
        dllPath,
      };
    }

    try {
      const { command, args } = this.resolvePythonCommand();
      const retryCount = this.configService.get<string>(
        'DONGLE_RETRY_COUNT',
        '3',
      );
      const retryInterval = this.configService.get<string>(
        'DONGLE_RETRY_INTERVAL_MS',
        '1000',
      );
      const timeout = Number(
        this.configService.get<string>('DONGLE_CHECK_TIMEOUT_MS', '7000'),
      );
      const { stdout } = await execFileAsync(
        command,
        [
          ...args,
          helperPath,
          '--dll',
          dllPath,
          '--retry-count',
          retryCount,
          '--retry-interval',
          String(Math.max(Number(retryInterval) / 1000, 0)),
        ],
        {
          windowsHide: true,
          timeout: Number.isFinite(timeout) ? timeout : 7000,
        },
      );
      const payload = this.parseHelperOutput(stdout);
      const retcode =
        typeof payload.retcode === 'number' ? payload.retcode : null;
      const ok = payload.ok === true && retcode === 0;

      return {
        ok,
        retcode,
        checkedAt: payload.checkedAt ?? new Date().toISOString(),
        code: ok ? 'DONGLE_OK' : `DONGLE_RETCODE_${retcode ?? 'UNKNOWN'}`,
        message: ok
          ? 'Dongle check passed'
          : (payload.error ?? 'Dongle check failed'),
        dllPath,
      };
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : 'Dongle check failed';

      return {
        ok: false,
        retcode: null,
        checkedAt: new Date().toISOString(),
        code: 'DONGLE_CHECK_ERROR',
        message,
        dllPath,
      };
    }
  }

  private isMockMode() {
    return this.configService.get<string>('DONGLE_MOCK_MODE') === 'true';
  }

  private resolveDllPath() {
    const configuredPath = this.configService.get<string>('DONGLE_DLL_PATH');

    if (configuredPath) {
      return resolve(configuredPath);
    }

    return join(process.cwd(), 'native', 'System8.dll');
  }

  private resolvePythonCommand() {
    const configuredCommand = this.configService.get<string>(
      'DONGLE_PYTHON_COMMAND',
    );

    if (configuredCommand) {
      const [command, ...args] = configuredCommand.split(' ').filter(Boolean);
      return { command, args };
    }

    if (process.platform !== 'win32') {
      if (this.canRunDonglePython('python3', [])) {
        return { command: 'python3', args: [] };
      }

      return { command: 'python', args: [] };
    }

    const candidates = [
      { command: 'py', args: ['-3.9'] },
      { command: 'py', args: ['-3.11'] },
      ...this.getWindowsPythonLauncherPaths().map((pythonPath) => ({
        command: pythonPath,
        args: [] as string[],
      })),
      { command: 'python', args: [] },
    ];

    for (const candidate of candidates) {
      if (this.canRunDonglePython(candidate.command, candidate.args)) {
        return candidate;
      }
    }

    if (this.canRun('uv', ['--version'])) {
      return { command: 'uv', args: ['run', '--python', '3.11', 'python'] };
    }

    return { command: 'py', args: ['-3.9'] };
  }

  private canRun(command: string, args: string[]) {
    const result = spawnSync(command, args, {
      stdio: 'ignore',
      windowsHide: true,
    });

    return result.status === 0;
  }

  private canRunDonglePython(command: string, args: string[]) {
    return this.canRun(command, [...args, '-c', 'import ctypes']);
  }

  private getWindowsPythonLauncherPaths() {
    const result = spawnSync('py', ['-0p'], {
      encoding: 'utf8',
      windowsHide: true,
    });

    if (result.status !== 0) {
      return [];
    }

    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;

    return output
      .split(/\r?\n/)
      .map((line) => line.match(/([A-Za-z]:\\.*?python\.exe)\s*$/i)?.[1])
      .filter((pythonPath): pythonPath is string => Boolean(pythonPath));
  }

  private parseHelperOutput(stdout: string): DongleHelperPayload {
    const line = stdout
      .split(/\r?\n/)
      .map((item) => item.trim())
      .filter(Boolean)
      .at(-1);

    if (!line) {
      return {};
    }

    try {
      return JSON.parse(line) as DongleHelperPayload;
    } catch {
      return { error: line };
    }
  }
}
