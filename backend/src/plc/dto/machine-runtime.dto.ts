import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export enum MachineOperationModeDto {
  manual = 'manual',
  auto = 'auto',
}

export class UpdateMachineRuntimeControlsDto {
  @IsOptional()
  @IsEnum(MachineOperationModeDto)
  mode?: MachineOperationModeDto;

  @IsOptional()
  @IsBoolean()
  liveCameraEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  realtimeAiEnabled?: boolean;
}

export class UpdateMachineInactivitySettingsDto {
  @IsBoolean()
  enabled!: boolean;

  @IsInt()
  @Min(1)
  @Max(86400)
  timeoutSeconds!: number;
}

export class UpdateMachineStopSettingsDto {
  @IsInt()
  @Min(0)
  @Max(300)
  delaySeconds!: number;

  @IsOptional()
  @IsBoolean()
  powerOffCameraOnStop?: boolean;
}

export enum MachineTestResultDto {
  OK = 'OK',
  NG = 'NG',
}

export class UpdateMachineTestModeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientId!: string;

  @IsBoolean()
  active!: boolean;
}

export class UpdateMachineTestOutputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientId!: string;

  @IsBoolean()
  enabled!: boolean;
}

export class PulseMachineTestResultDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  clientId!: string;

  @IsEnum(MachineTestResultDto)
  result!: MachineTestResultDto;
}
