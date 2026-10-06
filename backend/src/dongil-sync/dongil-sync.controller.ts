import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UsersService } from '../users/users.service';
import { BootstrapDongilSyncDto } from './dto/bootstrap-dongil-sync.dto';
import { TestDongilConnectionDto } from './dto/test-dongil-connection.dto';
import { RegistrationStatusDto } from './dto/registration-status.dto';
import { DongilHistorySyncService } from './dongil-history-sync.service';
import { DongilSyncService } from './dongil-sync.service';

@Controller('internal/dongil-sync')
export class DongilSyncController {
  constructor(
    private readonly configService: ConfigService,
    private readonly dongilSync: DongilSyncService,
    private readonly historySync: DongilHistorySyncService,
    private readonly usersService: UsersService,
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

  @Post('settings')
  @UseGuards(JwtAuthGuard)
  async saveSettings(
    @Body() dto: BootstrapDongilSyncDto,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    await this.assertSettingsActor(actor.id);
    return this.dongilSync.saveConfiguration(dto, actor.id);
  }

  @Post('reset')
  @UseGuards(JwtAuthGuard)
  async reset(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    await this.assertSettingsActor(actor.id);
    return this.dongilSync.resetConfiguration(actor.id);
  }

  @Post('disconnect')
  disconnect(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.disconnect();
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

  @Post('registration-status/refresh')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.DONGIL_CONNECTION_VIEW)
  refreshRegistrationStatus(
    @Body() dto: RegistrationStatusDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.refreshRegistrationStatus(dto);
  }

  @Post('reconnect')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.DONGIL_CONNECTION_OPERATE)
  reconnect(
    @Body() dto: BootstrapDongilSyncDto,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.reconnect(dto, actor.id);
  }

  @Post('history-start')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.DONGIL_HISTORY_SYNC_START)
  startHistorySync(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.historySync.start(actor.id);
  }

  @Get('status')
  status(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.getStatus();
  }

  @Get('status/user')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions(PERMISSIONS.DONGIL_CONNECTION_VIEW)
  userStatus(@Headers('x-desktop-internal-token') providedToken?: string) {
    this.assertInternalToken(providedToken);
    return this.dongilSync.getStatus();
  }

  @Post('test')
  @UseGuards(JwtAuthGuard)
  async test(
    @Body() dto: TestDongilConnectionDto,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    await this.assertSettingsActor(actor.id);
    return this.dongilSync.testConnection(dto);
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

  private async assertSettingsActor(userId: string) {
    const user = await this.usersService.findById(userId);
    if (
      !user ||
      !user.active ||
      (user.roleCode !== 'dev' && user.roleCode !== 'admin')
    ) {
      throw new ForbiddenException(
        'Only active DEV or ADMIN users can change Dongil Server settings',
      );
    }
  }
}
