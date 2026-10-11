import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '../../users/role.enum';
import { AuthenticatedRequest } from '../authenticated-user';
import { ROLES_KEY } from '../decorators/roles.decorator';

/**
 * Global role guard. Runs after JwtAuthGuard (registered after it).
 * Routes without @Roles() / @Auth(role) are allowed for any logged-in user;
 * otherwise the role from the token must be one of the listed roles (403).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!roles || roles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!user) {
      throw new UnauthorizedException('Missing access token');
    }
    if (!roles.includes(user.role)) {
      throw new ForbiddenException(
        `Access denied: requires role ${roles.join(' or ')}`,
      );
    }
    return true;
  }
}
