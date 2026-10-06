import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Headers,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CurrentUser } from './current-user.decorator';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { JwtAuthGuard } from './jwt-auth.guard';
import {
  RememberedLoginMachineDto,
  RestoreRememberedLoginDto,
} from './dto/remembered-login.dto';
import { RememberedLoginService } from './remembered-login.service';

@Controller('internal/auth/remembered-login')
export class RememberedLoginController {
  constructor(
    private readonly configService: ConfigService,
    private readonly rememberedLogin: RememberedLoginService,
  ) {}

  @Post('enable')
  @UseGuards(JwtAuthGuard)
  enable(
    @Body() dto: RememberedLoginMachineDto,
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.rememberedLogin.enable(actor.id, dto.machineId);
  }

  @Post('restore')
  restore(
    @Body() dto: RestoreRememberedLoginDto,
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.rememberedLogin.restore(dto.token, dto.machineId);
  }

  @Delete()
  @UseGuards(JwtAuthGuard)
  disable(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.rememberedLogin.disableForUser(actor.id, 'logout');
  }

  @Delete('logout')
  @UseGuards(JwtAuthGuard)
  logout(
    @CurrentUser() actor: AuthenticatedRequest['user'],
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.rememberedLogin.logoutSession(actor.id, actor.sessionId);
  }

  @Delete('local-invalid')
  rejectInvalidLocalCredential(
    @Headers('x-desktop-internal-token') providedToken?: string,
  ) {
    this.assertInternalToken(providedToken);
    return this.rememberedLogin.rejectInvalidLocalCredential();
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
