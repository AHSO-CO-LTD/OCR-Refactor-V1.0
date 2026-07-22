import { Type } from 'class-transformer';
import { PlcProtocol } from '@prisma/client';
import {
  ArrayMaxSize,
  IsBoolean,
  IsEnum,
  IsIP,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export enum PlcCustomKeyOperationDto {
  watch_boolean = 'watch_boolean',
  write_boolean = 'write_boolean',
  pulse = 'pulse',
}

export class PlcCustomKeyDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  name!: string;

  @IsInt()
  @Min(0)
  address!: number;

  @IsEnum(PlcCustomKeyOperationDto)
  operation!: PlcCustomKeyOperationDto;

  @IsBoolean()
  enabled!: boolean;
}

export class UpdatePlcConfigDto {
  @IsIP(4)
  ipAddress!: string;

  @IsEnum(PlcProtocol)
  protocol!: PlcProtocol;

  @IsInt()
  @Min(1)
  @Max(65535)
  port!: number;

  @IsInt()
  @Min(0)
  @IsOptional()
  captureTriggerAddress!: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  stopTriggerAddress!: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  startTriggerAddress!: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  cameraPowerAddress!: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  cameraLightAddress!: number | null;

  @IsInt()
  @Min(0)
  @IsOptional()
  errorPulseAddress!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  okResultAddress!: number | null;

  @IsOptional()
  @IsInt()
  @Min(0)
  waitingCheckingAddress!: number | null;

  @IsInt()
  @Min(50)
  @Max(10000)
  errorPulseDurationMs!: number;

  @IsInt()
  @Min(50)
  @Max(10000)
  okPulseDurationMs!: number;

  @ValidateNested({ each: true })
  @Type(() => PlcCustomKeyDto)
  @ArrayMaxSize(64)
  customKeys!: PlcCustomKeyDto[];
}

export class SetPlcBooleanDto {
  @IsBoolean()
  enabled!: boolean;
}

export class ExecuteCustomPlcKeyDto {
  @IsBoolean()
  value!: boolean;
}
