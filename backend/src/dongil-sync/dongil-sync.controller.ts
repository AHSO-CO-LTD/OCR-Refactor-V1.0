import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BootstrapDongilSyncDto } from './dto/bootstrap-dongil-sync.dto';
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

  private assertInternalToken(providedToken?: string) {
    const expectedToken = this.configService.get<string>('DESKTOP_INTERNAL_TOKEN');
    if (!expectedToken || providedToken !== expectedToken) {
      throw new ForbiddenException('Invalid desktop runtime token');
    }
  }
}
