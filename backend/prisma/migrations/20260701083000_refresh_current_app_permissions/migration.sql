INSERT INTO "Permission" ("key", "name", "group", "devOnly")
VALUES
  ('user.manage', 'Manage users', 'user', false),
  ('role.manage', 'Manage roles', 'role', false),
  ('permission.manage', 'Manage permissions', 'role', false),
  ('product.manage', 'Manage products', 'product', false),
  ('camera.manage', 'Manage camera settings', 'camera', false),
  ('camera.identity.manage', 'Manage camera identities', 'camera', false),
  ('camera.debug.view', 'View camera diagnostics', 'camera', false),
  ('inspection.start', 'Start inspection', 'inspection', false),
  ('inspection.stop', 'Stop inspection', 'inspection', false),
  ('inspection.test', 'Run line tests', 'inspection', false),
  ('report.view', 'View reports', 'report', false),
  ('system.shutdown', 'Shutdown system', 'system', false),
  ('license.view', 'View license state', 'system', false),
  ('system.debug', 'Debug system', 'system', true)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = EXCLUDED."devOnly";

DELETE FROM "RolePermission"
WHERE "permissionKey" IN ('roi.edit', 'history.view', 'inspection.override');

DELETE FROM "UserPermission"
WHERE "permissionKey" IN ('roi.edit', 'history.view', 'inspection.override');

DELETE FROM "Permission"
WHERE "key" IN ('roi.edit', 'history.view', 'inspection.override');

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
VALUES
  ('dev'::"RoleCode", 'camera.identity.manage'),
  ('dev'::"RoleCode", 'camera.debug.view'),
  ('dev'::"RoleCode", 'inspection.test'),
  ('admin'::"RoleCode", 'camera.identity.manage'),
  ('admin'::"RoleCode", 'camera.debug.view'),
  ('admin'::"RoleCode", 'inspection.test'),
  ('engineer'::"RoleCode", 'product.manage'),
  ('engineer'::"RoleCode", 'camera.manage'),
  ('engineer'::"RoleCode", 'camera.identity.manage'),
  ('engineer'::"RoleCode", 'camera.debug.view'),
  ('engineer'::"RoleCode", 'inspection.test'),
  ('engineer'::"RoleCode", 'report.view'),
  ('operator'::"RoleCode", 'inspection.start'),
  ('operator'::"RoleCode", 'inspection.stop')
ON CONFLICT ("roleCode", "permissionKey") DO NOTHING;
