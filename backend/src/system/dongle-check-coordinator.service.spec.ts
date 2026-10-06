import {
  DongleCheckerService,
  type DongleCheckResult,
} from './dongle-checker.service';
import { DongleCheckCoordinatorService } from './dongle-check-coordinator.service';

describe('DongleCheckCoordinatorService', () => {
  it('shares one in-flight native dongle check', async () => {
    let resolveCheck!: (value: DongleCheckResult) => void;
    const nativeCheck = new Promise<DongleCheckResult>((resolve) => {
      resolveCheck = resolve;
    });
    const check = jest.fn().mockReturnValue(nativeCheck);
    const checker = { check } as unknown as DongleCheckerService;
    const coordinator = new DongleCheckCoordinatorService(checker);

    const first = coordinator.check();
    const second = coordinator.check();
    expect(first).toBe(second);
    expect(check).toHaveBeenCalledTimes(1);

    resolveCheck(result({ ok: true, code: 'DONGLE_OK', message: 'OK' }));
    await expect(first).resolves.toEqual(
      expect.objectContaining({ failureKind: null }),
    );
  });

  it.each([
    ['DONGLE_RETCODE_3', 'not found', 'NOT_FOUND'],
    ['DONGLE_RETCODE_8', 'invalid', 'INVALID'],
    ['DONGLE_DLL_NOT_FOUND', 'missing DLL', 'HELPER_ERROR'],
    ['DONGLE_CHECK_FAILED', 'operation timed out', 'TIMEOUT'],
    ['DONGLE_CHECK_FAILED', 'resource busy', 'TRANSIENT_BUSY'],
    ['DONGLE_CHECK_FAILED', 'unexpected helper error', 'HELPER_ERROR'],
  ] as const)('classifies %s/%s as %s', async (code, message, expected) => {
    const checker = {
      check: jest.fn().mockResolvedValue(result({ ok: false, code, message })),
    } as unknown as DongleCheckerService;
    const coordinator = new DongleCheckCoordinatorService(checker);

    await expect(coordinator.check()).resolves.toEqual(
      expect.objectContaining({ failureKind: expected }),
    );
  });
});

function result(
  partial: Pick<DongleCheckResult, 'ok' | 'code' | 'message'>,
): DongleCheckResult {
  return {
    ...partial,
    retcode: partial.ok ? 0 : null,
    checkedAt: new Date('2026-10-06T00:00:00.000Z').toISOString(),
    dllPath: partial.ok ? 'System8.dll' : null,
  };
}
