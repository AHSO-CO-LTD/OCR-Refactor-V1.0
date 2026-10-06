import { Injectable } from '@nestjs/common';
import {
  DongleCheckerService,
  type DongleCheckResult,
} from './dongle-checker.service';

export type DongleFailureKind =
  | 'NOT_FOUND'
  | 'INVALID'
  | 'TIMEOUT'
  | 'HELPER_ERROR'
  | 'TRANSIENT_BUSY';

export type CoordinatedDongleCheck = DongleCheckResult & {
  failureKind: DongleFailureKind | null;
};

@Injectable()
export class DongleCheckCoordinatorService {
  private inFlight: Promise<CoordinatedDongleCheck> | null = null;

  constructor(private readonly dongleChecker: DongleCheckerService) {}

  check() {
    if (this.inFlight) return this.inFlight;

    const current = this.dongleChecker
      .check()
      .then((result) => ({
        ...result,
        failureKind: classifyDongleFailure(result),
      }))
      .finally(() => {
        if (this.inFlight === current) this.inFlight = null;
      });
    this.inFlight = current;
    return current;
  }
}

function classifyDongleFailure(
  result: DongleCheckResult,
): DongleFailureKind | null {
  if (result.ok) return null;

  if (result.code === 'DONGLE_RETCODE_3') return 'NOT_FOUND';
  if (
    result.code === 'DONGLE_DLL_NOT_FOUND' ||
    result.code === 'DONGLE_HELPER_NOT_FOUND'
  ) {
    return 'HELPER_ERROR';
  }
  if (result.code.startsWith('DONGLE_RETCODE_')) return 'INVALID';

  const diagnostic = `${result.code} ${result.message}`.toLowerCase();
  if (
    diagnostic.includes('timed out') ||
    diagnostic.includes('timeout') ||
    diagnostic.includes('etimedout')
  ) {
    return 'TIMEOUT';
  }
  if (
    diagnostic.includes('busy') ||
    diagnostic.includes('ebusy') ||
    diagnostic.includes('temporarily unavailable') ||
    diagnostic.includes('resource unavailable')
  ) {
    return 'TRANSIENT_BUSY';
  }
  return 'HELPER_ERROR';
}
