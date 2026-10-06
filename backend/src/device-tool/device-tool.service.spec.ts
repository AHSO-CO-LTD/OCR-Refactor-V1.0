import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { PrismaService } from '../database/prisma.service';
import {
  CameraProfileDto,
  RoiRegionDto,
} from '../products/dto/product-profile.dto';
import { DeviceToolService } from './device-tool.service';

type CropFrameRoi = (
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  camera: CameraProfileDto,
  region: RoiRegionDto,
  rotateImageClockwise: boolean,
) => Promise<string>;

describe('DeviceToolService cropFrameRoi', () => {
  it('extracts an ROI before rotating the cropped image', async () => {
    const service = new DeviceToolService(
      {} as ConfigService,
      {} as PrismaService,
    );
    const cropFrameRoi = (
      service as unknown as { cropFrameRoi: CropFrameRoi }
    ).cropFrameRoi.bind(service);
    const imageBuffer = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();
    const camera = {
      sourceType: 'usb',
      exposure: 3500,
      imageWidth: 3000,
      imageHeight: 1000,
      offsetX: 0,
      offsetY: 0,
      zoomFactor: 1,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    } satisfies CameraProfileDto;
    const region = {
      index: 2,
      x: 1047,
      y: 490,
      width: 300,
      height: 440,
      rotation: 0,
    } satisfies RoiRegionDto;

    const result = await cropFrameRoi(
      imageBuffer,
      3000,
      1000,
      camera,
      region,
      true,
    );
    const output = Buffer.from(result.split(',', 2)[1], 'base64');
    const metadata = await sharp(output).metadata();

    expect(result).toMatch(/^data:image\/jpeg;base64,/);
    expect(metadata.width).toBe(440);
    expect(metadata.height).toBe(300);
    const pixels = await sharp(output).raw().toBuffer();
    expect(pixels.every((value) => value > 240)).toBe(true);
  });

  it('returns the exact ROI crop sent to OCR for downstream training storage', async () => {
    const service = new DeviceToolService(
      {} as ConfigService,
      {} as PrismaService,
    );
    const processedCrop = `data:image/jpeg;base64,${Buffer.from(
      'processed-roi',
    ).toString('base64')}`;
    const inspectProductImageWithSignal = jest
      .spyOn(
        service as unknown as {
          inspectProductImageWithSignal: (request: unknown) => Promise<unknown>;
        },
        'inspectProductImageWithSignal',
      )
      .mockResolvedValue({
        success: true,
        image_width: 0,
        image_height: 0,
        cycle_time_ms: 0,
        results: [],
        error: null,
      });
    jest
      .spyOn(
        service as unknown as { cropFrameRoi: () => Promise<string> },
        'cropFrameRoi',
      )
      .mockResolvedValue(processedCrop);
    const frame = await sharp({
      create: {
        width: 3000,
        height: 1000,
        channels: 3,
        background: '#ffffff',
      },
    })
      .jpeg()
      .toBuffer();
    const camera = {
      sourceType: 'usb',
      exposure: 3500,
      imageWidth: 3000,
      imageHeight: 1000,
      offsetX: 0,
      offsetY: 0,
      zoomFactor: 1,
      previewPanX: 0,
      previewPanY: 0,
      previewRotation: 0,
    } satisfies CameraProfileDto;
    const roi = {
      index: 1,
      x: 570,
      y: 498,
      width: 300,
      height: 440,
      rotation: 0,
    } satisfies RoiRegionDto;

    const result = await service.inspectProductFrame(
      {
        modelPath: 'models/test.pt',
        camera,
        roiRegions: [roi],
        thresholdAccept: 0.5,
        thresholdMns: 0.5,
        rowThreshold: 20,
        rotateImageClockwise: true,
      },
      `data:image/jpeg;base64,${frame.toString('base64')}`,
    );

    expect(inspectProductImageWithSignal).toHaveBeenCalledWith(
      expect.objectContaining({
        crops: [{ slotIndex: 1, imageBase64: processedCrop }],
      }),
      undefined,
    );
    expect(result.processedRoiCrops).toEqual([
      { slotIndex: 1, imageBase64: processedCrop },
    ]);
  });
});

describe('DeviceToolService intentional camera disconnect', () => {
  const camera = {
    sourceType: 'usb',
    exposure: 3500,
    imageWidth: 1500,
    imageHeight: 500,
    offsetX: 0,
    offsetY: 0,
    zoomFactor: 1,
    previewPanX: 0,
    previewPanY: 0,
    previewRotation: 0,
  } satisfies CameraProfileDto;

  it('blocks automatic reconnect until an explicit manual reconnect', async () => {
    const service = new DeviceToolService(
      {} as ConfigService,
      {} as PrismaService,
    );
    jest.spyOn(service, 'disconnectCamera').mockResolvedValue({
      success: true,
    });
    const ensureCameraConnected = jest
      .spyOn(
        service as unknown as {
          ensureCameraConnected: (
            profile: CameraProfileDto,
          ) => Promise<{ success: boolean }>;
        },
        'ensureCameraConnected',
      )
      .mockResolvedValue({ success: true });

    await service.disconnectCameraByUser();

    await expect(service.ensureCameraReady(camera)).rejects.toThrow(
      'Camera was intentionally disconnected',
    );
    await expect(
      service.ensureCameraPreviewReady(camera, { manualReconnect: true }),
    ).resolves.toEqual({ success: true });
    expect(ensureCameraConnected).toHaveBeenCalledWith(camera);
  });
});

describe('DeviceToolService camera discovery', () => {
  const currentIdentity = cameraIdentity({
    id: 'camera-current',
    serial: 'CURRENT-001',
    displayName: 'Camera Current',
    lastSeenAt: new Date('2026-10-06T04:00:00.000Z'),
  });
  const historicalIdentity = cameraIdentity({
    id: 'camera-historical',
    serial: 'HISTORICAL-001',
    displayName: 'Camera Historical',
    lastSeenAt: new Date('2026-08-14T09:04:56.612Z'),
  });

  it('returns no available camera when Device Tool detects no device', async () => {
    const findMany = jest.fn();
    const service = cameraDiscoveryService({
      cameraIdentity: {
        findMany,
        upsert: jest.fn(),
      },
    });
    mockToolDevices(service, []);

    await expect(service.listCameraDevices()).resolves.toEqual({ data: [] });
    expect(findMany).not.toHaveBeenCalled();
  });

  it('keeps saved identities visible but marks them unavailable when no device is detected', async () => {
    const findMany = jest.fn().mockResolvedValue([
      currentIdentity,
      historicalIdentity,
    ]);
    const service = cameraDiscoveryService({
      cameraIdentity: {
        findMany,
        upsert: jest.fn(),
      },
    });
    mockToolDevices(service, []);

    const result = await service.listCameraIdentities();

    expect(result.data).toEqual([
      expect.objectContaining({
        serial: currentIdentity.serial,
        detected: false,
        connectable: false,
      }),
      expect.objectContaining({
        serial: historicalIdentity.serial,
        detected: false,
        connectable: false,
      }),
    ]);
    expect(findMany).toHaveBeenCalledTimes(1);
  });

  it('marks only serials returned by Device Tool as currently detected', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([currentIdentity])
      .mockResolvedValueOnce([currentIdentity, historicalIdentity]);
    const upsert = jest.fn().mockResolvedValue(currentIdentity);
    const service = cameraDiscoveryService({
      cameraIdentity: { findMany, upsert },
    });
    mockToolDevices(service, [
      {
        name: 'Basler Current',
        model: 'acA3800-10gm',
        serial: currentIdentity.serial,
        vendor: 'Basler',
        interface: 'BaslerGigE',
      },
    ]);

    const result = await service.listCameraIdentities();

    expect(result.data).toEqual([
      expect.objectContaining({
        serial: currentIdentity.serial,
        detected: true,
        connectable: true,
      }),
      expect.objectContaining({
        serial: historicalIdentity.serial,
        detected: false,
        connectable: false,
      }),
    ]);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { serial: currentIdentity.serial } }),
    );
    expect(findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: { serial: { in: [currentIdentity.serial] } },
      }),
    );
  });
});

function cameraDiscoveryService(prisma: {
  cameraIdentity: {
    findMany: jest.Mock;
    upsert: jest.Mock;
  };
}) {
  return new DeviceToolService(
    { get: jest.fn().mockReturnValue(undefined) } as unknown as ConfigService,
    prisma as unknown as PrismaService,
  );
}

function mockToolDevices(service: DeviceToolService, devices: unknown[]) {
  jest
    .spyOn(
      service as unknown as {
        requestToolJson: () => Promise<unknown[]>;
      },
      'requestToolJson',
    )
    .mockResolvedValue(devices);
}

function cameraIdentity(
  overrides: Partial<{
    active: boolean;
    createdAt: Date;
    displayName: string;
    driver: string;
    id: string;
    identifiedAt: Date | null;
    interfaceName: string | null;
    lastSeenAt: Date | null;
    modelName: string | null;
    serial: string;
    toolName: string | null;
    updatedAt: Date;
    vendor: string | null;
  }> = {},
) {
  return {
    active: true,
    createdAt: new Date('2026-07-01T00:00:00.000Z'),
    displayName: 'Camera',
    driver: 'basler_area',
    id: 'camera-id',
    identifiedAt: new Date('2026-07-01T00:00:00.000Z'),
    interfaceName: 'BaslerGigE',
    lastSeenAt: new Date('2026-07-01T00:00:00.000Z'),
    modelName: 'acA3800-10gm',
    serial: 'SERIAL-001',
    toolName: 'Basler Camera',
    updatedAt: new Date('2026-07-01T00:00:00.000Z'),
    vendor: 'Basler',
    ...overrides,
  };
}
