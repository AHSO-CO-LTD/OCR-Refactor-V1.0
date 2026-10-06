import { ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RememberedLoginController } from './remembered-login.controller';
import { RememberedLoginService } from './remembered-login.service';

describe('RememberedLoginController desktop boundary', () => {
  it('rejects restore when the desktop internal token is missing', () => {
    const controller = new RememberedLoginController(
      {
        get: jest.fn().mockReturnValue('desktop-secret'),
      } as unknown as ConfigService,
      {} as RememberedLoginService,
    );

    expect(() =>
      controller.restore(
        { machineId: 'machine-1', token: 'a'.repeat(43) },
        undefined,
      ),
    ).toThrow(ForbiddenException);
  });
});
