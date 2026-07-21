import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, ValidateNested } from 'class-validator';
import { RoiRegionDto } from './product-profile.dto';

export class UpdateProductRoiRegionsDto {
  @ApiProperty({ type: [RoiRegionDto] })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RoiRegionDto)
  roiRegions!: RoiRegionDto[];
}
