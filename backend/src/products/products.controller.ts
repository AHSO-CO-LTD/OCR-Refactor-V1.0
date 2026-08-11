import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
  UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { ApplyCameraSettingsToAllProductsDto } from './dto/apply-camera-settings-to-all-products.dto';
import { ApplyRoiRegionsToAllProductsDto } from './dto/apply-roi-regions-to-all-products.dto';
import { BulkUpdateProductAiSettingsDto } from './dto/bulk-update-product-ai-settings.dto';
import { BulkUpdateProductOcrTestSettingsDto } from './dto/bulk-update-product-ocr-test-settings.dto';
import { CreateProductProfileDto } from './dto/product-profile.dto';
import { UpdateProductBatchSizeDto } from './dto/update-product-batch-size.dto';
import { UpdateProductAiSettingsDto } from './dto/update-product-ai-settings.dto';
import { UpdateProductOcrTestSettingsDto } from './dto/update-product-ocr-test-settings.dto';
import { UpdateProductOcrAcceptedVariantsDto } from './dto/update-product-ocr-accepted-variants.dto';
import { UpdateProductProfileDto } from './dto/update-product-profile.dto';
import { UpdateProductRoiRegionsDto } from './dto/update-product-roi-regions.dto';
import { ProductsService } from './products.service';
import { ProductImportService } from './product-import.service';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly productImportService: ProductImportService,
  ) {}

  @ApiOperation({ summary: 'List product profiles' })
  @Get()
  @RequireAnyPermission(
    PERMISSIONS.DASHBOARD_VIEW,
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.ROI_EDIT,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.INSPECTION_TEST,
    PERMISSIONS.REPORT_VIEW,
  )
  listProducts() {
    return this.productsService.listProducts();
  }

  @ApiOperation({ summary: 'Download the two-column XLSX product template' })
  @Get('import/template')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  async downloadImportTemplate(@Query('language') language?: string) {
    const buffer = await this.productImportService.createTemplate(
      language === 'en' ? 'en' : 'vi',
    );
    return new StreamableFile(buffer, {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      disposition: 'attachment; filename="product-import-template.xlsx"',
    });
  }

  @ApiOperation({ summary: 'Create or update products from an XLSX file' })
  @Post('import')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }),
  )
  importProducts(@UploadedFile() file?: Express.Multer.File) {
    if (!file || !file.originalname.toLocaleLowerCase().endsWith('.xlsx')) {
      throw new BadRequestException('Select a valid XLSX product import file');
    }
    return this.productImportService.importWorkbook(file.buffer);
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

  @ApiOperation({ summary: 'Update ROI regions for a product profile' })
  @Patch(':id/roi-regions')
  @RequirePermissions(PERMISSIONS.ROI_EDIT)
  updateProductRoiRegions(
    @Param('id') id: string,
    @Body() dto: UpdateProductRoiRegionsDto,
  ) {
    return this.productsService.updateProductRoiRegions(id, dto.roiRegions);
  }

  @ApiOperation({ summary: 'Apply ROI regions to all product profiles' })
  @Patch('roi-regions/apply-all')
  @RequirePermissions(PERMISSIONS.ROI_EDIT)
  applyRoiRegionsToAllProducts(@Body() dto: ApplyRoiRegionsToAllProductsDto) {
    return this.productsService.applyRoiRegionsToAllProducts(dto);
  }

  @ApiOperation({ summary: 'Update product batch size for runtime' })
  @Patch(':id/batch-size')
  @RequireAnyPermission(
    PERMISSIONS.PRODUCT_MANAGE,
    PERMISSIONS.INSPECTION_START,
    PERMISSIONS.INSPECTION_TEST,
  )
  updateProductBatchSize(
    @Param('id') id: string,
    @Body() dto: UpdateProductBatchSizeDto,
  ) {
    return this.productsService.updateProductBatchSize(id, dto);
  }

  @ApiOperation({ summary: 'Apply camera settings to all product profiles' })
  @Patch('camera-settings/apply-all')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  applyCameraSettingsToAllProducts(
    @Body() dto: ApplyCameraSettingsToAllProductsDto,
  ) {
    return this.productsService.applyCameraSettingsToAllProducts(dto);
  }

  @ApiOperation({
    summary: 'Bulk update line OCR crop rotation settings for product profiles',
  })
  @Patch('ocr-test-settings/apply')
  @RequirePermissions(PERMISSIONS.SYSTEM_DEBUG)
  bulkUpdateProductOcrTestSettings(
    @Body() dto: BulkUpdateProductOcrTestSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev') {
      throw new ForbiddenException(
        'Only dev can update line OCR rotation settings',
      );
    }

    return this.productsService.bulkUpdateProductOcrTestSettings(dto);
  }

  @ApiOperation({
    summary: 'Bulk update AI OCR settings for product profiles',
  })
  @Patch('ai-settings/apply')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  bulkUpdateProductAiSettings(
    @Body() dto: BulkUpdateProductAiSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev' && dto.rowThreshold !== undefined) {
      throw new ForbiddenException('Only dev can update row threshold');
    }

    return this.productsService.bulkUpdateProductAiSettings(dto);
  }

  @ApiOperation({ summary: 'Update AI settings for one product profile' })
  @Patch(':id/ai-settings')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  updateProductAiSettings(
    @Param('id') id: string,
    @Body() dto: UpdateProductAiSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev' && dto.rowThreshold !== undefined) {
      throw new ForbiddenException('Only dev can update row threshold');
    }

    return this.productsService.updateProductAiSettings(id, dto);
  }

  @ApiOperation({
    summary: 'Update accepted OCR text variants for one product profile',
  })
  @Patch(':id/ocr-accepted-variants')
  @RequirePermissions(PERMISSIONS.PRODUCT_MANAGE)
  updateProductOcrAcceptedVariants(
    @Param('id') id: string,
    @Body() dto: UpdateProductOcrAcceptedVariantsDto,
  ) {
    return this.productsService.updateProductOcrAcceptedVariants(
      id,
      dto.ocrAcceptedVariants,
    );
  }

  @ApiOperation({
    summary: 'Update line OCR crop rotation settings for a product profile',
  })
  @Patch(':id/ocr-test-settings')
  @RequirePermissions(PERMISSIONS.SYSTEM_DEBUG)
  updateProductOcrTestSettings(
    @Param('id') id: string,
    @Body() dto: UpdateProductOcrTestSettingsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if (user.role !== 'dev') {
      throw new ForbiddenException(
        'Only dev can update line OCR rotation settings',
      );
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
