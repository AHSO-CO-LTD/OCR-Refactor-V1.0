import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { SystemService } from '../system/system.service';
import { UsersService } from '../users/users.service';
import { AuthSessionService } from './auth-session.service';
import { AuthService } from './auth.service';
import { RememberedLoginService } from './remembered-login.service';

describe('AuthService current session gate', () => {
  it('keeps ordinary authenticated-session checks on the normal license gate', async () => {
    const user = { id: 'user-1', active: true };
    const sessionUser = { id: 'user-1', username: 'dev', role: 'dev' };
    const assertLoginAllowed = jest.fn().mockResolvedValue(true);
    const service = new AuthService(
      {} as ConfigService,
      {} as JwtService,
      { assertLoginAllowed } as unknown as SystemService,
      {
        findById: jest.fn().mockResolvedValue(user),
        toSessionUser: jest.fn().mockReturnValue(sessionUser),
      } as unknown as UsersService,
      {} as AuthSessionService,
      {} as RememberedLoginService,
    );

    await expect(service.me('user-1')).resolves.toEqual({
      data: { user: sessionUser },
    });
  });
});

describe('AuthService remembered-login choice', () => {
  it('revokes the workstation remembered record when login is unchecked', async () => {
    const harness = await createLoginHarness();

    await harness.service.login({
      username: 'operator',
      password: 'secret',
      rememberLogin: false,
    });

    expect(harness.rememberedLogin.disableForLoginChoice).toHaveBeenCalledWith(
      'user-1',
    );
  });

  it('keeps the opt-in path available for every authenticated role', async () => {
    const harness = await createLoginHarness();

    await harness.service.login({
      username: 'operator',
      password: 'secret',
      rememberLogin: true,
    });

    expect(
      harness.rememberedLogin.disableForLoginChoice,
    ).not.toHaveBeenCalled();
  });
});

async function createLoginHarness() {
  const user = {
    id: 'user-1',
    username: 'operator',
    passwordHash: await bcrypt.hash('secret', 4),
    active: true,
    failedAttempts: 0,
    roleCode: 'operator',
  };
  const sessionUser = {
    id: user.id,
    username: user.username,
    role: user.roleCode,
  };
  const usersService = {
    findByUsername: jest.fn().mockResolvedValue(user),
    findById: jest.fn().mockResolvedValue(user),
    markLoginSuccess: jest.fn().mockResolvedValue(undefined),
    markLoginFailure: jest.fn().mockResolvedValue(undefined),
    toSessionUser: jest.fn().mockReturnValue(sessionUser),
  };
  const rememberedLogin = {
    disableForLoginChoice: jest.fn().mockResolvedValue(undefined),
  };
  const authSessions = {
    create: jest.fn().mockResolvedValue({ id: 'session-1' }),
  };
  const service = new AuthService(
    {
      getOrThrow: jest.fn().mockReturnValue('jwt-secret'),
    } as unknown as ConfigService,
    {
      signAsync: jest.fn().mockResolvedValue('access-token'),
    } as unknown as JwtService,
    {
      assertLoginAllowed: jest.fn().mockResolvedValue(true),
    } as unknown as SystemService,
    usersService as unknown as UsersService,
    authSessions as unknown as AuthSessionService,
    rememberedLogin as unknown as RememberedLoginService,
  );

  return { authSessions, rememberedLogin, service, usersService };
}
