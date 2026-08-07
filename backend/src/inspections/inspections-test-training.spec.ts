import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InspectionResult,
  LineResultSavePolicy,
  TrainingImageSavePolicy,
} from '@prisma/client';
import { InspectionsService } from './inspections.service';

describe('InspectionsService test-image training storage', () => {
  let outputRoot: string;

  beforeEach(async () => {
    outputRoot = await mkdtemp(join(tmpdir(), 'ocr-test-training-'));
  });

  afterEach(async () => {
    await rm(outputRoot, { force: true, recursive: true });
  });

  it('stores the exact ROI crop submitted by the test screen', async () => {
    const product = {
      id: 'product-1',
      code: 'SL-40',
      modelPath: 'models/sl-40.pt',
      thresholdAccept: 0.5,
      thresholdMns: 0.5,
      rowThreshold: 20,
      rotateTestImageClockwise: true,
      roiRegions: [{ index: 1, x: 570, y: 498, width: 300, height: 440 }],
    };
    const prisma = {
      lineResultSettings: {
        upsert: jest.fn().mockResolvedValue({
          id: 'default',
          saveFolderPath: outputRoot,
          savePolicy: LineResultSavePolicy.all,
          saveBySession: true,
          newSessionOnLineStop: true,
          newSessionOnProductChange: true,
          showNgRecognizedText: true,
          trainingImageEnabled: true,
          trainingImageSaveFolderPath: outputRoot,
          trainingImageSavePolicy: TrainingImageSavePolicy.all,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      },
    };
    const deviceToolService = {
      inspectProductImage: jest.fn().mockResolvedValue({
        success: true,
        image_width: 300,
        image_height: 440,
        cycle_time_ms: 10,
        error: null,
        results: [{ text: 'SL-40', rows: ['SL-40'], error: null }],
      }),
    };
    const service = new InspectionsService(
      prisma as never,
      deviceToolService as never,
    );
    jest
      .spyOn(
        service as unknown as {
          getActiveProductForScan: () => Promise<typeof product>;
        },
        'getActiveProductForScan',
      )
      .mockResolvedValue(product);
    const toBitmap = jest
      .spyOn(
        service as unknown as {
          processedRoiCropToBitmap: (crop: string) => Promise<Buffer>;
        },
        'processedRoiCropToBitmap',
      )
      .mockResolvedValue(Buffer.from('bmp'));
    const submittedCrop = 'data:image/jpeg;base64,cHJvY2Vzc2VkLXJvaQ==';

    const response = await service.testImage({
      productId: product.id,
      crops: [{ slotIndex: 1, imageBase64: submittedCrop }],
    });

    expect(toBitmap).toHaveBeenCalledWith(submittedCrop);
    expect(response.data.trainingImagesSaved).toBe(1);
    expect(response.data.result).toBe(InspectionResult.OK);
  });
});
