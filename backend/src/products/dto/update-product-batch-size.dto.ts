import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateProductBatchSizeDto {
  @ApiProperty({ example: 150 })
  @IsInt()
  @Min(1)
  batchSize!: number;
}
