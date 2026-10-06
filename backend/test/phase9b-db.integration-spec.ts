import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { ModuleRef } from '@nestjs/core';
import { RoleCode } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PermissionsGuard } from '../src/auth/permissions.guard';
import { RememberedLoginService } from '../src/auth/remembered-login.service';
import { PERMISSIONS } from '../src/common/constants/permissions';
import { PrismaService } from '../src/database/prisma.service';
import { DongilHistorySyncController } from '../src/dongil-sync/dongil-history-sync.controller';
import { DongilSyncController } from '../src/dongil-sync/dongil-sync.controller';
import { LOCAL_DONGIL_MACHINE_TYPE_CODE } from '../src/dongil-sync/dongil-sync.constants';
import { DongilSyncService } from '../src/dongil-sync/dongil-sync.service';
import type { BootstrapDongilSyncDto } from '../src/dongil-sync/dto/bootstrap-dongil-sync.dto';
import type { SystemService } from '../src/system/system.service';
import { UsersService } from '../src/users/users.service';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('Phase 9B integration test requires DATABASE_URL.');
}

const databaseName = new URL(databaseUrl).pathname.replace(/^\//, '');

if (!/^ocrahso_codex_phase9b_[a-zA-Z0-9_]+$/.test(databaseName)) {
  throw new Error(
    `Refusing to run Phase 9B integration test against database ${databaseName}.`,
  );
}

describe('Phase 9B isolated database integration', () => {
  const prisma = new PrismaService();
  const users = new UsersService(prisma);
  const config = new ConfigService({
    JWT_SECRET: 'phase9b-isolated-test-secret',
    DESKTOP_INTERNAL_TOKEN: 'phase9b-desktop-token',
  });
  let dongleAllowed = true;
  const systemService = {
    assertAutoLoginAllowed: jest.fn(() => Promise.resolve(dongleAllowed)),
  } as unknown as SystemService;
  const rememberedLogin = new RememberedLoginService(
    config,
    new JwtService(),
    prisma,
    systemService,
    users,
  );

  beforeAll(async () => {
    await prisma.$connect();
    const identity = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    expect(identity[0]?.database).toBe(databaseName);

    await prisma.rememberedLogin.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.dongilSyncConfiguration.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'phase9b_' } },
    });
    await prisma.rolePermission.deleteMany();
    await prisma.role.deleteMany();

    await prisma.role.createMany({
      data: [
        { code: RoleCode.dev, name: 'Developer', visible: false },
        { code: RoleCode.admin, name: 'Admin', visible: true },
        { code: RoleCode.engineer, name: 'Engineer', visible: true },
        { code: RoleCode.operator, name: 'Operator', visible: true },
      ],
    });

    await executeMigrationSql(
      prisma,
      '20261006110000_dongil_operator_permissions',
    );
    await prisma.rolePermission.createMany({
      data: [
        {
          roleCode: RoleCode.admin,
          permissionKey: PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW,
        },
        {
          roleCode: RoleCode.admin,
          permissionKey: PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE,
        },
        {
          roleCode: RoleCode.engineer,
          permissionKey: PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW,
        },
        {
          roleCode: RoleCode.operator,
          permissionKey: PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW,
        },
      ],
      skipDuplicates: true,
    });

    await prisma.user.createMany({
      data: Object.values(RoleCode).map((roleCode) => ({
        username: `phase9b_${roleCode}`,
        passwordHash: 'phase9b-non-login-hash',
        fullName: `Phase 9B ${roleCode}`,
        roleCode,
        active: true,
      })),
    });
  });

  afterAll(async () => {
    await prisma.rememberedLogin.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.user.deleteMany({
      where: { username: { startsWith: 'phase9b_' } },
    });
    await prisma.$disconnect();
  });

  it('has a complete migration history and the new schema objects', async () => {
    const history = await prisma.$queryRaw<
      Array<{ completed: bigint; failed: bigint }>
    >`
      SELECT
        COUNT(*) FILTER (
          WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
        ) AS completed,
        COUNT(*) FILTER (
          WHERE finished_at IS NULL AND rolled_back_at IS NULL
        ) AS failed
      FROM "_prisma_migrations"
    `;

    expect(Number(history[0]?.completed)).toBe(48);
    expect(Number(history[0]?.failed)).toBe(0);
    expect(await prisma.rememberedLogin.count()).toBe(0);

    const configuration = await prisma.dongilSyncConfiguration.create({
      data: {
        id: 'default',
        machineTypeCode: 'BROKEN_ENV_VALUE',
      },
    });
    expect(configuration.configVersion).toBe(2);
    expect(configuration.serverUrl).toBeNull();

    await executeMigrationSql(
      prisma,
      '20261006090000_fixed_washing_machine_type',
    );
    const normalized = await prisma.dongilSyncConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(normalized.machineTypeCode).toBe(LOCAL_DONGIL_MACHINE_TYPE_CODE);
  });

  it('persists only a remember-token hash and restores every role', async () => {
    for (const roleCode of Object.values(RoleCode)) {
      const user = await findTestUser(prisma, roleCode);
      const machineId = `phase9b-machine-${roleCode}`;
      const enabled = await rememberedLogin.enable(user.id, machineId);
      const stored = await prisma.rememberedLogin.findUniqueOrThrow({
        where: { id: 'default' },
      });

      expect(stored.tokenHash).not.toBe(enabled.data.token);
      expect(stored.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(stored.roleCodeAtSave).toBe(roleCode);

      const restored = await rememberedLogin.restore(
        enabled.data.token,
        machineId,
      );
      expect(restored.data.status).toBe('REMEMBER_RESTORED');
      if (restored.data.status === 'REMEMBER_RESTORED') {
        const restoredSession = restored.data as {
          status: 'REMEMBER_RESTORED';
          user: { role: RoleCode };
          accessToken: string;
        };
        expect(restoredSession.user.role).toBe(roleCode);
        expect(restoredSession.accessToken).toBeTruthy();
      }
    }
  });

  it('retains the record for transient dongle denial and revokes invalid credentials', async () => {
    const operator = await findTestUser(prisma, RoleCode.operator);
    const enabled = await rememberedLogin.enable(
      operator.id,
      'phase9b-transient-machine',
    );

    dongleAllowed = false;
    const transient = await rememberedLogin.restore(
      enabled.data.token,
      'phase9b-transient-machine',
    );
    expect(transient.data.status).toBe('REMEMBER_DONGLE_REQUIRED');
    expect(await prisma.rememberedLogin.count()).toBe(1);

    dongleAllowed = true;
    const rejected = await rememberedLogin.restore(
      'invalid-phase9b-token',
      'phase9b-transient-machine',
    );
    expect(rejected.data.status).toBe('REMEMBER_TOKEN_INVALID');
    expect(await prisma.rememberedLogin.count()).toBe(0);
  });

  it('revokes remembered login transactionally on role change and user deletion', async () => {
    const actor = await findTestUser(prisma, RoleCode.admin);
    const roleChangeUser = await prisma.user.create({
      data: {
        username: 'phase9b_role_change',
        passwordHash: 'phase9b-non-login-hash',
        fullName: 'Phase 9B role change',
        roleCode: RoleCode.operator,
      },
    });
    await rememberedLogin.enable(roleChangeUser.id, 'phase9b-role-machine');
    await users.updateUser(
      roleChangeUser.id,
      { role: RoleCode.engineer },
      true,
      actor.id,
    );
    expect(await prisma.rememberedLogin.count()).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: { action: 'auth.remember.revoke-role-change' },
      }),
    ).toBe(1);

    const deleteUser = await prisma.user.create({
      data: {
        username: 'phase9b_delete',
        passwordHash: 'phase9b-non-login-hash',
        fullName: 'Phase 9B delete',
        roleCode: RoleCode.operator,
      },
    });
    await rememberedLogin.enable(deleteUser.id, 'phase9b-delete-machine');
    await users.deleteUser(deleteUser.id, actor.id, true);
    expect(await prisma.rememberedLogin.count()).toBe(0);
    expect(
      await prisma.auditLog.count({
        where: {
          action: 'auth.remember.revoke-account-state',
          target: deleteUser.id,
        },
      }),
    ).toBe(1);
  });

  it('allows operator refresh/reconnect/start but denies history management', async () => {
    const operator = await findTestUser(prisma, RoleCode.operator);
    const loaded = await users.findById(operator.id);
    const permissionKeys = users.resolvePermissionKeys(loaded);

    expect(permissionKeys).toEqual(
      expect.arrayContaining([
        PERMISSIONS.DONGIL_CONNECTION_VIEW,
        PERMISSIONS.DONGIL_CONNECTION_OPERATE,
        PERMISSIONS.DONGIL_HISTORY_SYNC_VIEW,
        PERMISSIONS.DONGIL_HISTORY_SYNC_START,
      ]),
    );
    expect(permissionKeys).not.toContain(
      PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE,
    );

    const guard = new PermissionsGuard(new Reflector(), users);
    for (const handler of [
      controllerHandler(DongilSyncController.prototype, 'userStatus'),
      controllerHandler(
        DongilSyncController.prototype,
        'refreshRegistrationStatus',
      ),
      controllerHandler(DongilSyncController.prototype, 'reconnect'),
      controllerHandler(DongilSyncController.prototype, 'startHistorySync'),
      controllerHandler(DongilHistorySyncController.prototype, 'current'),
    ]) {
      await expect(
        guard.canActivate(permissionContext(handler, operator.id)),
      ).resolves.toBe(true);
    }
    await expect(
      guard.canActivate(
        permissionContext(
          controllerHandler(DongilHistorySyncController.prototype, 'pause'),
          operator.id,
        ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const controller = new DongilSyncController(
      config,
      {} as DongilSyncService,
      {} as never,
      users,
    );
    const actor = users.toSessionUser(loaded!);
    await expect(
      controller.saveSettings(reconnectDto(), actor, 'phase9b-desktop-token'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('deduplicates concurrent reconnect work and keeps DB configuration idempotent', async () => {
    const actor = await findTestUser(prisma, RoleCode.admin);
    const service = new DongilSyncService(prisma, {} as ModuleRef);
    const dto = reconnectDto();

    await service.configure(dto);
    await service.configure(dto);
    expect(await prisma.dongilSyncConfiguration.count()).toBe(1);
    const stored = await prisma.dongilSyncConfiguration.findUniqueOrThrow({
      where: { id: 'default' },
    });
    expect(stored.machineTypeCode).toBe(LOCAL_DONGIL_MACHINE_TYPE_CODE);

    const performBootstrap = jest.fn(() =>
      Promise.resolve({ data: { state: 'ONLINE' } }),
    );
    (
      service as unknown as {
        performBootstrap: typeof performBootstrap;
      }
    ).performBootstrap = performBootstrap;

    await Promise.all([
      service.reconnect(dto, actor.id),
      service.reconnect(dto, actor.id),
    ]);
    expect(performBootstrap).toHaveBeenCalledTimes(1);
    expect(
      await prisma.auditLog.count({
        where: {
          actorId: actor.id,
          action: 'dongil.connection.reconnect',
        },
      }),
    ).toBe(2);
  });
});

async function findTestUser(prisma: PrismaService, roleCode: RoleCode) {
  return prisma.user.findUniqueOrThrow({
    where: { username: `phase9b_${roleCode}` },
  });
}

async function executeMigrationSql(
  prisma: PrismaService,
  migrationName: string,
) {
  const migrationPath = resolve(
    process.cwd(),
    'prisma',
    'migrations',
    migrationName,
    'migration.sql',
  );
  const statements = readFileSync(migrationPath, 'utf8')
    .split(/;\s*(?:\r?\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
}

function permissionContext(handler: unknown, userId: string) {
  return {
    getHandler: () => handler,
    getClass: () => DongilSyncController,
    switchToHttp: () => ({
      getRequest: () => ({ user: { id: userId } }),
    }),
  } as unknown as ExecutionContext;
}

function controllerHandler(prototype: object, methodName: string): unknown {
  return Reflect.get(prototype, methodName) as unknown;
}

function reconnectDto(): BootstrapDongilSyncDto {
  return {
    serverUrl: 'http://127.0.0.1:3979',
    machineId: 'phase9b-reconnect-machine',
    machineTypeCode: LOCAL_DONGIL_MACHINE_TYPE_CODE,
    licenseStatus: 'LICENSED',
    appVersion: 'phase9b',
    credential: 'phase9b-test-credential',
  };
}
