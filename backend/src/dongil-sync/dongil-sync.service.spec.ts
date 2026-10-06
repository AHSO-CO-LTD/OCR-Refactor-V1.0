import { DongilSyncOutboxStatus, type Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import {
  DongilSyncService,
  normalizeDongilOperationalStatus,
} from './dongil-sync.service';

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
    const createCalls = (create as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const createInput = createCalls[0]?.[0] as {
      data: Record<string, unknown>;
    };

    expect(createInput.data).toMatchObject({
      productCode: 'IS-35R',
      productName: 'IS-35R product',
      profileVersion: null,
      modelVersion: null,
      okCount: 4,
      ngCount: 1,
      status: DongilSyncOutboxStatus.PENDING,
      lastErrorCode: null,
    });
  });
});

describe('DongilSyncService connection diagnostics', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns failed health and skipped downstream stages without throwing', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const service = new DongilSyncService({} as PrismaService, {} as never);

    const response = await service.testConnection({
      serverUrl: 'http://127.0.0.1:3979',
    });

    expect(response.data.reachable).toBe(false);
    expect(response.data.stages).toEqual([
      { id: 'URL_VALIDATION', status: 'PASSED' },
      {
        id: 'SERVER_HEALTH',
        status: 'FAILED',
        code: 'DONGIL_SERVER_UNAVAILABLE',
      },
      { id: 'REGISTRATION', status: 'SKIPPED' },
      { id: 'MACHINE_TYPE', status: 'SKIPPED' },
    ]);
  });

  it('fails closed when the server assigns another machine type', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { status: 'ok' } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: 200,
            data: {
              machineId: 'machine-1',
              registrationStatus: 'APPROVED',
              assignedMachineTypeCode: 'OTHER_MACHINE',
              rejectionReason: null,
              credentialReady: true,
              displayName: 'Wrong assignment',
              isActive: true,
              factoryName: null,
              lineName: null,
              stationName: null,
            },
            message: 'ok',
            error: null,
          }),
          { status: 200 },
        ),
      );
    const service = new DongilSyncService({} as PrismaService, {} as never);

    const response = await service.testConnection({
      serverUrl: 'http://127.0.0.1:3979',
      machineId: 'machine-1',
      credential: 'credential-1234567890',
    });

    expect(response.data.stages).toContainEqual({
      id: 'MACHINE_TYPE',
      status: 'FAILED',
      code: 'DONGIL_MACHINE_TYPE_MISMATCH',
    });
  });
});

describe('DongilSyncService legacy configuration import', () => {
  const originalLegacyUrl = process.env.DONGIL_SERVER_URL;

  afterEach(() => {
    if (originalLegacyUrl === undefined) {
      delete process.env.DONGIL_SERVER_URL;
    } else {
      process.env.DONGIL_SERVER_URL = originalLegacyUrl;
    }
  });

  it('keeps a valid database URL authoritative over legacy env', async () => {
    process.env.DONGIL_SERVER_URL = 'http://192.168.3.79:3979';
    const update = jest.fn().mockResolvedValue(undefined);
    const prisma = {
      dongilSyncConfiguration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          serverUrl: 'http://192.168.3.4:3979',
          legacyEnvImportedAt: null,
        }),
        update,
      },
    };
    const service = new DongilSyncService(
      prisma as unknown as PrismaService,
      {} as never,
    );

    await importLegacyConfiguration(service);
    const updateCalls = (update as unknown as { mock: { calls: unknown[][] } })
      .mock.calls;
    const updateInput = updateCalls[0]?.[0] as {
      data: { machineTypeCode: string; serverUrl: string };
      where: { id: string };
    };

    expect(updateInput.where).toEqual({ id: 'default' });
    expect(updateInput.data).toMatchObject({
      serverUrl: 'http://192.168.3.4:3979',
      machineTypeCode: 'WASHING_MACHINE',
    });
  });

  it('imports a valid legacy URL only when the database is unconfigured', async () => {
    process.env.DONGIL_SERVER_URL = 'http://192.168.3.79:3979';
    const transaction = {
      dongilSyncConfiguration: {
        upsert: jest.fn().mockResolvedValue({
          serverUrl: 'http://192.168.3.79:3979',
          machineTypeCode: 'WASHING_MACHINE',
          configVersion: 2,
        }),
      },
      auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    };
    const prisma = {
      dongilSyncConfiguration: {
        findUnique: jest.fn().mockResolvedValue(null),
      },
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    };
    const service = new DongilSyncService(
      prisma as unknown as PrismaService,
      {} as never,
    );

    await importLegacyConfiguration(service);
    const upsertCalls = (
      transaction.dongilSyncConfiguration.upsert as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls;
    const upsertInput = upsertCalls[0]?.[0] as {
      create: {
        legacyEnvImportedAt: Date;
        machineTypeCode: string;
        serverUrl: string;
      };
    };

    expect(upsertInput.create.serverUrl).toBe('http://192.168.3.79:3979');
    expect(upsertInput.create.machineTypeCode).toBe('WASHING_MACHINE');
    expect(upsertInput.create.legacyEnvImportedAt).toBeInstanceOf(Date);
    expect(transaction.auditLog.create).toHaveBeenCalled();
  });

  it('does not import env again after the one-time marker is set', async () => {
    process.env.DONGIL_SERVER_URL = 'http://192.168.3.79:3979';
    const prisma = {
      dongilSyncConfiguration: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'default',
          serverUrl: null,
          legacyEnvImportedAt: new Date('2026-10-06T00:00:00.000Z'),
        }),
      },
      $transaction: jest.fn(),
    };
    const service = new DongilSyncService(
      prisma as unknown as PrismaService,
      {} as never,
    );

    await importLegacyConfiguration(service);

    expect(prisma.$transaction).not.toHaveBeenCalled();
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

function importLegacyConfiguration(service: DongilSyncService) {
  return (
    service as unknown as { importLegacyConfiguration(): Promise<void> }
  ).importLegacyConfiguration();
}
