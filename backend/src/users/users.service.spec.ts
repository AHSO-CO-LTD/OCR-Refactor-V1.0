import { RoleCode } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { AuthSessionService } from '../auth/auth-session.service';
import { UsersService } from './users.service';

describe('UsersService login failure tracking', () => {
  it('records failed attempts without deactivating the account', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const service = new UsersService({
      user: { update },
    } as unknown as PrismaService, {} as AuthSessionService);

    await service.markLoginFailure('user-1', 3);

    expect(update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        failedAttempts: 3,
      },
    });
  });
});

describe('UsersService remembered-login revocation', () => {
  it.each([
    [
      'role change',
      { role: RoleCode.engineer },
      'auth.remember.revoke-role-change',
    ],
    ['deactivation', { active: false }, 'auth.remember.revoke-account-state'],
  ] as const)(
    'revokes in the same transaction on %s',
    async (_, dto, action) => {
      const existing = {
        id: 'user-1',
        roleCode: RoleCode.operator,
        active: true,
      };
      const updated = {
        ...existing,
        roleCode: 'role' in dto ? dto.role : existing.roleCode,
        active: 'active' in dto ? dto.active : existing.active,
      };
      const transaction = {
        user: { update: jest.fn().mockResolvedValue(updated) },
        rememberedLogin: {
          deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        },
        auditLog: { create: jest.fn().mockResolvedValue(undefined) },
      };
      const prisma = {
        user: { findUnique: jest.fn().mockResolvedValue(existing) },
        role: {
          findUnique: jest.fn().mockResolvedValue({
            code: RoleCode.engineer,
            visible: true,
          }),
        },
        $transaction: jest.fn(
          (operation: (client: typeof transaction) => unknown) =>
            operation(transaction),
        ),
      };
      const authSessions = {
        revokeAllForUser: jest.fn().mockResolvedValue(1),
      };
      const service = new UsersService(
        prisma as unknown as PrismaService,
        authSessions as unknown as AuthSessionService,
      );

      await service.updateUser('user-1', dto, false, 'admin-1');
      const auditCalls = (
        transaction.auditLog.create as unknown as {
          mock: { calls: unknown[][] };
        }
      ).mock.calls;
      const auditInput = auditCalls[0]?.[0] as {
        data: { action: string; actorId: string; target: string };
      };

      expect(transaction.rememberedLogin.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
      });
      expect(authSessions.revokeAllForUser).toHaveBeenCalledWith(
        'user-1',
        'role' in dto ? 'role-change' : 'account-state',
        'admin-1',
        transaction,
      );
      expect(auditInput.data).toMatchObject({
        actorId: 'admin-1',
        action,
        target: 'user-1',
      });
    },
  );
});
