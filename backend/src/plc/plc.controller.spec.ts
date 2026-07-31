import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { MachineRuntimeService } from './machine-runtime.service';
import { PlcController } from './plc.controller';
import { PlcRuntimeService } from './plc-runtime.service';

describe('PlcController inactivity settings', () => {
  const getInactivitySettings = jest.fn();
  const updateInactivitySettings = jest.fn();
  const notifyUserActivity = jest.fn();
  const controller = new PlcController(
    {} as PlcRuntimeService,
    {
      getInactivitySettings,
      updateInactivitySettings,
      notifyUserActivity,
    } as unknown as MachineRuntimeService,
  );

  beforeEach(() => {
    getInactivitySettings.mockReset();
    updateInactivitySettings.mockReset();
    notifyUserActivity.mockReset();
  });

  it.each(['operator', 'engineer'])(
    'rejects inactivity changes from the %s role',
    (role) => {
      expect(() =>
        controller.updateMachineInactivitySettings(
          { enabled: false, timeoutSeconds: 300 },
          user(role),
        ),
      ).toThrow(ForbiddenException);
      expect(updateInactivitySettings).not.toHaveBeenCalled();
    },
  );

  it.each(['admin', 'dev'])(
    'allows the %s role to change inactivity settings',
    async (role) => {
      const dto = { enabled: true, timeoutSeconds: 600 };

      await controller.updateMachineInactivitySettings(dto, user(role));

      expect(updateInactivitySettings).toHaveBeenCalledWith(dto);
    },
  );

  it('accepts activity reporting from an authenticated app session', async () => {
    await controller.notifyMachineUserActivity();

    expect(notifyUserActivity).toHaveBeenCalledTimes(1);
  });
});

describe('PlcController simulator access', () => {
  const enableSimulator = jest.fn();
  const controller = new PlcController(
    { enableSimulator } as unknown as PlcRuntimeService,
    {} as MachineRuntimeService,
  );

  beforeEach(() => {
    enableSimulator.mockReset();
    enableSimulator.mockResolvedValue({ data: { simulatorActive: true } });
  });

  it('allows dev to start the simulator without stopping machine runtime', async () => {
    await controller.enableSimulator({ clientId: 'dev-client' }, user('dev'));

    expect(enableSimulator).toHaveBeenCalledWith('dev-client');
  });

  it('rejects non-dev users', async () => {
    await expect(
      controller.enableSimulator({ clientId: 'admin-client' }, user('admin')),
    ).rejects.toThrow(ForbiddenException);
    expect(enableSimulator).not.toHaveBeenCalled();
  });
});

function user(role: string): AuthenticatedRequest['user'] {
  return { id: `${role}-1`, username: role, role };
}
