import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BootstrapDongilSyncDto } from './dto/bootstrap-dongil-sync.dto';
import { TestDongilConnectionDto } from './dto/test-dongil-connection.dto';
import { RegistrationStatusDto } from './dto/registration-status.dto';
import { DongilSyncService } from './dongil-sync.service';

@Controller('internal/dongil-sync')
export class DongilSyncController {
  constructor(
    private readonly configService: ConfigService,
    private readonly dongilSync: DongilSyncService,
  ) {}

  @Post('bootstrap')
  bootstrap(
    @Body() dto: BootstrapDongilSyncDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.bootstrap(dto);
  }

  @Post('configure')
  configure(
    @Body() dto: BootstrapDongilSyncDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.configure(dto);
  }

  @Post('registration-request')
  registrationRequest(
    @Body() dto: BootstrapDongilSyncDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.requestRegistration(dto);
  }

  @Post('registration-status')
  registrationStatus(
    @Body() dto: RegistrationStatusDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.refreshRegistrationStatus(dto);
  }

  @Get('status')
  status(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.getStatus();
  }

  @Post('test')
  test(
    @Body() dto: TestDongilConnectionDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.testConnection(dto.serverUrl);
  }

  @Post('shutdown')
  shutdown(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.shutdownConnection();
  }

  private assertInternalToken(providedToken?: string) {
    const expectedToken = this.configService.get<string>(
      'DESKTOP_INTERNAL_TOKEN',
    );
    if (!expectedToken || providedToken !== expectedToken) {
      throw new ForbiddenException('Invalid desktop runtime token');
    }
  }
}
