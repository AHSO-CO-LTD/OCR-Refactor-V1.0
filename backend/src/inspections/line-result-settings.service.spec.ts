import { LineResultSavePolicy, TrainingImageSavePolicy } from '@prisma/client';
import { UpdateLineResultSettingsDto } from './dto/line-result-settings.dto';
import { InspectionsService } from './inspections.service';

describe('InspectionsService line result settings', () => {
  it('preserves the saved line-result folder when only training settings change', async () => {
    const currentSettings = {
      id: 'default',
      saveFolderPath: 'C:\\OCR\\LineResults',
      savePolicy: LineResultSavePolicy.all,
      saveBySession: true,
      newSessionOnLineStop: true,
      newSessionOnProductChange: true,
      showNgRecognizedText: true,
      trainingImageEnabled: false,
      trainingImageSaveFolderPath: null,
      trainingImageSavePolicy: TrainingImageSavePolicy.all,
      createdAt: new Date('2026-08-07T00:00:00.000Z'),
      updatedAt: new Date('2026-08-07T00:00:00.000Z'),
    };
    const prisma = {
      lineResultSettings: {
        upsert: jest.fn().mockResolvedValue(currentSettings),
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) =>
            Promise.resolve({ ...currentSettings, ...data }),
          ),
      },
    };
    const service = new InspectionsService(prisma as never, {} as never);
    const dto = Object.assign(new UpdateLineResultSettingsDto(), {
      trainingImageEnabled: true,
      trainingImageSaveFolderPath: 'C:\\OCR\\TrainingImages',
      trainingImageSavePolicy: TrainingImageSavePolicy.all,
    });

    const response = await service.updateLineResultSettings(dto);

    expect(response.data.saveFolderPath).toBe('C:\\OCR\\LineResults');
    expect(response.data.trainingImageEnabled).toBe(true);
    expect(response.data.trainingImageSaveFolderPath).toBe(
      'C:\\OCR\\TrainingImages',
    );
    const updateCall = prisma.lineResultSettings.update.mock
      .calls[0] as unknown as [{ data: { saveFolderPath: string } }];
    expect(updateCall[0].data.saveFolderPath).toBe('C:\\OCR\\LineResults');
  });
});
