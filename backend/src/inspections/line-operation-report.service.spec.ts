import { InspectionResult } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { LineOperationReportService } from './line-operation-report.service';

describe('LineOperationReportService', () => {
  it('groups ROI logs into one latched result and applies NG precedence', async () => {
    const capturedAt = new Date('2026-07-20T08:00:00.000Z');
    const job = {
      productId: 'product-1',
      operator: { username: 'operator', fullName: 'Operator One' },
      endedBy: { username: 'supervisor', fullName: 'Supervisor One' },
      endedByInferred: false,
      startedAt: new Date('2026-07-20T07:00:00.000Z'),
      stoppedAt: null,
      endReason: null,
    };
    const logs = [
      {
        jobId: 'job-1',
        plcCaptureId: 'capture-1',
        slotIndex: 0,
        expectedText: 'IS-35R',
        text: 'IS-35R',
        result: InspectionResult.OK,
        errorMessage: null,
        imagePath: null,
        capturedAt,
        job,
      },
      {
        jobId: 'job-1',
        plcCaptureId: 'capture-1',
        slotIndex: 1,
        expectedText: 'IS-35R',
        text: 'WRONG',
        result: InspectionResult.NG,
        errorMessage: null,
        imagePath: null,
        capturedAt,
        job,
      },
    ];
    const prisma = {
      inspectionLog: { findMany: jest.fn().mockResolvedValue(logs) },
      product: {
        findMany: jest
          .fn()
          .mockResolvedValue([{ id: 'product-1', code: 'IS-35R' }]),
      },
    } as unknown as PrismaService;
    const service = new LineOperationReportService(prisma);

    const response = await service.getSummary(
      '2026-07-20T00:00:00.000Z',
      '2026-07-21T00:00:00.000Z',
      'day',
    );

    expect(response.data.totals).toEqual({
      sessions: 1,
      results: 1,
      ok: 0,
      ng: 1,
      unknown: 0,
      rois: 2,
    });
    expect(response.data.groups).toEqual([
      {
        period: '2026-07-20',
        sessions: 1,
        results: 1,
        ok: 0,
        ng: 1,
        unknown: 0,
      },
    ]);
  });
});
