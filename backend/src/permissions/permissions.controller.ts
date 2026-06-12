import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { PermissionsService } from './permissions.service';

@ApiTags('permissions')
@ApiBearerAuth()
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @ApiOperation({ summary: 'List permissions visible to the current manager' })
  @Get()
  @RequirePermissions(PERMISSIONS.PERMISSION_MANAGE)
  listPermissions(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.permissionsService.listPermissions(user.role === 'dev');
  }
}
