import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class RememberedLoginMachineDto {
  @ApiProperty({
    description: 'Machine identity obtained from the desktop license boundary',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  machineId!: string;
}

export class RestoreRememberedLoginDto extends RememberedLoginMachineDto {
  @ApiProperty({ description: 'Opaque token supplied only by Electron main' })
  @IsString()
  @MinLength(43)
  @MaxLength(128)
  @Matches(/^[A-Za-z0-9_-]+$/)
  token!: string;
}
