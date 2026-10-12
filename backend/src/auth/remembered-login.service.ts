import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SystemService } from '../system/system.service';
import { UsersService } from '../users/users.service';
import { AuthSessionService } from './auth-session.service';

const REMEMBERED_LOGIN_ID = 'default';

export type RememberedLoginRestoreStatus =
  | 'NO_REMEMBERED_LOGIN'
  | 'REMEMBER_TOKEN_INVALID'
  | 'REMEMBER_MACHINE_MISMATCH'
  | 'REMEMBER_ROLE_CHANGED'
  | 'REMEMBER_USER_INACTIVE'
  | 'REMEMBER_DONGLE_REQUIRED'
  | 'REMEMBER_RESTORED';

@Injectable()
export class RememberedLoginService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly systemService: SystemService,
    private readonly usersService: UsersService,
    private readonly authSessions: AuthSessionService,
  ) {}

  async enable(userId: string, machineId: string) {
    if (!(await this.systemService.assertAutoLoginAllowed())) {
      throw new UnauthorizedException('Physical license dongle is required');
    }

    const user = await this.usersService.findById(userId);
    if (!user?.active) {
      throw new UnauthorizedException('Invalid session');
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const enabledAt = new Date();

    await this.prisma.$transaction(async (transaction) => {
      await transaction.rememberedLogin.upsert({
        where: { id: REMEMBERED_LOGIN_ID },
        create: {
          id: REMEMBERED_LOGIN_ID,
          userId: user.id,
          machineId,
          tokenHash,
          roleCodeAtSave: user.roleCode,
          enabledAt,
        },
        update: {
          userId: user.id,
          machineId,
          tokenHash,
          roleCodeAtSave: user.roleCode,
          enabledAt,
          lastRestoredAt: null,
        },
      });
      await transaction.auditLog.create({
        data: {
          actorId: user.id,
          action: 'auth.remember.enable',
          target: user.id,
          details: { role: user.roleCode },
        },
      });
    });

    return { data: { enabled: true, token } };
  }

  async disableForUser(userId: string, reason: string) {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.rememberedLogin.findFirst({
        where: { userId },
        select: { id: true },
      });
      if (!existing) return;
      await transaction.rememberedLogin.delete({ where: { id: existing.id } });
      await transaction.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.remember.disable',
          target: userId,
          details: { reason },
        },
      });
    });
    return { data: { disabled: true } };
  }

  async logoutSession(userId: string, sessionId: string) {
    await this.prisma.$transaction(async (transaction) => {
      await this.authSessions.revokeCurrent(
        userId,
        sessionId,
        'logout',
        transaction,
      );
      const remembered = await transaction.rememberedLogin.deleteMany({
        where: { userId },
      });
      if (remembered.count > 0) {
        await transaction.auditLog.create({
          data: {
            actorId: userId,
            action: 'auth.remember.disable',
            target: userId,
            details: { reason: 'logout' },
          },
        });
      }
    });
    return { data: { loggedOut: true } };
  }

  async disableForLoginChoice(actorId: string) {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.rememberedLogin.findUnique({
        where: { id: REMEMBERED_LOGIN_ID },
        select: { id: true, userId: true },
      });
      if (!existing) return;
      await transaction.rememberedLogin.delete({ where: { id: existing.id } });
      await transaction.auditLog.create({
        data: {
          actorId,
          action: 'auth.remember.disable',
          target: existing.userId,
          details: { reason: 'login-without-remember' },
        },
      });
    });
  }

  async rejectInvalidLocalCredential() {
    await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.rememberedLogin.findUnique({
        where: { id: REMEMBERED_LOGIN_ID },
        select: { id: true, userId: true },
      });
      if (!existing) return;
      await transaction.rememberedLogin.delete({ where: { id: existing.id } });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action: 'auth.remember.reject',
          target: existing.userId,
          details: { code: 'REMEMBER_LOCAL_TOKEN_INVALID' },
        },
      });
    });
    return { data: { disabled: true } };
  }

  async restore(token: string, machineId: string) {
    if (!(await this.systemService.assertAutoLoginAllowed())) {
      return this.status('REMEMBER_DONGLE_REQUIRED');
    }

    const remembered = await this.prisma.rememberedLogin.findUnique({
      where: { id: REMEMBERED_LOGIN_ID },
      include: {
        user: {
          include: {
            role: {
              include: {
                permissions: { include: { permission: true } },
              },
            },
            permissions: { include: { permission: true } },
          },
        },
      },
    });
    // Electron calls this endpoint only when a local encrypted token exists.
    // A missing DB row therefore means that token has been revoked or is stale.
    if (!remembered) return this.status('REMEMBER_TOKEN_INVALID');

    if (!this.tokenMatches(token, remembered.tokenHash)) {
      return this.rejectDefinitively(
        remembered.userId,
        'REMEMBER_TOKEN_INVALID',
      );
    }
    if (remembered.machineId !== machineId) {
      return this.rejectDefinitively(
        remembered.userId,
        'REMEMBER_MACHINE_MISMATCH',
      );
    }
    if (!remembered.user.active) {
      return this.rejectDefinitively(
        remembered.userId,
        'REMEMBER_USER_INACTIVE',
      );
    }
    if (remembered.user.roleCode !== remembered.roleCodeAtSave) {
      return this.rejectDefinitively(
        remembered.userId,
        'REMEMBER_ROLE_CHANGED',
        'auth.remember.revoke-role-change',
      );
    }

    const sessionUser = this.usersService.toSessionUser(remembered.user);
    const session = await this.authSessions.create(
      sessionUser.id,
      'remembered-login',
    );
    const accessToken = await this.jwtService.signAsync(
      {
        sub: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role,
        sid: session.id,
      },
      { secret: this.configService.getOrThrow<string>('JWT_SECRET') },
    );
    const restoredAt = new Date();
    await this.prisma.$transaction([
      this.prisma.rememberedLogin.update({
        where: { id: remembered.id },
        data: { lastRestoredAt: restoredAt },
      }),
      this.prisma.auditLog.create({
        data: {
          actorId: remembered.userId,
          action: 'auth.remember.restore',
          target: remembered.userId,
          details: { result: 'SUCCESS' },
        },
      }),
    ]);

    return {
      data: {
        status: 'REMEMBER_RESTORED' as const,
        accessToken,
        user: sessionUser,
      },
    };
  }

  private async rejectDefinitively(
    userId: string,
    status: Exclude<
      RememberedLoginRestoreStatus,
      'NO_REMEMBERED_LOGIN' | 'REMEMBER_DONGLE_REQUIRED' | 'REMEMBER_RESTORED'
    >,
    action = 'auth.remember.reject',
  ) {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.rememberedLogin.deleteMany({
        where: { id: REMEMBERED_LOGIN_ID },
      });
      await transaction.auditLog.create({
        data: {
          actorId: null,
          action,
          target: userId,
          details: { code: status },
        },
      });
    });
    return this.status(status);
  }

  private status(status: RememberedLoginRestoreStatus) {
    return { data: { status } };
  }

  private hashToken(token: string) {
    return createHash('sha256').update(token, 'utf8').digest('hex');
  }

  private tokenMatches(token: string, expectedHash: string) {
    const actual = Buffer.from(this.hashToken(token), 'hex');
    const expected = Buffer.from(expectedHash, 'hex');
    return (
      actual.length === expected.length && timingSafeEqual(actual, expected)
    );
  }
}
