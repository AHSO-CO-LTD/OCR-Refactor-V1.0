import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { LineResultSavePolicy, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../database/prisma.service';
import { CreateInitialAdminDto } from './dto/create-initial-admin.dto';

const LINE_RESULT_SETTINGS_ID = 'default';

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

    const lineResultSaveFolderPath = dto.lineResultSaveFolderPath.trim();

    if (!lineResultSaveFolderPath) {
      throw new BadRequestException('Line result save folder is required');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);
    const user = await this.prisma.$transaction(async (tx) => {
      const createdUser = await tx.user.create({
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

      await tx.lineResultSettings.upsert({
        where: { id: LINE_RESULT_SETTINGS_ID },
        create: {
          id: LINE_RESULT_SETTINGS_ID,
          saveFolderPath: lineResultSaveFolderPath,
          savePolicy: LineResultSavePolicy.all,
          saveBySession: true,
          newSessionOnLineStop: true,
          newSessionOnProductChange: true,
        },
        update: {
          saveFolderPath: lineResultSaveFolderPath,
          savePolicy: LineResultSavePolicy.all,
          saveBySession: true,
          newSessionOnLineStop: true,
          newSessionOnProductChange: true,
        },
      });

      return createdUser;
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
