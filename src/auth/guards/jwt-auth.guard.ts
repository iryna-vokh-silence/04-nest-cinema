import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { isUUID } from 'class-validator';
import { ROLES } from '../../users/role.enum';
import {
  AccessTokenPayload,
  AuthenticatedRequest,
} from '../authenticated-user';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';

const BEARER = /^Bearer ([A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+)$/;

/**
 * Global authentication guard (registered with APP_GUARD, no Passport).
 *
 * Skips routes marked with @Public(). Otherwise requires
 * `Authorization: Bearer <access token>`, verifies the signature and expiry
 * and puts { id, role } into request.user. Missing header, wrong format,
 * bad signature and expired token all give 401.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request.headers.authorization);

    let payload: unknown;
    try {
      payload = await this.jwtService.verifyAsync<object>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token');
    }
    if (!isAccessTokenPayload(payload)) {
      throw new UnauthorizedException('Invalid or expired access token');
    }

    request.user = { id: payload.sub, role: payload.role };
    return true;
  }

  private extractToken(header: string | undefined): string {
    if (header === undefined || header.trim() === '') {
      throw new UnauthorizedException('Missing access token');
    }
    const match = BEARER.exec(header.trim());
    if (!match) {
      throw new UnauthorizedException(
        'Authorization header must have the format "Bearer <access token>"',
      );
    }
    return match[1];
  }
}

function isAccessTokenPayload(value: unknown): value is AccessTokenPayload {
  if (typeof value !== 'object' || value === null) return false;
  const { sub, role } = value as Record<string, unknown>;
  return (
    typeof sub === 'string' &&
    isUUID(sub) &&
    typeof role === 'string' &&
    (ROLES as string[]).includes(role)
  );
}
