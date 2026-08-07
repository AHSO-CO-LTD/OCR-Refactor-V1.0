import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InspectionResult,
  InspectionStatus,
  LineResultSavePolicy,
  TrainingImageSavePolicy,
} from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { InspectionsService } from './inspections.service';

describe('InspectionsService PLC capture', () => {
  let outputRoot: string;

  type CreatedInspectionLog = {
    capturedAt: Date;
    imagePath: string | null;
    result: string;
    slotIndex: number | null;
    [key: string]: unknown;
  };

  beforeEach(async () => {
    outputRoot = await mkdtemp(join(tmpdir(), 'ocr-plc-capture-'));
  });

  afterEach(async () => {
    await rm(outputRoot, { force: true, recursive: true });
  });

  it('commits the latest completed detection while a newer frame is still processing', async () => {
    const completedImageBase64 =
      Buffer.from('completed-frame').toString('base64');
    const processingImageBase64 =
      Buffer.from('processing-frame').toString('base64');
    const capturedLogs: CreatedInspectionLog[] = [];
    const product = {
      id: 'product-1',
      code: 'IS-35R',
      name: 'IS-35R',
      active: true,
      modelPath: 'model.pt',
      batchSize: 160,
      thresholdAccept: 0.5,
      thresholdMns: 0.5,
      rowThreshold: 20,
      rotateTestImageClockwise: true,
      cameraConfig: {
        cameraIdentityId: 'camera-1',
        sourceType: 'usb',
        deviceName: 'Camera 1',
        rtspUrl: null,
        exposure: 3500,
        imageWidth: 1500,
        imageHeight: 500,
        offsetX: 0,
        offsetY: 0,
        zoomFactor: 0.4,
        previewPanX: 0,
        previewPanY: 0,
        previewRotation: 0,
      },
      roiRegions: [
        {
          index: 0,
          x: 150,
          y: 220,
          width: 300,
          height: 440,
          rotation: 0,
        },
      ],
    };
    const job = {
      id: 'job-1',
      productId: product.id,
      operatorId: 'operator-1',
      status: InspectionStatus.running,
      startedAt: new Date('2026-07-20T12:00:00.000Z'),
      stoppedAt: null,
      endReason: null,
      note: null,
      resultSaveFolderPath: outputRoot,
      resultSavePolicy: LineResultSavePolicy.all,
      resultSessionFolderName: null,
      resultSavedAt: null,
      resultSaveError: null,
      createdAt: new Date('2026-07-20T12:00:00.000Z'),
      updatedAt: new Date('2026-07-20T12:00:00.000Z'),
    };
    const prisma = {
      inspectionJob: {
        findFirst: jest.fn().mockResolvedValue(job),
        findUnique: jest.fn().mockImplementation(() =>
          Promise.resolve({
            ...job,
            logs: capturedLogs,
          }),
        ),
        update: jest.fn().mockResolvedValue(job),
      },
      inspectionLog: {
        create: jest.fn(),
        createMany: jest
          .fn()
          .mockImplementation(({ data }: { data: CreatedInspectionLog[] }) => {
            capturedLogs.push(
              ...data.map((log, index) => ({
                id: `log-${index}`,
                ...log,
              })),
            );
            return Promise.resolve({ count: data.length });
          }),
      },
      lineResultSettings: {
        upsert: jest.fn().mockResolvedValue({
          id: 'default',
          saveFolderPath: outputRoot,
          savePolicy: LineResultSavePolicy.all,
          saveBySession: true,
          newSessionOnLineStop: true,
          newSessionOnProductChange: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
      product: {
        findUnique: jest.fn().mockResolvedValue(product),
      },
    } as unknown as PrismaService;
    const completedScan = {
      success: true,
      image_width: 1500,
      image_height: 500,
      cycle_time_ms: 10,
      error: null,
      results: [{ text: 'IS-35R', rows: ['IS-35R'], error: null }],
    };
    let finishProcessingDetection!: (value: typeof completedScan) => void;
    const processingDetection = new Promise<typeof completedScan>((resolve) => {
      finishProcessingDetection = resolve;
    });
    const inspectProductFrame = jest
      .fn()
      .mockResolvedValueOnce(completedScan)
      .mockReturnValueOnce(processingDetection);
    const deviceTool = {
      ensureCameraReady: jest.fn().mockResolvedValue({ success: true }),
      grabCameraFrame: jest
        .fn()
        .mockResolvedValueOnce({
          image_base64: completedImageBase64,
          width: 1500,
          height: 500,
        })
        .mockResolvedValueOnce({
          image_base64: processingImageBase64,
          width: 1500,
          height: 500,
        }),
      inspectProductFrame,
    } as unknown as DeviceToolService;
    const service = new InspectionsService(prisma, deviceTool);

    await service.refreshLatestRunningInspection();
    const inFlightDetection = service.refreshLatestRunningInspection();
    await new Promise((resolve) => setImmediate(resolve));
    const result = await service.captureRunningInspectionFromPlc();

    expect(inspectProductFrame).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      completedImageBase64,
      undefined,
    );
    expect(inspectProductFrame).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      processingImageBase64,
      undefined,
    );
    expect(result.data.quantity).toBe(1);
    expect(capturedLogs[0]?.imagePath).toEqual(expect.any(String));
    const saved = await readFile(String(capturedLogs[0]?.imagePath));
    expect(saved).toEqual(Buffer.from('completed-frame'));

    finishProcessingDetection({
      ...completedScan,
      results: [{ text: '', rows: [], error: null }],
    });
    await inFlightDetection;

    const unknownResult = await service.captureRunningInspectionFromPlc();
    expect(unknownResult.latched).toBe(false);
    expect(unknownResult.data.lastResult?.result).toBe('UNKNOWN');
    expect(capturedLogs).toHaveLength(1);
  });

  it('rejects a PLC capture before any detection has completed', async () => {
    const findFirst = jest.fn();
    const prisma = {
      inspectionJob: { findFirst },
    } as unknown as PrismaService;
    const service = new InspectionsService(prisma, {} as DeviceToolService);

    await expect(service.captureRunningInspectionFromPlc()).rejects.toThrow(
      'No completed detection is available to latch',
    );
    expect(findFirst).not.toHaveBeenCalled();
  });

  it('only selects configured OK or NG training results and always skips UNKNOWN', () => {
    const service = new InspectionsService(
      {} as PrismaService,
      {} as DeviceToolService,
    );
    const shouldSave = service['shouldSaveTrainingImage'].bind(service);

    expect(shouldSave(TrainingImageSavePolicy.all, InspectionResult.OK)).toBe(
      true,
    );
    expect(shouldSave(TrainingImageSavePolicy.all, InspectionResult.NG)).toBe(
      true,
    );
    expect(
      shouldSave(TrainingImageSavePolicy.all, InspectionResult.UNKNOWN),
    ).toBe(false);
    expect(shouldSave(TrainingImageSavePolicy.ok, InspectionResult.OK)).toBe(
      true,
    );
    expect(shouldSave(TrainingImageSavePolicy.ok, InspectionResult.NG)).toBe(
      false,
    );
    expect(shouldSave(TrainingImageSavePolicy.ng, InspectionResult.OK)).toBe(
      false,
    );
    expect(shouldSave(TrainingImageSavePolicy.ng, InspectionResult.NG)).toBe(
      true,
    );
  });

  it('encodes ROI pixels as an uncompressed 24-bit BMP', () => {
    const service = new InspectionsService(
      {} as PrismaService,
      {} as DeviceToolService,
    );
    const bitmap = service['toBitmap24'](
      Buffer.from([0xff, 0x00, 0x00]),
      1,
      1,
      3,
    );

    expect(bitmap.subarray(0, 2).toString('ascii')).toBe('BM');
    expect(bitmap.readUInt32LE(10)).toBe(54);
    expect(bitmap.readUInt16LE(28)).toBe(24);
    expect(bitmap.subarray(54, 57)).toEqual(Buffer.from([0x00, 0x00, 0xff]));
  });
});
