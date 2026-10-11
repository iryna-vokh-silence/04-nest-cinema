import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthenticatedRequest, AuthenticatedUser } from '../authenticated-user';

/**
 * Parameter decorator: the user that JwtAuthGuard put into the request.
 *   @CurrentUser() user: AuthenticatedUser
 *   @CurrentUser('id') userId: string
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    if (!user) {
      // Only possible on a @Public() route — a programming error.
      throw new UnauthorizedException('Missing access token');
    }
    return field ? user[field] : user;
  },
);
