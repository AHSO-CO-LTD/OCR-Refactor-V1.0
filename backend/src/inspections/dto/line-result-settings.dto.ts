import { ApiPropertyOptional } from '@nestjs/swagger';
import { LineResultSavePolicy } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

export class UpdateLineResultSettingsDto {
  @ApiPropertyOptional({
    example: 'C:\\OCR\\LineResults',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  saveFolderPath?: string | null;

  @ApiPropertyOptional({
    enum: LineResultSavePolicy,
    example: LineResultSavePolicy.all,
  })
  @IsOptional()
  @IsEnum(LineResultSavePolicy)
  savePolicy?: LineResultSavePolicy;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  saveBySession?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  newSessionOnLineStop?: boolean;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  newSessionOnProductChange?: boolean;
}
