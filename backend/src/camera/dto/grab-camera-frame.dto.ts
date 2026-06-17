import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class GrabCameraFrameDto {
  @IsOptional()
  @IsIn(['.jpg', '.jpeg', '.png', '.bmp'])
  encodeFormat?: string = '.jpg';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  jpegQuality?: number = 90;
}
