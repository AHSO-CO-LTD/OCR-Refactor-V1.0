import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { InspectionResult } from '@prisma/client';

const testSessionImageResults = ['OK', 'NG', 'UNKNOWN', 'ERROR'] as const;
type TestSessionImageResult = (typeof testSessionImageResults)[number];

export class CreateTestSessionReportRoiDto {
  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  slotIndex?: number;

  @ApiPropertyOptional({ example: 'slot-1' })
  @IsOptional()
  @IsString()
  slotLabel?: string;

  @ApiPropertyOptional({ example: 'IS-35R' })
  @IsOptional()
  @IsString()
  expectedText?: string;

  @ApiPropertyOptional({ example: 'IS35R' })
  @IsOptional()
  @IsString()
  rawText?: string;

  @ApiProperty({ enum: InspectionResult, example: InspectionResult.NG })
  @IsEnum(InspectionResult)
  result!: InspectionResult;

  @ApiPropertyOptional({ example: 'OCR mismatch' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiPropertyOptional({ example: 'data:image/jpeg;base64,/9j/4AAQ...' })
  @IsOptional()
  @IsString()
  toolDebugImageBase64?: string;
}

export class CreateTestSessionReportFailedImageDto {
  @ApiProperty({ example: 'sample-01.jpg' })
  @IsString()
  fileName!: string;

  @ApiProperty({ example: 'folder/sample-01.jpg' })
  @IsString()
  relativePath!: string;

  @ApiProperty({
    enum: testSessionImageResults,
    example: 'NG',
  })
  @IsEnum(testSessionImageResults)
  result!: TestSessionImageResult;

  @ApiPropertyOptional({ example: 153 })
  @IsOptional()
  @IsInt()
  @Min(0)
  cycleTimeMs?: number;

  @ApiPropertyOptional({ example: 'AI test failed' })
  @IsOptional()
  @IsString()
  errorMessage?: string;

  @ApiProperty({ example: 'data:image/jpeg;base64,/9j/4AAQ...' })
  @IsString()
  originalImageBase64!: string;

  @ApiProperty({ type: [CreateTestSessionReportRoiDto] })
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateTestSessionReportRoiDto)
  roiResults!: CreateTestSessionReportRoiDto[];
}

export class CreateTestSessionReportDto {
  @ApiProperty({ example: 'cmb123productid' })
  @IsString()
  productId!: string;

  @ApiPropertyOptional({ example: 'D:\\OCR\\TestReports' })
  @IsOptional()
  @IsString()
  saveFolderPath?: string;

  @ApiPropertyOptional({ example: 'sample-folder' })
  @IsOptional()
  @IsString()
  folderName?: string;

  @ApiProperty({ example: 12 })
  @IsInt()
  @Min(1)
  totalImages!: number;

  @ApiProperty({ example: 9 })
  @IsInt()
  @Min(0)
  okImages!: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  ngImages!: number;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  unknownImages!: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  errorImages!: number;

  @ApiProperty({ type: [CreateTestSessionReportFailedImageDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateTestSessionReportFailedImageDto)
  failedImages!: CreateTestSessionReportFailedImageDto[];
}
