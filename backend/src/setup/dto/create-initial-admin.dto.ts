import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateInitialAdminDto {
  @ApiProperty({ example: 'admin' })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(32)
  username!: string;

  @ApiProperty({ example: 'StrongAdminPassword123!' })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiProperty({ example: 'Factory Administrator' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Production' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  department?: string;

  @ApiPropertyOptional({ example: 'ADM001' })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  employeeNo?: string;
}
