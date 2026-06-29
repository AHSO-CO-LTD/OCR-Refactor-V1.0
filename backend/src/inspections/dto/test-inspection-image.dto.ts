import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { RoiRegionDto } from '../../products/dto/product-profile.dto';

export class TestInspectionImageCropDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  slotIndex!: number;

  @ApiProperty({ example: 'data:image/jpeg;base64,/9j/4AAQ...' })
  @IsString()
  @IsNotEmpty()
  imageBase64!: string;
}

export class TestInspectionImageDto {
  @ApiProperty({ example: 'cmb123productid' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ type: [TestInspectionImageCropDto] })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TestInspectionImageCropDto)
  crops!: TestInspectionImageCropDto[];

  @ApiPropertyOptional({ type: [RoiRegionDto] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RoiRegionDto)
  roiRegions?: RoiRegionDto[];
}
