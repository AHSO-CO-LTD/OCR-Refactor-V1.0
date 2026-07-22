import { ApiPropertyOptional } from '@nestjs/swagger';
import { LineSessionEndReason } from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';

export class StopInspectionDto {
  @ApiPropertyOptional({
    enum: LineSessionEndReason,
    example: LineSessionEndReason.line_stop,
  })
  @IsOptional()
  @IsEnum(LineSessionEndReason)
  endReason?: LineSessionEndReason;
}
