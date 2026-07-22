INSERT INTO "Permission" ("key", "name", "group", "devOnly")
VALUES ('roi.edit', 'Edit product ROI', 'product', false)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = false;

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
SELECT role_permission."roleCode", 'roi.edit'
FROM (
  VALUES
    ('dev'::"RoleCode"),
    ('admin'::"RoleCode")
) AS role_permission("roleCode")
JOIN "Role" ON "Role"."code" = role_permission."roleCode"
ON CONFLICT ("roleCode", "permissionKey") DO NOTHING;
