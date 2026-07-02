import { PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const permissions = [
  { key: 'user.manage', name: 'Manage users', group: 'user' },
  { key: 'role.manage', name: 'Manage roles', group: 'role' },
  { key: 'permission.manage', name: 'Manage permissions', group: 'role' },
  { key: 'product.manage', name: 'Manage products', group: 'product' },
  { key: 'camera.manage', name: 'Manage camera settings', group: 'camera' },
  {
    key: 'camera.identity.manage',
    name: 'Manage camera identities',
    group: 'camera',
  },
  { key: 'camera.debug.view', name: 'View camera diagnostics', group: 'camera' },
  { key: 'inspection.start', name: 'Start inspection', group: 'inspection' },
  { key: 'inspection.stop', name: 'Stop inspection', group: 'inspection' },
  { key: 'inspection.test', name: 'Run line tests', group: 'inspection' },
  { key: 'report.view', name: 'View reports', group: 'report' },
  { key: 'system.shutdown', name: 'Shutdown system', group: 'system' },
  { key: 'license.view', name: 'View license state', group: 'system' },
  { key: 'system.debug', name: 'Debug system', group: 'system', devOnly: true },
];

const rolePermissionMap: Record<RoleCode, string[]> = {
  dev: permissions.map((permission) => permission.key),
  admin: permissions
    .filter((permission) => !permission.devOnly)
    .map((permission) => permission.key),
  engineer: [
    'product.manage',
    'camera.manage',
    'camera.identity.manage',
    'camera.debug.view',
    'inspection.test',
    'report.view',
  ],
  operator: ['inspection.start', 'inspection.stop'],
};

async function seed() {
  for (const role of [
    { code: RoleCode.dev, name: 'Developer', visible: false },
    { code: RoleCode.admin, name: 'Admin', visible: true },
    { code: RoleCode.engineer, name: 'Engineer', visible: true },
    { code: RoleCode.operator, name: 'Operator', visible: true },
  ]) {
    await prisma.role.upsert({
      where: { code: role.code },
      update: { name: role.name, visible: role.visible },
      create: role,
    });
  }

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: { key: permission.key },
      update: permission,
      create: permission,
    });
  }

  for (const [roleCode, permissionKeys] of Object.entries(rolePermissionMap)) {
    await prisma.rolePermission.deleteMany({
      where: { roleCode: roleCode as RoleCode },
    });

    await prisma.rolePermission.createMany({
      data: permissionKeys.map((permissionKey) => ({
        roleCode: roleCode as RoleCode,
        permissionKey,
      })),
      skipDuplicates: true,
    });
  }

  const seedMode = process.env.OCR_SEED_MODE ?? 'development';

  if (seedMode === 'production') {
    const supportPassword = readRequiredEnv('DEV_SUPPORT_PASSWORD');
    const passwordHash = await bcrypt.hash(supportPassword, 12);

    await prisma.user.upsert({
      where: { username: 'dev' },
      update: {
        passwordHash,
        fullName: 'Developer Support',
        roleCode: RoleCode.dev,
        active: true,
        failedAttempts: 0,
      },
      create: {
        username: 'dev',
        fullName: 'Developer Support',
        roleCode: RoleCode.dev,
        passwordHash,
        active: true,
        failedAttempts: 0,
      },
    });

    return;
  }

  const passwordHash = await bcrypt.hash('admin123', 12);

  for (const user of [
    {
      username: 'dev',
      fullName: 'Developer',
      roleCode: RoleCode.dev,
    },
    {
      username: 'admin',
      fullName: 'Administrator',
      roleCode: RoleCode.admin,
    },
    {
      username: 'engineer',
      fullName: 'Engineer',
      roleCode: RoleCode.engineer,
    },
    {
      username: 'operator',
      fullName: 'Operator',
      roleCode: RoleCode.operator,
    },
  ]) {
    await prisma.user.upsert({
      where: { username: user.username },
      update: {
        passwordHash,
        fullName: user.fullName,
        roleCode: user.roleCode,
        active: true,
        failedAttempts: 0,
      },
      create: {
        ...user,
        passwordHash,
        active: true,
        failedAttempts: 0,
      },
    });
  }
}

seed()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });

function readRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required for production seed`);
  }

  return value;
}
