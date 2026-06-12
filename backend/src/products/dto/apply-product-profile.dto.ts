import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export class ApplyProductProfileDto {
  @ApiProperty({ example: 'product_source_id' })
  @IsString()
  sourceProductId!: string;

  @ApiPropertyOptional({
    example: ['product_target_id_1', 'product_target_id_2'],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  targetProductIds?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  applyToAll?: boolean;
}
