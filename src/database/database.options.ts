import { PostgresConnectionOptions } from 'typeorm/driver/postgres/PostgresConnectionOptions';
import { BookingSeat } from '../bookings/entities/booking-seat.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Film } from '../films/entities/film.entity';
import { Hall } from '../halls/entities/hall.entity';
import { Showing } from '../showings/entities/showing.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../users/entities/user.entity';
import { InitialSchema1791700000000 } from './migrations/1791700000000-InitialSchema';
import { CreateUsersAndRefreshTokens1791800000000 } from './migrations/1791800000000-CreateUsersAndRefreshTokens';
import { AddUserIdToBookings1791800000001 } from './migrations/1791800000001-AddUserIdToBookings';

export const ENTITIES = [
  Film,
  Hall,
  Showing,
  Booking,
  BookingSeat,
  User,
  RefreshToken,
];

/** Every migration, in order. A schema change = a new migration added here. */
export const MIGRATIONS = [
  InitialSchema1791700000000,
  CreateUsersAndRefreshTokens1791800000000,
  AddUserIdToBookings1791800000001,
];

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  logging?: boolean;
}

/**
 * Connection options shared by the Nest application (TypeOrmModule) and the
 * TypeORM CLI data source (src/database/data-source.ts).
 *
 * The schema is created only by migrations: synchronize is always off and
 * migrations are applied explicitly with `npm run migration:run`.
 */
export function buildDataSourceOptions(
  db: DatabaseConfig,
): PostgresConnectionOptions {
  return {
    type: 'postgres',
    host: db.host,
    port: db.port,
    username: db.username,
    password: db.password,
    database: db.database,
    // gen_random_uuid() for uuid primary keys comes from pgcrypto.
    uuidExtension: 'pgcrypto',
    entities: ENTITIES,
    migrations: MIGRATIONS,
    migrationsTableName: 'migrations',
    synchronize: false,
    migrationsRun: false,
    logging: db.logging ?? false,
  };
}
