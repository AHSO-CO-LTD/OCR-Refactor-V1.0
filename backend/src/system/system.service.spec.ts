import { PrismaService } from '../database/prisma.service';
import { DongleCheckerService } from './dongle-checker.service';
import { SystemService } from './system.service';

describe('SystemService auto-login dongle gate', () => {
  it('accepts a real dongle for remembered-session auto-login', async () => {
    const service = createService({ ok: true, code: 'DONGLE_OK' });

    await expect(service.assertAutoLoginAllowed()).resolves.toBe(true);
  });

  it('rejects dongle mock mode for remembered-session auto-login', async () => {
    const service = createService({ ok: true, code: 'DONGLE_MOCK_OK' });

    await expect(service.assertAutoLoginAllowed()).resolves.toBe(false);
  });
});

function createService(result: { ok: boolean; code: string }) {
  const prisma = {
    licenseLog: { create: jest.fn().mockResolvedValue(undefined) },
  } as unknown as PrismaService;
  const dongleChecker = {
    check: jest.fn().mockResolvedValue({
      ...result,
      retcode: result.ok ? 0 : null,
      checkedAt: new Date().toISOString(),
      message: result.code,
      dllPath: result.code === 'DONGLE_OK' ? 'System8.dll' : null,
    }),
  } as unknown as DongleCheckerService;

  return new SystemService(prisma, dongleChecker);
}
