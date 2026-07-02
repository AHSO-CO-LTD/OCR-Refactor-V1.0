import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { CreateInitialAdminDto } from './dto/create-initial-admin.dto';

@Injectable()
export class SetupService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus() {
    const [adminCount, activeAdminCount, devCount] = await Promise.all([
      this.prisma.user.count({ where: { roleCode: RoleCode.admin } }),
      this.prisma.user.count({
        where: { roleCode: RoleCode.admin, active: true },
      }),
      this.prisma.user.count({ where: { roleCode: RoleCode.dev } }),
    ]);

    return {
      data: {
        initialized: activeAdminCount > 0,
        requiresAdminSetup: activeAdminCount === 0,
        adminCount,
        activeAdminCount,
        devSupportReady: devCount > 0,
      },
    };
  }

  async createInitialAdmin(dto: CreateInitialAdminDto) {
    const activeAdminCount = await this.prisma.user.count({
      where: { roleCode: RoleCode.admin, active: true },
    });

    if (activeAdminCount > 0) {
      throw new ConflictException('Initial admin is already configured');
    }

    const adminRole = await this.prisma.role.findUnique({
      where: { code: RoleCode.admin },
      select: { code: true },
    });

    if (!adminRole) {
      throw new BadRequestException('System roles are not initialized');
    }

    const username = dto.username.trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });

    if (existingUser) {
      throw new ConflictException('Username already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.user.create({
      data: {
        username,
        passwordHash,
        fullName: dto.fullName.trim(),
        department: dto.department?.trim() || null,
        employeeNo: dto.employeeNo?.trim() || null,
        roleCode: RoleCode.admin,
        active: true,
        failedAttempts: 0,
      },
    });

    return {
      data: {
        id: user.id,
        username: user.username,
        fullName: user.fullName,
        role: user.roleCode,
      },
    };
  }
}
