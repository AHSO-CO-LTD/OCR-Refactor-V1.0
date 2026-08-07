import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { CameraProfileDto } from './product-profile.dto';

export class ApplyCameraSettingsToAllProductsDto {
  @ApiProperty({ type: CameraProfileDto })
  @ValidateNested()
  @Type(() => CameraProfileDto)
  camera!: CameraProfileDto;
}
