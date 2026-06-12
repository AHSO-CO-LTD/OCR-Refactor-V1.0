import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly usersService: UsersService,
  ) {}

  async login(dto: LoginDto) {
    const user = await this.usersService.findByUsername(dto.username);

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const passwordMatches = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!passwordMatches) {
      await this.usersService.markLoginFailure(
        user.id,
        user.failedAttempts + 1,
      );
      throw new UnauthorizedException('Invalid username or password');
    }

    await this.usersService.markLoginSuccess(user.id);
    const refreshedUser = await this.usersService.findById(user.id);

    if (!refreshedUser) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const sessionUser = this.usersService.toSessionUser(refreshedUser);
    const accessToken = await this.jwtService.signAsync(
      {
        sub: sessionUser.id,
        username: sessionUser.username,
        role: sessionUser.role,
      },
      {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      },
    );

    return {
      data: {
        accessToken,
        user: sessionUser,
      },
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);

    if (!user || !user.active) {
      throw new UnauthorizedException('Invalid session');
    }

    return {
      data: {
        user: this.usersService.toSessionUser(user),
      },
    };
  }
}
