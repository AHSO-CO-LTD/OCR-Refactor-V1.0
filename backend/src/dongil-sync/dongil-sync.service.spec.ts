import { DongilSyncOutboxStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DongilSyncService, normalizeDongilOperationalStatus } from './dongil-sync.service';

describe('Dongil runtime state normalization', () => {
  it.each([
    ['running', 'RUNNING'],
    ['idle_machine_stop', 'PAUSED'],
    ['idle_capture_timeout', 'PAUSED'],
    ['inactive', 'STOPPED'],
    ['resuming', 'STARTING'],
    ['waiting_camera', 'STARTING'],
    ['stopping', 'STOPPING'],
    ['restart_required', 'ERROR'],
    ['error', 'ERROR'],
  ] as const)('maps %s to %s', (runtimeState, expected) => {
    expect(normalizeDongilOperationalStatus(runtimeState)).toBe(expected);
  });
});

describe('DongilSyncService capture outbox', () => {
  it('queues product identity without requiring a server profile/model assignment', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      dongilSyncOutbox: { create },
    } as unknown as Prisma.TransactionClient;
    const service = new DongilSyncService({} as PrismaService, {} as never);

    await service.enqueueCapture(transaction, captureInput());

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productCode: 'IS-35R',
        productName: 'IS-35R product',
        profileVersion: null,
        modelVersion: null,
        okCount: 4,
        ngCount: 1,
        status: DongilSyncOutboxStatus.PENDING,
        lastErrorCode: null,
      }),
    });
  });
});

function captureInput() {
  return {
    localResultId: 'result-1',
    productCode: 'IS-35R',
    productName: 'IS-35R product',
    result: 'OK' as const,
    okCount: 4,
    ngCount: 1,
    localSessionId: 'session-1',
    inspectedAt: new Date('2026-08-13T01:02:03.000Z'),
  };
}
