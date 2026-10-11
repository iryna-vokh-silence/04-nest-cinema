import { DataSource } from 'typeorm';
import { validateEnv } from '../src/config/env.validation';
import { buildDataSourceOptions } from '../src/database/database.options';
import { applyTestEnv } from './test-env';

/**
 * Runs once before all e2e tests: wipes the test database and builds the
 * schema from scratch with the migrations (exactly like `npm run migration:run`).
 */
export default async function globalSetup(): Promise<void> {
  applyTestEnv();
  const dataSource = new DataSource(testDataSourceOptions());
  await dataSource.initialize();
  try {
    await dataSource.dropDatabase();
    await dataSource.runMigrations({ transaction: 'each' });
  } finally {
    await dataSource.destroy();
  }
}

export function testDataSourceOptions() {
  const env = validateEnv(process.env);
  return buildDataSourceOptions({
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
  });
}
