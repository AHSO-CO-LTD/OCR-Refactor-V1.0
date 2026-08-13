import { DongilSyncOutboxStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DongilSyncService } from './dongil-sync.service';

describe('DongilSyncService capture outbox', () => {
  it('snapshots the assigned profile/model tuple when the inspection is created', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      dongilProductAssignment: {
        findUnique: jest.fn().mockResolvedValue({
          productCode: 'IS-35R',
          profileVersion: 3,
          modelVersion: 'washing-v7',
        }),
      },
      dongilSyncOutbox: { create },
    } as unknown as Prisma.TransactionClient;
    const service = new DongilSyncService({} as PrismaService);

    await service.enqueueCapture(transaction, captureInput());

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        productCode: 'IS-35R',
        profileVersion: 3,
        modelVersion: 'washing-v7',
        status: DongilSyncOutboxStatus.PENDING,
        lastErrorCode: null,
      }),
    });
  });

  it('blocks the outbox item instead of guessing versions when config is unavailable', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const transaction = {
      dongilProductAssignment: { findUnique: jest.fn().mockResolvedValue(null) },
      dongilSyncOutbox: { create },
    } as unknown as Prisma.TransactionClient;
    const service = new DongilSyncService({} as PrismaService);

    await service.enqueueCapture(transaction, captureInput());

    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        profileVersion: undefined,
        modelVersion: undefined,
        status: DongilSyncOutboxStatus.BLOCKED_CONFIG,
        lastErrorCode: 'MACHINE_CONFIG_NOT_AVAILABLE',
      }),
    });
  });
});

function captureInput() {
  return {
    localResultId: 'result-1',
    productCode: 'IS-35R',
    result: 'OK' as const,
    localSessionId: 'session-1',
    inspectedAt: new Date('2026-08-13T01:02:03.000Z'),
  };
}
