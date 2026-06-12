import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermissions } from '../auth/permissions.decorator';
import { PermissionsGuard } from '../auth/permissions.guard';
import { PERMISSIONS } from '../common/constants/permissions';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';
import { WindowsKeyboardService } from './windows-keyboard.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly windowsKeyboardService: WindowsKeyboardService,
  ) {}

  @ApiOperation({ summary: 'List users visible to the current manager' })
  @Get()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  listUsers(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.usersService.listUsers(user.role === 'dev');
  }

  @ApiOperation({ summary: 'List roles that can be assigned to new users' })
  @Get('assignable-roles')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  listAssignableRoles(@CurrentUser() user: AuthenticatedRequest['user']) {
    return this.usersService.listAssignableRoles(user.role === 'dev');
  }

  @ApiOperation({ summary: 'Create a user' })
  @Post()
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.usersService.createUser(dto, user.role === 'dev');
  }

  @ApiOperation({ summary: 'Update a user' })
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.usersService.updateUser(id, dto, user.role === 'dev');
  }

  @ApiOperation({ summary: 'Delete a user' })
  @Delete(':id')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  deleteUser(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    return this.usersService.deleteUser(id, user.id, user.role === 'dev');
  }

  @ApiOperation({ summary: 'Open the Windows virtual keyboard' })
  @Post('virtual-keyboard')
  @RequirePermissions(PERMISSIONS.USER_MANAGE)
  openWindowsVirtualKeyboard() {
    return this.windowsKeyboardService.open();
  }
}
