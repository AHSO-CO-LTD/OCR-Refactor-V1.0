import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ArrayMaxSize,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CameraProfileDto {
  @ApiProperty({ example: 'usb' })
  @IsString()
  @IsNotEmpty()
  sourceType!: string;

  @ApiPropertyOptional({ example: 'Camera 1' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ example: 'rtsp://192.168.1.10/stream' })
  @IsOptional()
  @IsString()
  rtspUrl?: string;

  @ApiProperty({ example: 3500 })
  @IsInt()
  @Min(0)
  exposure!: number;

  @ApiProperty({ example: 2500 })
  @IsInt()
  @Min(1)
  imageWidth!: number;

  @ApiProperty({ example: 1000 })
  @IsInt()
  @Min(1)
  imageHeight!: number;

  @ApiProperty({ example: 300 })
  @IsInt()
  @Min(0)
  offsetX!: number;

  @ApiProperty({ example: 1400 })
  @IsInt()
  @Min(0)
  offsetY!: number;

  @ApiProperty({ example: 0.4 })
  @IsNumber()
  @Min(0)
  @Max(10)
  zoomFactor!: number;
}

export class RoiRegionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(1)
  index!: number;

  @ApiProperty({ example: 760 })
  @IsInt()
  @Min(0)
  x!: number;

  @ApiProperty({ example: 1180 })
  @IsInt()
  @Min(0)
  y!: number;

  @ApiProperty({ example: 360 })
  @IsInt()
  @Min(1)
  width!: number;

  @ApiProperty({ example: 160 })
  @IsInt()
  @Min(1)
  height!: number;

  @ApiProperty({ example: 0 })
  @IsNumber()
  @Min(-360)
  @Max(360)
  rotation!: number;
}

export class CreateProductProfileDto {
  @ApiProperty({ example: 'SL-40' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiProperty({ example: 'SL-40' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 160 })
  @IsInt()
  @Min(0)
  defaultNumber!: number;

  @ApiProperty({ example: 150 })
  @IsInt()
  @Min(1)
  batchSize!: number;

  @ApiProperty({ example: 3500 })
  @IsInt()
  @Min(0)
  exposure!: number;

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

  @ApiPropertyOptional({ example: 'models/SL-40_150_0.998.pt' })
  @IsOptional()
  @IsString()
  modelPath?: string;

  @ApiProperty({ example: true })
  @IsBoolean()
  active!: boolean;

  @ApiProperty({ type: CameraProfileDto })
  @ValidateNested()
  @Type(() => CameraProfileDto)
  camera!: CameraProfileDto;

  @ApiProperty({ type: [RoiRegionDto] })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => RoiRegionDto)
  roiRegions!: RoiRegionDto[];
}
