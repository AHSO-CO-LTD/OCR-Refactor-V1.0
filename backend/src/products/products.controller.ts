import {
  Body,
  Controller,
  Delete,
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
import { PERMISSIONS } from '../common/constants/permissions';
import { ApplyProductProfileDto } from './dto/apply-product-profile.dto';
import { CreateProductProfileDto } from './dto/product-profile.dto';
import { UpdateProductBatchSizeDto } from './dto/update-product-batch-size.dto';
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
