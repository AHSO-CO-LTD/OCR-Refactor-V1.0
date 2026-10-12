INSERT INTO "Permission" ("key", "name", "group", "devOnly", "createdAt")
VALUES
  ('dongil.connection.view', 'View Dongil connection status', 'dongil', false, CURRENT_TIMESTAMP),
  ('dongil.connection.operate', 'Reconnect Dongil Server', 'dongil', false, CURRENT_TIMESTAMP),
  ('dongil.history-sync.start', 'Start Dongil history synchronization', 'dongil', false, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO UPDATE SET
  "name" = EXCLUDED."name",
  "group" = EXCLUDED."group",
  "devOnly" = EXCLUDED."devOnly";

INSERT INTO "RolePermission" ("roleCode", "permissionKey")
SELECT role."code", mapping."permissionKey"
FROM (
  VALUES
    ('dev', 'dongil.connection.view'),
    ('dev', 'dongil.connection.operate'),
    ('dev', 'dongil.history-sync.start'),
    ('admin', 'dongil.connection.view'),
    ('admin', 'dongil.connection.operate'),
    ('admin', 'dongil.history-sync.start'),
    ('engineer', 'dongil.connection.view'),
    ('operator', 'dongil.connection.view'),
    ('operator', 'dongil.connection.operate'),
    ('operator', 'dongil.history-sync.start')
) AS mapping("roleCode", "permissionKey")
INNER JOIN "Role" AS role ON role."code"::text = mapping."roleCode"
ON CONFLICT DO NOTHING;
