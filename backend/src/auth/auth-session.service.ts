import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';

export type AuthSessionSource = 'password' | 'remembered-login';

type AuthSessionClient = Prisma.TransactionClient | PrismaService;

@Injectable()
export class AuthSessionService {
  constructor(private readonly prisma: PrismaService) {}

  create(userId: string, source: AuthSessionSource) {
    return this.prisma.$transaction((transaction) =>
      this.createWithClient(userId, source, transaction),
    );
  }

  async createWithClient(
    userId: string,
    source: AuthSessionSource,
    client: AuthSessionClient,
  ) {
    const session = await client.authSession.create({
      data: { userId },
    });
    await client.auditLog.create({
      data: {
        actorId: userId,
        action: 'auth.session.create',
        target: session.id,
        details: { source },
      },
    });
    return session;
  }

  findActive(sessionId: string, userId: string) {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            roleCode: true,
            active: true,
          },
        },
      },
    });
  }

  async revokeCurrent(
    userId: string,
    sessionId: string,
    reason: string,
    client: AuthSessionClient = this.prisma,
  ) {
    const revokedAt = new Date();
    const revoked = await client.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: { revokedAt, revokeReason: reason },
    });
    if (revoked.count > 0) {
      await client.auditLog.create({
        data: {
          actorId: userId,
          action: 'auth.session.logout',
          target: sessionId,
          details: { reason },
        },
      });
    }
    return revoked.count;
  }

  async revokeAllForUser(
    userId: string,
    reason: 'role-change' | 'account-state',
    actorId: string,
    client: AuthSessionClient = this.prisma,
  ) {
    const revoked = await client.authSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date(), revokeReason: reason },
    });
    if (revoked.count > 0) {
      await client.auditLog.create({
        data: {
          actorId,
          action:
            reason === 'role-change'
              ? 'auth.session.revoke-role-change'
              : 'auth.session.revoke-account-state',
          target: userId,
          details: { count: revoked.count, reason },
        },
      });
    }
    return revoked.count;
  }
}
