import { ConflictException } from '@nestjs/common';
import { InspectionStatus, LineSessionEndReason } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { InspectionsService } from './inspections.service';

type TestableInspectionsService = {
  buildInspectionState: (jobId: string) => Promise<unknown>;
  writeLineResultSession: (jobId: string) => Promise<void>;
};

type InspectionStopUpdate = {
  data: {
    endedById: string;
    endedByInferred: boolean;
    [key: string]: unknown;
  };
  where: { id: string };
};

describe('InspectionsService session ownership', () => {
  const product = {
    id: 'product-1',
    active: true,
    modelPath: 'models/product.pt',
    roiRegions: [{ index: 1 }],
  };

  it('lets another authenticated operator attach to the running product session', async () => {
    const existingJob = {
      id: 'job-1',
      productId: product.id,
      operatorId: 'operator-a',
      status: InspectionStatus.running,
    };
    const create = jest.fn();
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      inspectionJob: {
        create,
        findFirst: jest.fn().mockResolvedValue(existingJob),
      },
    } as unknown as PrismaService;
    const service = new InspectionsService(prisma, {} as DeviceToolService);
    const testable = service as unknown as TestableInspectionsService;
    const state = { jobId: existingJob.id, productId: product.id };
    jest.spyOn(testable, 'buildInspectionState').mockResolvedValue(state);

    await expect(
      service.beginInspectionSession(
        { productId: product.id },
        { id: 'operator-b', username: 'operator-b', role: 'operator' },
      ),
    ).resolves.toEqual({ data: state });

    expect(create).not.toHaveBeenCalled();
  });

  it('still blocks a different product while a session is running', async () => {
    const prisma = {
      product: { findUnique: jest.fn().mockResolvedValue(product) },
      inspectionJob: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'job-1',
          productId: 'another-product',
          operatorId: 'operator-a',
          status: InspectionStatus.running,
        }),
      },
    } as unknown as PrismaService;
    const service = new InspectionsService(prisma, {} as DeviceToolService);

    await expect(
      service.beginInspectionSession(
        { productId: product.id },
        { id: 'operator-b', username: 'operator-b', role: 'operator' },
      ),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('records the authenticated user who ends the session', async () => {
    const { prisma, update } = buildStopPrisma();
    const service = new InspectionsService(prisma, {} as DeviceToolService);
    mockStopSideEffects(service);

    await service.stopInspection('job-1', LineSessionEndReason.line_stop, {
      id: 'operator-b',
    });

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      data: {
        endedById: 'operator-b',
        endedByInferred: false,
      },
      where: { id: 'job-1' },
    });
  });

  it('falls back to the starter for a PLC or system-ended session', async () => {
    const { prisma, update } = buildStopPrisma();
    const service = new InspectionsService(prisma, {} as DeviceToolService);
    mockStopSideEffects(service);

    await service.stopInspection('job-1', LineSessionEndReason.plc_stop);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0]).toMatchObject({
      data: {
        endedById: 'operator-a',
        endedByInferred: true,
      },
      where: { id: 'job-1' },
    });
  });
});

function buildStopPrisma() {
  const update = jest.fn((args: InspectionStopUpdate) => {
    void args;
    return Promise.resolve({});
  });
  const prisma = {
    inspectionJob: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'job-1',
        operatorId: 'operator-a',
        endedById: null,
        endedByInferred: false,
        status: InspectionStatus.running,
      }),
      update,
    },
  } as unknown as PrismaService;

  return { prisma, update };
}

function mockStopSideEffects(service: InspectionsService) {
  const testable = service as unknown as TestableInspectionsService;
  jest.spyOn(testable, 'writeLineResultSession').mockResolvedValue(undefined);
  jest
    .spyOn(testable, 'buildInspectionState')
    .mockResolvedValue({ jobId: 'job-1' });
}
