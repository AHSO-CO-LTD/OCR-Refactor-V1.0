import { Injectable } from '@nestjs/common';
import type { RoleCode } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class RolesService {
  constructor(private readonly prisma: PrismaService) {}

  async listRoles(includeHidden = false) {
    const roles = await this.prisma.role.findMany({
      where: includeHidden
        ? undefined
        : {
            visible: true,
            code: { in: ['engineer', 'operator'] },
          },
      include: {
        permissions: {
          include: { permission: true },
          orderBy: { permissionKey: 'asc' },
        },
      },
      orderBy: { code: 'asc' },
    });

    return {
      data: roles.map((role) => ({
        code: role.code,
        name: role.name,
        visible: role.visible,
        permissions: role.permissions.map(
          (rolePermission) => rolePermission.permissionKey,
        ),
      })),
    };
  }

  async setRolePermissions(
    roleCode: RoleCode,
    permissionKeys: string[],
    actorId: string,
    includeHidden = false,
  ) {
    const [allowedPermissions, existingPermissions] = await Promise.all([
      this.prisma.permission.findMany({
        where: {
          key: { in: permissionKeys },
          devOnly: roleCode === 'dev' ? undefined : false,
        },
        select: { key: true },
      }),
      this.prisma.rolePermission.findMany({
        where: { roleCode },
        select: { permissionKey: true },
        orderBy: { permissionKey: 'asc' },
      }),
    ]);

    const allowedPermissionKeys = allowedPermissions
      .map((permission) => permission.key)
      .sort();
    const previousPermissionKeys = existingPermissions.map(
      (permission) => permission.permissionKey,
    );

    await this.prisma.$transaction(async (transaction) => {
      await transaction.rolePermission.deleteMany({
        where: { roleCode },
      });
      await transaction.rolePermission.createMany({
        data: allowedPermissionKeys.map((permissionKey) => ({
          roleCode,
          permissionKey,
        })),
        skipDuplicates: true,
      });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'role.permissions.update',
          target: roleCode,
          details: {
            before: previousPermissionKeys,
            after: allowedPermissionKeys,
          },
        },
      });
    });

    return this.listRoles(includeHidden);
  }
}
