import * as bcrypt from 'bcrypt';

/** bcrypt hash of a password (the salt is generated and stored inside the hash). */
export function hashPassword(
  password: string,
  rounds: number,
): Promise<string> {
  return bcrypt.hash(password, rounds);
}

/** Compares a password with a bcrypt hash in constant time. */
export function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return bcrypt.compare(password, passwordHash);
}

/**
 * Synchronous variant, used once at startup to build a dummy hash: login
 * compares the password with it when the email is unknown, so "no such user"
 * takes as long as "wrong password" and the response time does not reveal
 * which emails are registered.
 */
export function hashPasswordSync(password: string, rounds: number): string {
  return bcrypt.hashSync(password, rounds);
}
