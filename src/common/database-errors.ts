import { QueryFailedError } from 'typeorm';

/** PostgreSQL error codes used by the services. */
export const PG_UNIQUE_VIOLATION = '23505';
export const PG_FOREIGN_KEY_VIOLATION = '23503';

/** True if `error` is a database error with the given PostgreSQL code. */
export function isDbError(error: unknown, code: string): boolean {
  if (!(error instanceof QueryFailedError)) return false;
  const driverError = error.driverError as { code?: string } | undefined;
  return driverError?.code === code;
}
