import { IsOptional, IsString } from 'class-validator';

export class StartupCameraDto {
  @IsOptional()
  @IsString()
  productId?: string;
}
