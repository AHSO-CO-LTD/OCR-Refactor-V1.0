import { IsIn, IsOptional, IsString, IsUrl, Length, Matches } from 'class-validator';

export class BootstrapDongilSyncDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  serverUrl!: string;

  @IsString()
  @Length(8, 191)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  machineId!: string;

  @IsString()
  @Length(2, 80)
  @Matches(/^[A-Z][A-Z0-9_]*$/)
  machineTypeCode!: string;

  @IsIn(['LICENSED', 'UNLICENSED'])
  licenseStatus!: 'LICENSED' | 'UNLICENSED';

  @IsOptional()
  @IsString()
  @Length(1, 64)
  appVersion?: string;

  @IsOptional()
  @IsString()
  @Length(20, 512)
  credential?: string;
}
