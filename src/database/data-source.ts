import { config as loadDotenv } from 'dotenv';
import { DataSource } from 'typeorm';
import { validateEnv } from '../config/env.validation';
import { buildDataSourceOptions } from './database.options';

/**
 * Data source for the TypeORM CLI (migrations) and the seed script.
 * The Nest application does not use this file: it gets the same options
 * through ConfigService in AppModule.
 *
 * Variables come from .env and are validated by the same class as in the app.
 */
loadDotenv({ quiet: true });
const env = validateEnv(process.env);

// Exactly one DataSource export: the TypeORM CLI refuses files with several.
const AppDataSource = new DataSource(
  buildDataSourceOptions({
    host: env.DB_HOST,
    port: env.DB_PORT,
    username: env.DB_USERNAME,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    logging: env.DB_LOGGING,
  }),
);

export default AppDataSource;
