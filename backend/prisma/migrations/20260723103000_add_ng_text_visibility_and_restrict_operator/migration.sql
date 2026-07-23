ALTER TABLE "LineResultSettings"
ADD COLUMN "showNgRecognizedText" BOOLEAN NOT NULL DEFAULT true;

DELETE FROM "RolePermission"
WHERE "roleCode" = 'operator'::"RoleCode"
  AND "permissionKey" IN ('dashboard.view', 'plc.manage');
