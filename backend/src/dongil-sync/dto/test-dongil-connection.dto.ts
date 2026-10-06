import {
  IsOptional,
  IsString,
  Length,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class TestDongilConnectionDto {
  @IsString()
  @MinLength(8)
  @MaxLength(500)
  serverUrl!: string;

  @IsOptional()
  @IsString()
  @Length(8, 191)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  machineId?: string;

  @IsOptional()
  @IsString()
  @Length(20, 512)
  credential?: string;
}
