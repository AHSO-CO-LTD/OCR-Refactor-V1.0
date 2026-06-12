import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { RoleCode } from '@prisma/client';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { RolesService } from './roles.service';

@ApiTags('roles')
@ApiBearerAuth()
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @ApiOperation({ summary: 'List roles and their permissions' })
  @Get()
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  listRoles(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.rolesService.listRoles(user.role === 'dev');
  }

  @ApiOperation({ summary: 'Replace permissions for a role' })
  @ApiParam({
    name: 'code',
    enum: ['dev', 'admin', 'engineer', 'operator'],
  })
  @Put(':code/permissions')
  @RequirePermissions(PERMISSIONS.ROLE_MANAGE)
  setRolePermissions(
    @Param('code') roleCode: RoleCode,
    @Body() dto: UpdateRolePermissionsDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    if ((roleCode === 'dev' || roleCode === 'admin') && user.role !== 'dev') {
      throw new ForbiddenException('Only dev can manage protected roles');
    }

    return this.rolesService.setRolePermissions(
      roleCode,
      dto.permissions,
      user.role === 'dev',
    );
  }
}
