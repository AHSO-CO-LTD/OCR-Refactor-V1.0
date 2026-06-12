import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers(includeDev = false) {
    const users = await this.prisma.user.findMany({
      where: includeDev ? undefined : { roleCode: { not: 'dev' } },
      orderBy: { username: 'asc' },
    });

    return {
      data: users.map((user) => this.toUserSummary(user)),
    };
  }

  async listAssignableRoles(includeDev = false) {
    const roles = await this.prisma.role.findMany({
      where: includeDev ? undefined : { visible: true },
      orderBy: { code: 'asc' },
    });

    return {
      data: roles.map((role) => ({
        code: role.code,
        name: role.name,
        visible: role.visible,
      })),
    };
  }

  async createUser(dto: CreateUserDto, canManageDev: boolean) {
    if (dto.role === RoleCode.dev && !canManageDev) {
      throw new BadRequestException('Only dev can create dev users');
    }

    const role = await this.prisma.role.findUnique({
      where: { code: dto.role },
    });

    if (!role || (!role.visible && !canManageDev)) {
      throw new BadRequestException('Role is not assignable');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        passwordHash,
        fullName: dto.fullName,
        department: dto.department || null,
        employeeNo: dto.employeeNo || null,
        roleCode: dto.role,
        active: dto.active ?? true,
      },
    });

    return {
      data: this.toUserSummary(user),
    };
  }

  async updateUser(id: string, dto: UpdateUserDto, canManageDev: boolean) {
    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roleCode: true, active: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (existingUser.roleCode === RoleCode.dev && !canManageDev) {
      throw new BadRequestException('Only dev can update dev users');
    }

    if (dto.role === RoleCode.dev && !canManageDev) {
      throw new BadRequestException('Only dev can assign dev role');
    }

    if (dto.role) {
      const role = await this.prisma.role.findUnique({
        where: { code: dto.role },
      });

      if (!role || (!role.visible && !canManageDev)) {
        throw new BadRequestException('Role is not assignable');
      }
    }

    await this.ensureAdminWillRemain(existingUser, dto);

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        department:
          dto.department === undefined ? undefined : dto.department || null,
        employeeNo:
          dto.employeeNo === undefined ? undefined : dto.employeeNo || null,
        roleCode: dto.role,
        active: dto.active,
      },
    });

    return {
      data: this.toUserSummary(user),
    };
  }

  async deleteUser(id: string, actorId: string, canManageDev: boolean) {
    if (id === actorId) {
      throw new BadRequestException('Current user cannot delete own account');
    }

    const existingUser = await this.prisma.user.findUnique({
      where: { id },
      select: { id: true, roleCode: true, active: true },
    });

    if (!existingUser) {
      throw new NotFoundException('User not found');
    }

    if (existingUser.roleCode === RoleCode.dev && !canManageDev) {
      throw new BadRequestException('Only dev can delete dev users');
    }

    await this.ensureAdminCanBeDeleted(existingUser);

    try {
      await this.prisma.user.delete({ where: { id } });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new BadRequestException(
          'User has related records and cannot be deleted',
        );
      }

      throw error;
    }

    return {
      data: {
        success: true,
      },
    };
  }

  findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        role: {
          include: {
            permissions: {
              include: { permission: true },
            },
          },
        },
        permissions: {
          include: { permission: true },
        },
      },
    });
  }

  markLoginSuccess(id: string) {
    return this.prisma.user.update({
      where: { id },
      data: {
        failedAttempts: 0,
        lastLoginAt: new Date(),
      },
    });
  }

  markLoginFailure(id: string, failedAttempts: number) {
    return this.prisma.user.update({
      where: { id },
      data: {
        failedAttempts,
        active: failedAttempts >= 3 ? false : undefined,
      },
    });
  }

  resolvePermissionKeys(user: Awaited<ReturnType<UsersService['findById']>>) {
    if (!user) {
      return [];
    }

    const userPermissionKeys = user.permissions.map(
      (userPermission) => userPermission.permissionKey,
    );

    if (userPermissionKeys.length > 0) {
      return userPermissionKeys;
    }

    return user.role.permissions.map(
      (rolePermission) => rolePermission.permissionKey,
    );
  }

  toSessionUser(
    user: NonNullable<Awaited<ReturnType<UsersService['findById']>>>,
  ) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      role: user.roleCode,
      permissions: this.resolvePermissionKeys(user),
      isDev: user.roleCode === RoleCode.dev,
    };
  }

  private toUserSummary(user: {
    id: string;
    username: string;
    fullName: string;
    department: string | null;
    employeeNo: string | null;
    roleCode: RoleCode;
    active: boolean;
    lastLoginAt: Date | null;
  }) {
    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      department: user.department,
      employeeNo: user.employeeNo,
      role: user.roleCode,
      active: user.active,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
    };
  }

  private async ensureAdminWillRemain(
    existingUser: { id: string; roleCode: RoleCode; active: boolean },
    dto: UpdateUserDto,
  ) {
    if (existingUser.roleCode !== RoleCode.admin || !existingUser.active) {
      return;
    }

    const nextRole = dto.role ?? existingUser.roleCode;
    const nextActive = dto.active ?? existingUser.active;
    const removesActiveAdmin =
      nextRole !== RoleCode.admin || nextActive === false;

    if (!removesActiveAdmin) {
      return;
    }

    const activeAdminCount = await this.prisma.user.count({
      where: {
        roleCode: RoleCode.admin,
        active: true,
      },
    });

    if (activeAdminCount <= 1) {
      throw new BadRequestException(
        'At least one active admin account is required',
      );
    }
  }

  private async ensureAdminCanBeDeleted(existingUser: {
    roleCode: RoleCode;
    active: boolean;
  }) {
    if (existingUser.roleCode !== RoleCode.admin) {
      return;
    }

    const adminCount = await this.prisma.user.count({
      where: { roleCode: RoleCode.admin },
    });

    if (adminCount <= 1) {
      throw new BadRequestException('At least one admin account is required');
    }

    if (!existingUser.active) {
      return;
    }

    const activeAdminCount = await this.prisma.user.count({
      where: {
        roleCode: RoleCode.admin,
        active: true,
      },
    });

    if (activeAdminCount <= 1) {
      throw new BadRequestException(
        'At least one active admin account is required',
      );
    }
  }
}
