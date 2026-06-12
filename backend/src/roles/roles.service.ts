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
    includeHidden = false,
  ) {
    const allowedPermissions = await this.prisma.permission.findMany({
      where: {
        key: { in: permissionKeys },
        devOnly: roleCode === 'dev' ? undefined : false,
      },
      select: { key: true },
    });

    const allowedPermissionKeys = allowedPermissions.map(
      (permission) => permission.key,
    );

    await this.prisma.$transaction([
      this.prisma.rolePermission.deleteMany({
        where: { roleCode },
      }),
      this.prisma.rolePermission.createMany({
        data: allowedPermissionKeys.map((permissionKey) => ({
          roleCode,
          permissionKey,
        })),
        skipDuplicates: true,
      }),
    ]);

    return this.listRoles(includeHidden);
  }
}
