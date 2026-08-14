import { IsString, IsUrl, Length, Matches } from 'class-validator';

export class RegistrationStatusDto {
  @IsUrl({
    protocols: ['http', 'https'],
    require_protocol: true,
    require_tld: false,
  })
  serverUrl!: string;

  @IsString()
  @Length(8, 191)
  @Matches(/^[a-zA-Z0-9._:-]+$/)
  machineId!: string;

  @IsString()
  @Length(20, 512)
  registrationToken!: string;
}
