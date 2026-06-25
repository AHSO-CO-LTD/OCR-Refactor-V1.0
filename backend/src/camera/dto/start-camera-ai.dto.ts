import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class StartCameraAiDto {
  @ApiProperty({ example: 'cmb123productid' })
  @IsString()
  @IsNotEmpty()
  productId!: string;
}
