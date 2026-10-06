import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../common/types/authenticated-request';
import { AuthSessionService } from './auth-session.service';

type JwtPayload = {
  sub: string;
  username: string;
  role: string;
  sid: string;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly authSessions: AuthSessionService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request);

    if (!token) {
      throw new UnauthorizedException('Missing bearer token');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(token, {
        secret: this.configService.getOrThrow<string>('JWT_SECRET'),
      });
      if (!payload.sub || !payload.sid) {
        throw new UnauthorizedException('Invalid bearer token');
      }
      const session = await this.authSessions.findActive(
        payload.sid,
        payload.sub,
      );
      if (!session?.user.active) {
        throw new UnauthorizedException('Invalid session');
      }
      request.user = {
        id: session.user.id,
        username: session.user.username,
        role: session.user.roleCode,
        sessionId: session.id,
      };
      return true;
    } catch {
      throw new UnauthorizedException('Invalid bearer token');
    }
  }

  private extractBearerToken(request: Request) {
    const authorization = request.headers.authorization;

    if (!authorization) {
      return null;
    }

    const [type, token] = authorization.split(' ');
    return type === 'Bearer' ? token : null;
  }
}
