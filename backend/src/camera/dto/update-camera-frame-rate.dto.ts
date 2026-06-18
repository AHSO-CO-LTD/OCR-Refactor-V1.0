import { IsNumber, Max, Min } from 'class-validator';

export class UpdateCameraFrameRateDto {
  @IsNumber()
  @Min(1)
  @Max(240)
  fps!: number;
}
