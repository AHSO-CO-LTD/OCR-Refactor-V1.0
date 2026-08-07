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
    expect(metadata.width).toBe(300);
    expect(metadata.height).toBe(440);
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
