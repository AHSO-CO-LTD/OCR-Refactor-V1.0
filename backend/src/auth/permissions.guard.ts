import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { UsersService } from '../users/users.service';
import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './permissions.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly usersService: UsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    const requiredAnyPermissions = this.reflector.getAllAndOverride<string[]>(
      REQUIRED_ANY_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (
      (!requiredPermissions || requiredPermissions.length === 0) &&
      (!requiredAnyPermissions || requiredAnyPermissions.length === 0)
    ) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = await this.usersService.findById(request.user.id);

    if (!user || !user.active) {
      throw new ForbiddenException('User is not allowed');
    }

    if (user.roleCode === 'dev') {
      return true;
    }

    const permissionKeys = this.usersService.resolvePermissionKeys(user);
    let allowed = true;

    if (requiredPermissions && requiredPermissions.length > 0) {
      allowed =
        allowed &&
        requiredPermissions.every((permission) =>
          permissionKeys.includes(permission),
        );
    }

    if (requiredAnyPermissions && requiredAnyPermissions.length > 0) {
      allowed =
        allowed &&
        requiredAnyPermissions.some((permission) =>
          permissionKeys.includes(permission),
        );
    }

    if (!allowed) {
      throw new ForbiddenException('Missing required permission');
    }

    return true;
  }
}
