import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PERMISSIONS } from './permissions';

describe('Dongil operator permission migration', () => {
  const migration = readFileSync(
    resolve(
      __dirname,
      '../../../prisma/migrations/20261006110000_dongil_operator_permissions/migration.sql',
    ),
    'utf8',
  );

  it('defines the three separated connection/start capabilities', () => {
    expect(PERMISSIONS.DONGIL_CONNECTION_VIEW).toBe('dongil.connection.view');
    expect(PERMISSIONS.DONGIL_CONNECTION_OPERATE).toBe(
      'dongil.connection.operate',
    );
    expect(PERMISSIONS.DONGIL_HISTORY_SYNC_START).toBe(
      'dongil.history-sync.start',
    );
  });

  it.each([
    'dongil.connection.view',
    'dongil.connection.operate',
    'dongil.history-sync.start',
  ])('grants operator %s', (permission) => {
    expect(migration).toContain(`('operator', '${permission}')`);
  });

  it('does not grant operator configuration or history-management capability', () => {
    expect(migration).not.toContain(
      "('operator', 'dongil.history-sync.manage')",
    );
    expect(migration).not.toContain("('operator', 'system.settings')");
  });
});
