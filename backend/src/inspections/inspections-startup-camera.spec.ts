import { PrismaService } from '../database/prisma.service';
import { DeviceToolService } from '../device-tool/device-tool.service';
import { InspectionsService } from './inspections.service';

describe('InspectionsService startup camera', () => {
  it('uses the preferred active USB product and verifies a real frame', async () => {
    const product = {
      id: 'product-1',
      code: 'IS-35R',
      active: true,
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
      roiRegions: [],
    };
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      inspectionJob: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ensureCameraReady = jest.fn().mockResolvedValue({ success: true });
    const grabCameraFrame = jest.fn().mockResolvedValue({
      image_base64: Buffer.from('frame').toString('base64'),
      width: 1500,
      height: 500,
    });
    const deviceTool = {
      ensureCameraReady,
      grabCameraFrame,
    } as unknown as DeviceToolService;
    const service = new InspectionsService(prisma, deviceTool);

    await expect(
      service.verifyStartupCameraFrame('product-1'),
    ).resolves.toEqual({
      data: {
        productId: 'product-1',
        productCode: 'IS-35R',
        width: 1500,
        height: 500,
      },
    });
    expect(ensureCameraReady).toHaveBeenCalledWith(
      expect.objectContaining({
        cameraIdentityId: 'camera-1',
        deviceName: 'Camera 1',
      }),
    );
  });

  it('retries transient camera failures and succeeds after the first real frame', async () => {
    jest.useFakeTimers();
    const product = {
      id: 'product-1',
      code: 'IS-35R',
      active: true,
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
      roiRegions: [],
    };
    const prisma = {
      product: { findMany: jest.fn().mockResolvedValue([product]) },
      inspectionJob: { findFirst: jest.fn().mockResolvedValue(null) },
    } as unknown as PrismaService;
    const ensureCameraReady = jest
      .fn()
      .mockRejectedValueOnce(new Error('camera warming up'))
      .mockResolvedValue({ success: true });
    const grabCameraFrame = jest.fn().mockResolvedValue({
      image_base64: Buffer.from('frame').toString('base64'),
      width: 1500,
      height: 500,
    });
    const service = new InspectionsService(prisma, {
      ensureCameraReady,
      grabCameraFrame,
    } as unknown as DeviceToolService);

    const verification = service.verifyStartupCameraFrame('product-1');
    await jest.advanceTimersByTimeAsync(2_000);

    await expect(verification).resolves.toMatchObject({
      data: { productId: 'product-1', width: 1500, height: 500 },
    });
    expect(ensureCameraReady).toHaveBeenCalledTimes(2);
    expect(grabCameraFrame).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
