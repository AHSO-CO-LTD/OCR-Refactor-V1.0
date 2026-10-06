import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../database/prisma.service';
import { SystemService } from '../system/system.service';
import { UsersService } from '../users/users.service';
import { AuthSessionService } from './auth-session.service';
import { RememberedLoginService } from './remembered-login.service';

const roles = ['dev', 'admin', 'engineer', 'operator'] as const;

describe('RememberedLoginService', () => {
  it.each(roles)('allows %s to enable remembered login', async (role) => {
    const harness = createHarness({ role });

    const response = await harness.service.enable('user-1', 'machine-1');
    const upsertCalls = (
      harness.transaction.rememberedLogin.upsert as unknown as {
        mock: { calls: unknown[][] };
      }
    ).mock.calls;
    const upsertInput = upsertCalls[0]?.[0] as {
      create: { roleCodeAtSave: string };
      update: { roleCodeAtSave: string };
    };

    expect(response.data.enabled).toBe(true);
    expect(response.data.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(upsertInput.create.roleCodeAtSave).toBe(role);
    expect(upsertInput.update.roleCodeAtSave).toBe(role);
  });

  it('restores a fresh JWT only after the real-dongle gate succeeds', async () => {
    const token = 'remember-token';
    const harness = createHarness({
      remembered: rememberedRecord({ token }),
    });

    await expect(harness.service.restore(token, 'machine-1')).resolves.toEqual({
      data: {
        status: 'REMEMBER_RESTORED',
        accessToken: 'fresh-access-token',
        user: harness.sessionUser,
      },
    });
    expect(harness.systemService.assertAutoLoginAllowed).toHaveBeenCalledTimes(
      1,
    );
    expect(harness.jwtService.signAsync).toHaveBeenCalledTimes(1);
    expect(harness.prisma.rememberedLogin.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'default' } }),
    );
  });

  it('preserves the remembered record when the dongle result is unavailable', async () => {
    const harness = createHarness({ dongleAllowed: false });

    await expect(
      harness.service.restore('remember-token', 'machine-1'),
    ).resolves.toEqual({ data: { status: 'REMEMBER_DONGLE_REQUIRED' } });
    expect(harness.prisma.rememberedLogin.findUnique).not.toHaveBeenCalled();
    expect(
      harness.transaction.rememberedLogin.deleteMany,
    ).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong token', 'different-token', 'machine-1', 'REMEMBER_TOKEN_INVALID'],
    [
      'wrong machine',
      'remember-token',
      'machine-2',
      'REMEMBER_MACHINE_MISMATCH',
    ],
  ] as const)(
    'revokes a definitive %s failure',
    async (_, token, machineId, status) => {
      const harness = createHarness({
        remembered: rememberedRecord({ token: 'remember-token' }),
      });

      await expect(harness.service.restore(token, machineId)).resolves.toEqual({
        data: { status },
      });
      expect(
        harness.transaction.rememberedLogin.deleteMany,
      ).toHaveBeenCalledWith({
        where: { id: 'default' },
      });
    },
  );

  it.each([
    ['inactive user', { active: false }, 'REMEMBER_USER_INACTIVE'],
    [
      'changed role',
      { roleCode: 'engineer' as const },
      'REMEMBER_ROLE_CHANGED',
    ],
  ] as const)(
    'revokes when the remembered %s is no longer valid',
    async (_, userChange, status) => {
      const harness = createHarness({
        remembered: rememberedRecord({ token: 'remember-token', userChange }),
      });

      await expect(
        harness.service.restore('remember-token', 'machine-1'),
      ).resolves.toEqual({ data: { status } });
      expect(harness.transaction.rememberedLogin.deleteMany).toHaveBeenCalled();
    },
  );
});

function createHarness(
  options: {
    role?: (typeof roles)[number];
    dongleAllowed?: boolean;
    remembered?: ReturnType<typeof rememberedRecord>;
  } = {},
) {
  const role = options.role ?? 'operator';
  const user = userRecord(role);
  const sessionUser = {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role,
    permissions: [],
    isDev: role === 'dev',
  };
  const transaction = {
    rememberedLogin: {
      upsert: jest.fn().mockResolvedValue(undefined),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
  };
  const prisma = {
    rememberedLogin: {
      findUnique: jest.fn().mockResolvedValue(options.remembered ?? null),
      update: jest.fn().mockResolvedValue(undefined),
    },
    auditLog: { create: jest.fn().mockResolvedValue(undefined) },
    $transaction: jest.fn(async (operation: unknown) => {
      if (typeof operation === 'function') {
        return (operation as (client: typeof transaction) => unknown)(
          transaction,
        );
      }
      return Promise.all(operation as Promise<unknown>[]);
    }),
  };
  const systemService = {
    assertAutoLoginAllowed: jest
      .fn()
      .mockResolvedValue(options.dongleAllowed ?? true),
  };
  const usersService = {
    findById: jest.fn().mockResolvedValue(user),
    toSessionUser: jest.fn().mockReturnValue(sessionUser),
  };
  const jwtService = {
    signAsync: jest.fn().mockResolvedValue('fresh-access-token'),
  };
  const configService = {
    getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
  };
  const authSessions = {
    create: jest.fn().mockResolvedValue({ id: 'session-1' }),
  };

  return {
    service: new RememberedLoginService(
      configService as unknown as ConfigService,
      jwtService as unknown as JwtService,
      prisma as unknown as PrismaService,
      systemService as unknown as SystemService,
      usersService as unknown as UsersService,
      authSessions as unknown as AuthSessionService,
    ),
    authSessions,
    configService,
    jwtService,
    prisma,
    systemService,
    transaction,
    usersService,
    sessionUser,
  };
}

function userRecord(role: (typeof roles)[number]) {
  return {
    id: 'user-1',
    username: 'factory-user',
    fullName: 'Factory User',
    roleCode: role,
    active: true,
    permissions: [],
    role: { permissions: [] },
  };
}

function rememberedRecord(options: {
  token: string;
  userChange?: Partial<ReturnType<typeof userRecord>>;
}) {
  return {
    id: 'default',
    userId: 'user-1',
    machineId: 'machine-1',
    tokenHash: createHash('sha256').update(options.token).digest('hex'),
    roleCodeAtSave: 'operator' as const,
    enabledAt: new Date('2026-10-06T00:00:00.000Z'),
    lastRestoredAt: null,
    createdAt: new Date('2026-10-06T00:00:00.000Z'),
    updatedAt: new Date('2026-10-06T00:00:00.000Z'),
    user: {
      ...userRecord('operator'),
      ...options.userChange,
    },
  };
}
