import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateProductOcrTestSettingsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  rotateTestImageClockwise!: boolean;
}
