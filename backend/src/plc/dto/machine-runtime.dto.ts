import { IsBoolean, IsEnum, IsOptional } from 'class-validator';

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
