import { applyDecorators } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '../../common/dto/error-response.dto';
import { Role } from '../../users/role.enum';
import { Roles } from './roles.decorator';

/**
 * Protected route: sets the allowed roles (if any) and documents it in Swagger
 * (Bearer scheme, 401, and 403 when a role is required).
 *
 *   @Auth()            — any logged-in user
 *   @Auth(Role.Admin)  — administrators only
 *
 * The token itself is checked by the global JwtAuthGuard, the role by RolesGuard.
 */
export function Auth(...roles: Role[]) {
  const decorators = [
    ApiBearerAuth(),
    ApiUnauthorizedResponse({
      type: ErrorResponseDto,
      description:
        'No access token, malformed Authorization header, invalid signature or expired token',
    }),
  ];
  if (roles.length > 0) {
    decorators.push(
      Roles(...roles),
      ApiForbiddenResponse({
        type: ErrorResponseDto,
        description: `Requires role: ${roles.join(', ')}`,
      }),
    );
  }
  return applyDecorators(...decorators);
}
