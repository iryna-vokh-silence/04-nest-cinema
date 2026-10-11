import { createHash, randomBytes } from 'node:crypto';

/**
 * A refresh token is an opaque random string (256 bits), NOT a JWT: the server
 * looks it up in the database, so it does not need to carry any data.
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Deterministic SHA-256 hash (hex) of a refresh token. Only this hash is
 * stored; being deterministic, it can be found with a plain WHERE (bcrypt
 * would give a different hash every time). The token itself has 256 bits of
 * entropy, so a fast hash is enough here, unlike for passwords.
 */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}
