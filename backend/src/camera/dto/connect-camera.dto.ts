import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';
import { CameraProfileDto } from '../../products/dto/product-profile.dto';

export class ConnectCameraDto extends CameraProfileDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Explicit user reconnect. Clears an intentional camera disconnect.',
  })
  @IsOptional()
  @IsBoolean()
  manualReconnect?: boolean;
}

export class DisconnectCameraDto {
  @ApiPropertyOptional({
    default: false,
    description:
      'Marks a user-requested disconnect that suppresses automatic reconnect.',
  })
  @IsOptional()
  @IsBoolean()
  manualDisconnect?: boolean;
}
