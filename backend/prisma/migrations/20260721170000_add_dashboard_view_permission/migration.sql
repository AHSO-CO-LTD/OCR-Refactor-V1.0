INSERT INTO "Permission" ("key", "name", "group", "devOnly")
VALUES ('dashboard.view', 'View dashboard', 'dashboard', false)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = EXCLUDED."devOnly";

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
SELECT "Role"."code", 'dashboard.view'
FROM "Role"
ON CONFLICT ("roleCode", "permissionKey") DO NOTHING;
