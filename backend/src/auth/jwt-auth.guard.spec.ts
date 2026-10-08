import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthSessionService } from './auth-session.service';
import { JwtAuthGuard } from './jwt-auth.guard';

describe('JwtAuthGuard local session validation', () => {
  it('uses current database identity for an active session', async () => {
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const guard = new JwtAuthGuard(
      {
        getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
      } as unknown as ConfigService,
      {
        verifyAsync: jest.fn().mockResolvedValue({
          sub: 'user-1',
          username: 'stale-name',
          role: 'operator',
          sid: 'session-1',
        }),
      } as unknown as JwtService,
      {
        findActive: jest.fn().mockResolvedValue({
          id: 'session-1',
          userId: 'user-1',
          user: {
            id: 'user-1',
            username: 'current-name',
            roleCode: 'engineer',
            active: true,
          },
        }),
      } as unknown as AuthSessionService,
    );

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request).toMatchObject({
      user: {
        id: 'user-1',
        username: 'current-name',
        role: 'engineer',
        sessionId: 'session-1',
      },
    });
  });

  it('rejects a validly signed JWT without an active local session', async () => {
    const request = { headers: { authorization: 'Bearer signed-token' } };
    const guard = new JwtAuthGuard(
      {
        getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
      } as unknown as ConfigService,
      {
        verifyAsync: jest.fn().mockResolvedValue({
          sub: 'user-1',
          username: 'operator',
          role: 'operator',
          sid: 'revoked-session',
        }),
      } as unknown as JwtService,
      {
        findActive: jest.fn().mockResolvedValue(null),
      } as unknown as AuthSessionService,
    );

    await expect(guard.canActivate(contextFor(request))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});

function contextFor(request: object) {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}
