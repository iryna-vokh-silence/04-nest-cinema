/** User roles. The role decides which routes are available. */
export enum Role {
  User = 'user',
  Admin = 'admin',
}

export const ROLES = Object.values(Role);
