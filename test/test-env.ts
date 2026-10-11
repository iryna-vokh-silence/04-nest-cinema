import { config as loadDotenv } from 'dotenv';

/**
 * The e2e tests run against a SEPARATE database (DB_TEST_NAME, default
 * "cinema_test"), never the development one: they drop and recreate its schema.
 * Everything else (host, port, user, password, JWT settings) comes from .env
 * as usual. Variables already set in the shell win over .env.
 */
export function applyTestEnv(): void {
  loadDotenv({ quiet: true });
  process.env.DB_NAME = process.env.DB_TEST_NAME || 'cinema_test';
  process.env.DB_LOGGING = 'false';
  // The cheapest bcrypt cost: tests hash many passwords.
  process.env.BCRYPT_SALT_ROUNDS = '4';
}

applyTestEnv();
