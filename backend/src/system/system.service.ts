import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

type ResolvedLicenseState = {
  status: 'licensed' | 'unlicensed' | 'unknown';
  licensed: boolean | null;
  donglePresent: boolean | null;
  lastCheckedAt: string | null;
  code: string | null;
  message: string | null;
};

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  async getLicenseStatus() {
    const latestLog = await this.prisma.licenseLog.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!latestLog) {
      return {
        data: {
          status: 'unknown',
          licensed: null,
          donglePresent: null,
          lastCheckedAt: null,
          code: null,
          message: null,
        },
      };
    }

    const resolvedState = this.resolveLicenseState(
      latestLog.status,
      latestLog.code,
      latestLog.message,
    );

    return {
      data: {
        ...resolvedState,
        lastCheckedAt: latestLog.createdAt.toISOString(),
      },
    };
  }

  private resolveLicenseState(
    status: string,
    code?: string | null,
    message?: string | null,
  ): ResolvedLicenseState {
    const normalizedText = [status, code, message]
      .filter((value): value is string => Boolean(value))
      .join(' ')
      .toLowerCase();

    const licensed = this.resolveLicensed(normalizedText);
    const donglePresent = this.resolveDonglePresence(normalizedText, licensed);

    return {
      status:
        licensed === true
          ? 'licensed'
          : licensed === false
            ? 'unlicensed'
            : 'unknown',
      licensed,
      donglePresent,
      lastCheckedAt: null,
      code: code ?? null,
      message: message ?? null,
    };
  }

  private resolveLicensed(text: string) {
    if (
      this.containsAny(text, [
        'err_no_dongle',
        'no dongle',
        'missing dongle',
        'dongle missing',
        'unlicensed',
        'invalid',
        'expired',
        'blocked',
        'failed',
        'failure',
        'error',
        'retcode 3',
        'code 3',
      ])
    ) {
      return false;
    }

    if (
      this.containsAny(text, [
        'licensed',
        'valid',
        'success',
        'ok',
        'passed',
        'active',
        'retcode 0',
        'code 0',
      ])
    ) {
      return true;
    }

    return null;
  }

  private resolveDonglePresence(text: string, licensed: boolean | null) {
    if (
      this.containsAny(text, [
        'err_no_dongle',
        'no dongle',
        'missing dongle',
        'dongle missing',
        'removed',
        'not found',
        'absent',
        'retcode 3',
        'code 3',
      ])
    ) {
      return false;
    }

    if (
      this.containsAny(text, [
        'dongle present',
        'dongle_present',
        'inserted',
        'connected',
      ])
    ) {
      return true;
    }

    if (licensed === true) {
      return true;
    }

    return null;
  }

  private containsAny(text: string, candidates: string[]) {
    return candidates.some((candidate) => text.includes(candidate));
  }
}
