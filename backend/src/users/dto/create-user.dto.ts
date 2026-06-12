import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RoleCode } from '@prisma/client';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'engineer1', minLength: 3 })
  @IsString()
  @MinLength(3)
  username!: string;

  @ApiProperty({ example: 'change-me', minLength: 6 })
  @IsString()
  @MinLength(6)
  password!: string;

  @ApiProperty({ example: 'Engineer 1', minLength: 1 })
  @IsString()
  @MinLength(1)
  fullName!: string;

  @ApiPropertyOptional({ example: 'Engineering' })
  @IsOptional()
  @IsString()
  department?: string;

  @ApiPropertyOptional({ example: 'EN001' })
  @IsOptional()
  @IsString()
  employeeNo?: string;

  @ApiProperty({ enum: RoleCode, example: RoleCode.engineer })
  @IsEnum(RoleCode)
  role!: RoleCode;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;
}
