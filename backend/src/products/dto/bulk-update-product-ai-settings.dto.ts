import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class BulkUpdateProductAiSettingsDto {
  @ApiProperty({ example: 0.5 })
  @IsNumber()
  @Min(0)
  @Max(1)
  thresholdAccept!: number;

  @ApiProperty({ example: 0.5 })
  @IsNumber()
  @Min(0)
  @Max(1)
  thresholdMns!: number;

  @ApiProperty({ example: 20 })
  @IsInt()
  @Min(0)
  @Max(500)
  rowThreshold!: number;

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
