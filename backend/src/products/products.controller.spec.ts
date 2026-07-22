import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import type { BulkUpdateProductAiSettingsDto } from './dto/bulk-update-product-ai-settings.dto';
import type { UpdateProductAiSettingsDto } from './dto/update-product-ai-settings.dto';
import type { ProductImportService } from './product-import.service';
import { ProductsController } from './products.controller';
import type { ProductsService } from './products.service';

describe('ProductsController AI settings permissions', () => {
  const bulkUpdateProductAiSettings = jest.fn();
  const updateProductAiSettings = jest.fn();
  const controller = new ProductsController(
    {
      bulkUpdateProductAiSettings,
      updateProductAiSettings,
    } as unknown as ProductsService,
    {} as ProductImportService,
  );

  beforeEach(() => {
    bulkUpdateProductAiSettings.mockReset();
    updateProductAiSettings.mockReset();
  });

  it('allows non-dev users to update the two public AI thresholds', async () => {
    const dto: BulkUpdateProductAiSettingsDto = {
      thresholdAccept: 0.6,
      thresholdMns: 0.7,
      applyToAll: true,
    };

    await controller.bulkUpdateProductAiSettings(dto, createUser('admin'));

    expect(bulkUpdateProductAiSettings).toHaveBeenCalledWith(dto);
  });

  it('blocks non-dev users from updating row threshold', () => {
    const dto: BulkUpdateProductAiSettingsDto = {
      thresholdAccept: 0.6,
      thresholdMns: 0.7,
      rowThreshold: 25,
      applyToAll: true,
    };

    expect(() => {
      void controller.bulkUpdateProductAiSettings(dto, createUser('engineer'));
    }).toThrow(ForbiddenException);
    expect(bulkUpdateProductAiSettings).not.toHaveBeenCalled();
  });

  it('allows dev users to update row threshold', async () => {
    const dto: BulkUpdateProductAiSettingsDto = {
      thresholdAccept: 0.6,
      thresholdMns: 0.7,
      rowThreshold: 25,
      applyToAll: true,
    };

    await controller.bulkUpdateProductAiSettings(dto, createUser('dev'));

    expect(bulkUpdateProductAiSettings).toHaveBeenCalledWith(dto);
  });

  it('allows non-dev users to update a product model path', async () => {
    const dto: UpdateProductAiSettingsDto = { modelPath: 'models/BL-40.pt' };

    await controller.updateProductAiSettings(
      'product-1',
      dto,
      createUser('engineer'),
    );

    expect(updateProductAiSettings).toHaveBeenCalledWith('product-1', dto);
  });

  it('blocks per-product row threshold updates from non-dev users', () => {
    const dto: UpdateProductAiSettingsDto = { rowThreshold: 30 };

    expect(() => {
      void controller.updateProductAiSettings(
        'product-1',
        dto,
        createUser('admin'),
      );
    }).toThrow(ForbiddenException);
    expect(updateProductAiSettings).not.toHaveBeenCalled();
  });
});

function createUser(role: string): AuthenticatedRequest['user'] {
  return { id: `${role}-id`, username: role, role };
}
