INSERT INTO "Permission" ("key", "name", "group", "devOnly")
VALUES
  ('plc.manage', 'Manage PLC configuration', 'plc', false),
  ('plc.operate', 'Operate PLC controls', 'plc', false)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = EXCLUDED."devOnly";

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
SELECT desired."roleCode", desired."permissionKey"
FROM (
  VALUES
    ('dev'::"RoleCode", 'plc.manage'),
    ('dev'::"RoleCode", 'plc.operate'),
    ('admin'::"RoleCode", 'plc.manage'),
    ('admin'::"RoleCode", 'plc.operate'),
    ('engineer'::"RoleCode", 'plc.manage'),
    ('engineer'::"RoleCode", 'plc.operate'),
    ('operator'::"RoleCode", 'plc.manage'),
    ('operator'::"RoleCode", 'plc.operate')
) AS desired("roleCode", "permissionKey")
JOIN "Role" ON "Role"."code" = desired."roleCode"
JOIN "Permission" ON "Permission"."key" = desired."permissionKey"
ON CONFLICT ("roleCode", "permissionKey") DO NOTHING;
