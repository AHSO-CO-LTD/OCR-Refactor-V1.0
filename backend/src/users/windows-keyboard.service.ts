import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
} from '@nestjs/common';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

type KeyboardTarget = {
  path: string;
  type: 'touch' | 'osk';
};

@Injectable()
export class WindowsKeyboardService {
  async open() {
    if (process.platform !== 'win32') {
      throw new BadRequestException(
        'Windows virtual keyboard is only available on Windows',
      );
    }

    const keyboardTargets = this.resolveKeyboardTargets();

    if (keyboardTargets.length === 0) {
      throw new InternalServerErrorException(
        'Windows virtual keyboard is not available on this machine',
      );
    }

    let openedKeyboard: KeyboardTarget | null = null;

    for (const keyboardTarget of keyboardTargets) {
      const opened = await this.tryOpenKeyboard(keyboardTarget);

      if (opened) {
        openedKeyboard = keyboardTarget;
        break;
      }
    }

    if (!openedKeyboard) {
      throw new InternalServerErrorException(
        'Cannot open Windows virtual keyboard',
      );
    }

    return {
      data: {
        success: true,
        keyboardType: openedKeyboard.type,
      },
    };
  }

  private resolveKeyboardTargets(): KeyboardTarget[] {
    const windir = process.env.WINDIR ?? 'C:\\Windows';
    const commonProgramFiles =
      process.env.CommonProgramFiles ?? 'C:\\Program Files\\Common Files';

    const candidates: KeyboardTarget[] = [
      {
        path: join(windir, 'System32', 'osk.exe'),
        type: 'osk',
      },
      {
        path: join(commonProgramFiles, 'microsoft shared', 'ink', 'TabTip.exe'),
        type: 'touch',
      },
    ];

    return candidates.filter((candidate) => existsSync(candidate.path));
  }

  private tryOpenKeyboard(target: KeyboardTarget) {
    return new Promise<boolean>((resolve) => {
      try {
        const child = spawn(
          this.resolvePowerShellPath(),
          [
            '-NoProfile',
            '-NonInteractive',
            '-ExecutionPolicy',
            'Bypass',
            '-Command',
            `Start-Process -FilePath '${target.path.replace(/'/g, "''")}' -WindowStyle Normal`,
          ],
          {
            detached: false,
            stdio: 'ignore',
            windowsHide: true,
          },
        );

        child.once('error', () => {
          resolve(false);
        });

        child.once('exit', (code) => {
          resolve(code === 0);
        });
      } catch {
        resolve(false);
      }
    });
  }

  private resolvePowerShellPath() {
    const windir = process.env.WINDIR ?? 'C:\\Windows';

    return join(
      windir,
      'System32',
      'WindowsPowerShell',
      'v1.0',
      'powershell.exe',
    );
  }
}
