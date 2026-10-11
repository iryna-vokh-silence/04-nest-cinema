import { Request } from 'express';
import { Role } from '../users/role.enum';

/** User data taken from a verified access token. */
export interface AuthenticatedUser {
  id: string;
  role: Role;
}

/** Payload of an access token: user id (sub) and role. */
export interface AccessTokenPayload {
  sub: string;
  role: Role;
}

/** Request after JwtAuthGuard: the guard puts the user here. */
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}
