import { PrismaClient, RoleCode } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

const permissions = [
  { key: 'user.manage', name: 'Manage users', group: 'user' },
  { key: 'role.manage', name: 'Manage roles', group: 'role' },
  { key: 'permission.manage', name: 'Manage permissions', group: 'role' },
  { key: 'product.manage', name: 'Manage products', group: 'product' },
  { key: 'camera.manage', name: 'Manage camera settings', group: 'camera' },
  { key: 'roi.edit', name: 'Edit ROI', group: 'inspection' },
  { key: 'inspection.start', name: 'Start inspection', group: 'inspection' },
  { key: 'inspection.stop', name: 'Stop inspection', group: 'inspection' },
  { key: 'inspection.override', name: 'Override inspection', group: 'inspection' },
  { key: 'history.view', name: 'View history', group: 'history' },
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
  engineer: ['product.manage', 'camera.manage', 'roi.edit', 'history.view'],
  operator: ['inspection.start', 'inspection.stop', 'roi.edit'],
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

  const passwordHash = await bcrypt.hash('admin123', 12);

  await prisma.user.upsert({
    where: { username: 'dev' },
    update: { passwordHash, roleCode: RoleCode.dev, active: true },
    create: {
      username: 'dev',
      passwordHash,
      fullName: 'Developer',
      roleCode: RoleCode.dev,
    },
  });

  await prisma.user.upsert({
    where: { username: 'admin' },
    update: { passwordHash, roleCode: RoleCode.admin, active: true },
    create: {
      username: 'admin',
      passwordHash,
      fullName: 'Administrator',
      roleCode: RoleCode.admin,
    },
  });
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

