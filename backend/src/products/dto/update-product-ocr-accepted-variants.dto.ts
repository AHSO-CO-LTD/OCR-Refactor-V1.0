import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsString } from 'class-validator';

export class UpdateProductOcrAcceptedVariantsDto {
  @ApiProperty({ example: ['IS-35-R'] })
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  ocrAcceptedVariants!: string[];
}
