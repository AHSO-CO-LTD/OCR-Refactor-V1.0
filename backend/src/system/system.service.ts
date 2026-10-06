import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  DongleCheckCoordinatorService,
  type DongleFailureKind,
} from './dongle-check-coordinator.service';

type ResolvedLicenseState = {
  status: 'licensed' | 'unlicensed' | 'unknown';
  licensed: boolean | null;
  donglePresent: boolean | null;
  lastCheckedAt: string | null;
  code: string | null;
  message: string | null;
  failureKind: DongleFailureKind | null;
};

type LicenseCheckOptions = {
  persist?: boolean;
};

@Injectable()
export class SystemService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dongleChecks: DongleCheckCoordinatorService,
  ) {}

  async checkLicenseStatus(options: LicenseCheckOptions = {}) {
    const persist = options.persist ?? true;
    const check = await this.dongleChecks.check();
    const definitiveFailure =
      check.failureKind === 'NOT_FOUND' || check.failureKind === 'INVALID';
    const status = check.ok
      ? 'licensed'
      : definitiveFailure
        ? 'unlicensed'
        : 'unknown';
    const persistedCode = normalizeDongleCode(check);
    const checkedAt = new Date();

    if (persist) {
      await this.prisma.licenseLog.create({
        data: {
          status,
          code: persistedCode,
          message: check.message,
        },
      });
    }

    return {
      data: {
        status,
        licensed: check.ok ? true : definitiveFailure ? false : null,
        donglePresent: check.ok
          ? true
          : check.failureKind === 'NOT_FOUND'
            ? false
            : check.failureKind === 'INVALID'
              ? true
              : null,
        lastCheckedAt: checkedAt.toISOString(),
        code: persistedCode,
        message: check.message,
        failureKind: check.failureKind,
      },
    };
  }

  async assertLoginAllowed() {
    const response = await this.checkLicenseStatus();

    if (!response.data.licensed || !response.data.donglePresent) {
      return false;
    }

    return true;
  }

  async assertAutoLoginAllowed() {
    const response = await this.checkLicenseStatus();

    return (
      response.data.licensed === true &&
      response.data.donglePresent === true &&
      response.data.code === 'DONGLE_OK'
    );
  }

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
          failureKind: null,
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
    const failureKind = resolvePersistedFailureKind(code);
    if (failureKind) {
      const definitive =
        failureKind === 'NOT_FOUND' || failureKind === 'INVALID';
      return {
        status: definitive ? 'unlicensed' : 'unknown',
        licensed: definitive ? false : null,
        donglePresent:
          failureKind === 'NOT_FOUND'
            ? false
            : failureKind === 'INVALID'
              ? true
              : null,
        lastCheckedAt: null,
        code: code ?? null,
        message: message ?? null,
        failureKind,
      };
    }

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
      failureKind: null,
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

function normalizeDongleCode(check: {
  code: string;
  failureKind: DongleFailureKind | null;
}) {
  if (!check.failureKind) return check.code;
  return `DONGLE_${check.failureKind}`;
}

function resolvePersistedFailureKind(
  code?: string | null,
): DongleFailureKind | null {
  const normalized = code?.replace(/^DONGLE_/, '');
  return normalized === 'NOT_FOUND' ||
    normalized === 'INVALID' ||
    normalized === 'TIMEOUT' ||
    normalized === 'HELPER_ERROR' ||
    normalized === 'TRANSIENT_BUSY'
    ? normalized
    : null;
}
