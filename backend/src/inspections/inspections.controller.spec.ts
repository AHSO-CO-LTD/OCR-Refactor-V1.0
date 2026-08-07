import { ForbiddenException } from '@nestjs/common';
import { LineResultSavePolicy, TrainingImageSavePolicy } from '@prisma/client';
import { InspectionsController } from './inspections.controller';

describe('InspectionsController line result settings permissions', () => {
  const updateLineResultSettings = jest.fn();
  const controller = new InspectionsController(
    { updateLineResultSettings } as never,
    {} as never,
  );

  beforeEach(() => {
    updateLineResultSettings.mockReset();
    updateLineResultSettings.mockResolvedValue({ data: {} });
  });

  it.each(['admin', 'dev'])(
    'allows %s to change NG text visibility',
    async (role) => {
      await expect(
        controller.updateLineResultSettings(
          { showNgRecognizedText: false },
          { id: `${role}-1`, username: role, role },
        ),
      ).resolves.toEqual({ data: {} });

      expect(updateLineResultSettings).toHaveBeenCalledWith({
        showNgRecognizedText: false,
      });
    },
  );

  it('blocks engineer from changing NG text visibility', () => {
    expect(() =>
      controller.updateLineResultSettings(
        { showNgRecognizedText: false },
        { id: 'engineer-1', username: 'engineer', role: 'engineer' },
      ),
    ).toThrow(ForbiddenException);

    expect(updateLineResultSettings).not.toHaveBeenCalled();
  });

  it.each(['admin', 'dev'])(
    'allows %s to manage training image settings',
    async (role) => {
      await expect(
        controller.updateLineResultSettings(
          {
            trainingImageEnabled: true,
            trainingImageSaveFolderPath: 'C:\\OCR\\TrainingImages',
            trainingImageSavePolicy: TrainingImageSavePolicy.ng,
          },
          { id: `${role}-1`, username: role, role },
        ),
      ).resolves.toEqual({ data: {} });

      expect(updateLineResultSettings).toHaveBeenCalledWith({
        trainingImageEnabled: true,
        trainingImageSaveFolderPath: 'C:\\OCR\\TrainingImages',
        trainingImageSavePolicy: TrainingImageSavePolicy.ng,
      });
    },
  );

  it('blocks engineer from managing training image settings', () => {
    expect(() =>
      controller.updateLineResultSettings(
        { trainingImageEnabled: true },
        { id: 'engineer-1', username: 'engineer', role: 'engineer' },
      ),
    ).toThrow(ForbiddenException);

    expect(updateLineResultSettings).not.toHaveBeenCalled();
  });

  it('preserves engineer access to existing line result save settings', async () => {
    await expect(
      controller.updateLineResultSettings(
        { savePolicy: LineResultSavePolicy.none },
        { id: 'engineer-1', username: 'engineer', role: 'engineer' },
      ),
    ).resolves.toEqual({ data: {} });

    expect(updateLineResultSettings).toHaveBeenCalledWith({
      savePolicy: LineResultSavePolicy.none,
    });
  });
});
