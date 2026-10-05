import { IsString, MaxLength, MinLength } from 'class-validator';

export class TestDongilConnectionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  serverUrl!: string;
}
