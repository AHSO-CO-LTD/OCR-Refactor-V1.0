import { PrismaService } from '../database/prisma.service';
import { AuthSessionService } from './auth-session.service';

describe('AuthSessionService', () => {
  it('creates a session and audit event in one transaction', async () => {
    const session = {
      id: 'session-1',
      userId: 'user-1',
      createdAt: new Date(),
      revokedAt: null,
      revokeReason: null,
    };
    const transaction = {
      authSession: {
        create: jest.fn().mockResolvedValue(session),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const prisma = {
      $transaction: jest.fn(
        (operation: (client: typeof transaction) => unknown) =>
          operation(transaction),
      ),
    };
    const service = new AuthSessionService(prisma as unknown as PrismaService);

    await expect(service.create('user-1', 'password')).resolves.toBe(session);
    expect(transaction.authSession.create).toHaveBeenCalledWith({
      data: { userId: 'user-1' },
    });
    expect(transaction.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'user-1',
        action: 'auth.session.create',
        target: 'session-1',
        details: { source: 'password' },
      },
    });
  });

  it('revokes only the matching active session', async () => {
    const client = {
      authSession: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        create: jest.fn().mockResolvedValue(undefined),
      },
    };
    const service = new AuthSessionService({} as PrismaService);

    await expect(
      service.revokeCurrent('user-1', 'session-1', 'logout', client as never),
    ).resolves.toBe(1);
    const updateInput = (
      client.authSession.updateMany.mock.calls as unknown as Array<
        [
          {
            where: { id: string; userId: string; revokedAt: null };
            data: { revokedAt: Date; revokeReason: string };
          },
        ]
      >
    )[0]?.[0];
    expect(updateInput).toMatchObject({
      where: {
        id: 'session-1',
        userId: 'user-1',
        revokedAt: null,
      },
      data: {
        revokeReason: 'logout',
      },
    });
    expect(updateInput?.data.revokedAt).toBeInstanceOf(Date);
  });
});
