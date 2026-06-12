import { PartialType } from '@nestjs/swagger';
import { CreateProductProfileDto } from './product-profile.dto';

export class UpdateProductProfileDto extends PartialType(
  CreateProductProfileDto,
) {}
