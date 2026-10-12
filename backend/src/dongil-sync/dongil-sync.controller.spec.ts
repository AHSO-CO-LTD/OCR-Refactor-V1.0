import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { REQUIRED_PERMISSIONS_KEY } from '../auth/permissions.decorator';
import { PERMISSIONS } from '../common/constants/permissions';
import { UsersService } from '../users/users.service';
import { DongilHistorySyncController } from './dongil-history-sync.controller';
import { DongilHistorySyncService } from './dongil-history-sync.service';
import { DongilSyncController } from './dongil-sync.controller';
import { DongilSyncService } from './dongil-sync.service';

describe('DongilSyncController permission contract', () => {
  it.each([
    ['userStatus', PERMISSIONS.DONGIL_CONNECTION_VIEW],
    ['refreshRegistrationStatus', PERMISSIONS.DONGIL_CONNECTION_VIEW],
    ['reconnect', PERMISSIONS.DONGIL_CONNECTION_OPERATE],
    ['startHistorySync', PERMISSIONS.DONGIL_HISTORY_SYNC_START],
  ] as const)('requires %s capability on %s', (method, permission) => {
    expect(
      Reflect.getMetadata(
        REQUIRED_PERMISSIONS_KEY,
        DongilSyncController.prototype[method],
      ),
    ).toEqual([permission]);
  });

  it.each(['pause', 'resume', 'cancel', 'retryFailures'] as const)(
    'keeps %s behind history management permission',
    (method) => {
      expect(
        Reflect.getMetadata(
          REQUIRED_PERMISSIONS_KEY,
          DongilHistorySyncController.prototype[method],
        ),
      ).toEqual([PERMISSIONS.DONGIL_HISTORY_SYNC_MANAGE]);
    },
  );

  it('rejects internal status access without the desktop token', () => {
    const controller = new DongilSyncController(
      {
        get: jest.fn().mockReturnValue('desktop-secret'),
      } as unknown as ConfigService,
      {} as DongilSyncService,
      {} as DongilHistorySyncService,
      {} as UsersService,
    );

    expect(() => controller.status(undefined)).toThrow(ForbiddenException);
  });
});
