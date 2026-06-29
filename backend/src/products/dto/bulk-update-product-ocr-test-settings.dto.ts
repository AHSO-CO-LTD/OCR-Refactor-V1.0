import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
} from 'class-validator';

export class BulkUpdateProductOcrTestSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  rotateTestImageClockwise!: boolean;

  @ApiProperty({ example: false })
  @IsBoolean()
  applyToAll!: boolean;

  @ApiPropertyOptional({ example: ['product-id-1', 'product-id-2'] })
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  productIds?: string[];
}
