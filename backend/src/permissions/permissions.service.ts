import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPermissions(includeDevOnly = false) {
    const permissions = await this.prisma.permission.findMany({
      where: includeDevOnly ? undefined : { devOnly: false },
      orderBy: [{ group: 'asc' }, { key: 'asc' }],
    });

    return {
      data: permissions.map((permission) => ({
        key: permission.key,
        name: permission.name,
        group: permission.group,
        devOnly: permission.devOnly,
      })),
    };
  }
}
