import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class PlcSimulatorSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  clientId!: string;
}

export class PlcSimulatorSignalDto extends PlcSimulatorSessionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  key!: string;
}
