import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { ApplyProductProfileDto } from './dto/apply-product-profile.dto';
import { BulkUpdateProductOcrTestSettingsDto } from './dto/bulk-update-product-ocr-test-settings.dto';
import { CreateProductProfileDto } from './dto/product-profile.dto';
import { UpdateProductBatchSizeDto } from './dto/update-product-batch-size.dto';
import { UpdateProductOcrTestSettingsDto } from './dto/update-product-ocr-test-settings.dto';
import { UpdateProductProfileDto } from './dto/update-product-profile.dto';
import { ProductsService } from './products.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @ApiOperation({ summary: 'List product profiles' })
  @Get()
  @RequireAnyPermission(
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INSPECTION_START,
  )
  listProducts() {
    return this.productsService.listProducts();
  }

  @ApiOperation({ summary: 'Create a product profile' })
  @Post()
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  createProduct(@Body() dto: CreateProductProfileDto) {
    return this.productsService.createProduct(dto);
  }

  @ApiOperation({ summary: 'Update a product profile' })
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  updateProduct(@Param('id') id: string, @Body() dto: UpdateProductProfileDto) {
    return this.productsService.updateProduct(id, dto);
  }

  @ApiOperation({ summary: 'Update product batch size for runtime' })
  @Patch(':id/batch-size')
  @RequireAnyPermission(
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INSPECTION_START,
  )
  updateProductBatchSize(
    @Param('id') id: string,
    @Body() dto: UpdateProductBatchSizeDto,
  ) {
    return this.productsService.updateProductBatchSize(id, dto);
  }

  @ApiOperation({
    summary: 'Bulk update OCR test settings for product profiles',
  })
  @Patch('ocr-test-settings/apply')
  @RequirePermissions(PERMISSIONS.SYSTEM_DEBUG)
  bulkUpdateProductOcrTestSettings(
    @Body() dto: BulkUpdateProductOcrTestSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev') {
      throw new ForbiddenException('Only dev can update OCR test settings');
    }

    return this.productsService.bulkUpdateProductOcrTestSettings(dto);
  }

  @ApiOperation({ summary: 'Update OCR test settings for a product profile' })
  @Patch(':id/ocr-test-settings')
  @RequirePermissions(PERMISSIONS.SYSTEM_DEBUG)
  updateProductOcrTestSettings(
    @Param('id') id: string,
    @Body() dto: UpdateProductOcrTestSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev') {
      throw new ForbiddenException('Only dev can update OCR test settings');
    }

    return this.productsService.updateProductOcrTestSettings(
      id,
      dto.rotateTestImageClockwise,
    );
  }

  @ApiOperation({ summary: 'Delete a product profile' })
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  deleteProduct(@Param('id') id: string) {
    return this.productsService.deleteProduct(id);
  }

  @ApiOperation({ summary: 'Apply one product profile to selected products' })
  @Post('apply-profile')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  applyProductProfile(@Body() dto: ApplyProductProfileDto) {
    return this.productsService.applyProductProfile(dto);
  }
}
