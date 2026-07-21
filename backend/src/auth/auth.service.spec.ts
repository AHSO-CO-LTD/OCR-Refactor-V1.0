import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { SystemService } from '../system/system.service';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';

describe('AuthService remembered session gate', () => {
  it('rejects a remembered session when the dongle is missing', async () => {
    const assertAutoLoginAllowed = jest.fn().mockResolvedValue(false);
    const findById = jest.fn();
    const service = new AuthService(
      {} as ConfigService,
      {} as JwtService,
      { assertAutoLoginAllowed } as unknown as SystemService,
      { findById } as unknown as UsersService,
    );

    await expect(service.restore('user-1')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(findById).not.toHaveBeenCalled();
  });

  it('restores an active session only after the dongle check passes', async () => {
    const user = { id: 'user-1', active: true };
    const sessionUser = {
      id: 'user-1',
      username: 'operator',
      role: 'operator',
    };
    const assertAutoLoginAllowed = jest.fn().mockResolvedValue(true);
    const findById = jest.fn().mockResolvedValue(user);
    const toSessionUser = jest.fn().mockReturnValue(sessionUser);
    const service = new AuthService(
      {} as ConfigService,
      {} as JwtService,
      { assertAutoLoginAllowed } as unknown as SystemService,
      { findById, toSessionUser } as unknown as UsersService,
    );

    await expect(service.restore('user-1')).resolves.toEqual({
      data: { user: sessionUser },
    });
    expect(assertAutoLoginAllowed).toHaveBeenCalledTimes(1);
  });

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
    );

    await expect(service.me('user-1')).resolves.toEqual({
      data: { user: sessionUser },
    });
  });
});
