import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class StartInspectionDto {
  @ApiProperty({ example: 'cmb123productid' })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ example: 'Operator note' })
  @IsOptional()
  @IsString()
  operatorNote?: string;
}
