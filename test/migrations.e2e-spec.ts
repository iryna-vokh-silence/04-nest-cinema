import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { seed, SeedAdmin } from '../src/seed';
import { truncateAll } from './db-utils';
import { testDataSourceOptions } from './global-setup';

interface ColumnRow {
  table_name: string;
  column_name: string;
  data_type: string;
  is_nullable: 'YES' | 'NO';
  column_default: string | null;
}

const APP_TABLES = [
  'booking_seats',
  'bookings',
  'films',
  'halls',
  'refresh_tokens',
  'showings',
  'users',
];

const ADMIN: SeedAdmin = {
  email: 'Admin@Cinema.Test',
  password: 'admin-password',
  saltRounds: 4,
};

describe('Database schema, migrations and seed (e2e, PostgreSQL)', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = new DataSource(testDataSourceOptions());
    await db.initialize();
  });

  afterAll(async () => {
    await db.destroy();
  });

  async function appTables(): Promise<string[]> {
    const rows: { table_name: string }[] = await db.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name <> 'migrations'
       ORDER BY table_name`,
    );
    return rows.map((r) => r.table_name);
  }

  it('creates every table from an empty database with migrations only', async () => {
    expect(await appTables()).toEqual(APP_TABLES);
    expect(await db.showMigrations()).toBe(false); // nothing pending
  });

  it('has the column types and constraints from the task description', async () => {
    const rows: ColumnRow[] = await db.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default
       FROM information_schema.columns WHERE table_schema = 'public'`,
    );
    const col = (table: string, column: string) => {
      const found = rows.find(
        (r) => r.table_name === table && r.column_name === column,
      );
      if (!found) throw new Error(`${table}.${column} is missing`);
      return found;
    };
    const expected: [string, string, string][] = [
      ['films', 'title', 'character varying'],
      ['films', 'duration_minutes', 'integer'],
      ['films', 'release_year', 'integer'],
      ['halls', 'name', 'character varying'],
      ['halls', 'rows', 'integer'],
      ['halls', 'seats_per_row', 'integer'],
      ['showings', 'film_id', 'uuid'],
      ['showings', 'hall_id', 'uuid'],
      ['showings', 'starts_at', 'timestamp with time zone'],
      ['showings', 'price', 'integer'],
      ['bookings', 'showing_id', 'uuid'],
      ['bookings', 'total_price', 'integer'],
      ['bookings', 'created_at', 'timestamp with time zone'],
      ['booking_seats', 'booking_id', 'uuid'],
      ['booking_seats', 'showing_id', 'uuid'],
      ['booking_seats', 'row', 'integer'],
      ['booking_seats', 'seat', 'integer'],
      // HW4
      ['users', 'email', 'character varying'],
      ['users', 'password_hash', 'character varying'],
      ['users', 'role', 'character varying'],
      ['users', 'created_at', 'timestamp with time zone'],
      ['refresh_tokens', 'user_id', 'uuid'],
      ['refresh_tokens', 'token_hash', 'character varying'],
      ['refresh_tokens', 'expires_at', 'timestamp with time zone'],
      ['refresh_tokens', 'created_at', 'timestamp with time zone'],
      ['bookings', 'user_id', 'uuid'],
    ];
    for (const [table, column, type] of expected) {
      expect({ table, column, ...col(table, column) }).toMatchObject({
        data_type: type,
        is_nullable: 'NO',
      });
    }
    for (const table of APP_TABLES) {
      expect(col(table, 'id')).toMatchObject({
        data_type: 'uuid',
        is_nullable: 'NO',
        column_default: 'gen_random_uuid()',
      });
    }
    expect(col('bookings', 'created_at').column_default).toBe('now()');
    expect(col('users', 'created_at').column_default).toBe('now()');
    expect(col('refresh_tokens', 'created_at').column_default).toBe('now()');
    expect(col('users', 'role').column_default).toBe(
      "'user'::character varying",
    );
  });

  it('has the unique index on booking_seats (showing_id, row, seat) and unique hall names', async () => {
    const indexes: { indexname: string; indexdef: string }[] = await db.query(
      `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public'`,
    );
    const def = (name: string) =>
      indexes.find((i) => i.indexname === name)?.indexdef;
    expect(def('UQ_booking_seats_showing_row_seat')).toMatch(
      /CREATE UNIQUE INDEX .* ON public\.booking_seats USING btree \(showing_id, "?row"?, seat\)/,
    );
    expect(def('UQ_halls_name')).toMatch(/UNIQUE INDEX .*\(name\)/);
    expect(def('UQ_halls_name_lower')).toMatch(/UNIQUE INDEX .*lower/);
    expect(def('UQ_users_email')).toMatch(/UNIQUE INDEX .*\(email\)/);
    expect(def('UQ_refresh_tokens_token_hash')).toMatch(
      /UNIQUE INDEX .*\(token_hash\)/,
    );
  });

  it('allows only the roles user and admin', async () => {
    await truncateAll(db);
    await expect(
      db.query(
        `INSERT INTO users (email, password_hash, role) VALUES ('x@y.z', 'h', 'root')`,
      ),
    ).rejects.toMatchObject({ driverError: { code: '23514' } });
    const rows: { role: string }[] = await db.query(
      `INSERT INTO users (email, password_hash) VALUES ('x@y.z', 'h') RETURNING role`,
    );
    expect(rows[0].role).toBe('user');
    await expect(
      db.query(
        `INSERT INTO users (email, password_hash) VALUES ('x@y.z', 'h2')`,
      ),
    ).rejects.toMatchObject({ driverError: { code: '23505' } });
    await truncateAll(db);
  });

  it('has foreign keys with the right delete rules', async () => {
    const fks: { name: string; rule: string; ref: string }[] = await db.query(
      `SELECT c.conname AS name, c.confdeltype AS rule, c.confrelid::regclass::text AS ref
       FROM pg_constraint c WHERE c.contype = 'f' ORDER BY c.conname`,
    );
    // r = RESTRICT, c = CASCADE
    expect(fks).toEqual([
      { name: 'FK_booking_seats_booking_id', rule: 'c', ref: 'bookings' },
      { name: 'FK_booking_seats_showing_id', rule: 'c', ref: 'showings' },
      { name: 'FK_bookings_showing_id', rule: 'c', ref: 'showings' },
      { name: 'FK_bookings_user_id', rule: 'r', ref: 'users' },
      { name: 'FK_refresh_tokens_user_id', rule: 'c', ref: 'users' },
      { name: 'FK_showings_film_id', rule: 'r', ref: 'films' },
      { name: 'FK_showings_hall_id', rule: 'r', ref: 'halls' },
    ]);
  });

  it('the database itself rejects a second row for the same seat of a showing', async () => {
    await truncateAll(db);
    const insertId = async (sql: string, params: unknown[] = []) => {
      const rows = await db.query<{ id: string }[]>(sql, params);
      return rows[0].id;
    };
    const filmId = await insertId(
      `INSERT INTO films (title, duration_minutes, release_year) VALUES ('F', 90, 2020) RETURNING id`,
    );
    const hallId = await insertId(
      `INSERT INTO halls (name, rows, seats_per_row) VALUES ('H', 2, 2) RETURNING id`,
    );
    const showingId = await insertId(
      `INSERT INTO showings (film_id, hall_id, starts_at, price) VALUES ($1, $2, now() + interval '1 day', 100) RETURNING id`,
      [filmId, hallId],
    );
    const userId = await insertId(
      `INSERT INTO users (email, password_hash) VALUES ('u@test.local', 'h') RETURNING id`,
    );
    const booking = () =>
      insertId(
        `INSERT INTO bookings (showing_id, user_id, total_price) VALUES ($1, $2, 100) RETURNING id`,
        [showingId, userId],
      );
    const b1 = await booking();
    const b2 = await booking();
    const insertSeat = (bookingId: string) =>
      db.query(
        `INSERT INTO booking_seats (booking_id, showing_id, "row", seat) VALUES ($1, $2, 1, 1)`,
        [bookingId, showingId],
      );
    await insertSeat(b1);
    await expect(insertSeat(b2)).rejects.toMatchObject({
      driverError: { code: '23505' },
    });
    await truncateAll(db);
  });

  it('migrations are reversible: down() returns an empty database, up() rebuilds it', async () => {
    for (let i = 0; i < db.migrations.length; i++) {
      await db.undoLastMigration({ transaction: 'each' });
    }
    expect(await appTables()).toEqual([]);
    expect(await db.showMigrations()).toBe(true);

    await db.runMigrations({ transaction: 'each' });
    expect(await appTables()).toEqual(APP_TABLES);
    expect(await db.showMigrations()).toBe(false);
  });

  it('AddUserIdToBookings removes old bookings (they have no owner) and is reversible', async () => {
    await truncateAll(db);
    await db.undoLastMigration({ transaction: 'each' });
    const before: { column_name: string }[] = await db.query(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'bookings' AND column_name = 'user_id'`,
    );
    expect(before).toEqual([]);

    // A booking from HW2 times, without an owner
    const [{ id: filmId }] = await db.query<{ id: string }[]>(
      `INSERT INTO films (title, duration_minutes, release_year) VALUES ('F', 90, 2020) RETURNING id`,
    );
    const [{ id: hallId }] = await db.query<{ id: string }[]>(
      `INSERT INTO halls (name, rows, seats_per_row) VALUES ('H', 2, 2) RETURNING id`,
    );
    const [{ id: showingId }] = await db.query<{ id: string }[]>(
      `INSERT INTO showings (film_id, hall_id, starts_at, price) VALUES ($1, $2, now() + interval '1 day', 100) RETURNING id`,
      [filmId, hallId],
    );
    const [{ id: bookingId }] = await db.query<{ id: string }[]>(
      `INSERT INTO bookings (showing_id, total_price) VALUES ($1, 100) RETURNING id`,
      [showingId],
    );
    await db.query(
      `INSERT INTO booking_seats (booking_id, showing_id, "row", seat) VALUES ($1, $2, 1, 1)`,
      [bookingId, showingId],
    );

    await db.runMigrations({ transaction: 'each' });
    const counts: { b: string; s: string }[] = await db.query(
      `SELECT (SELECT COUNT(*) FROM bookings)::text AS b, (SELECT COUNT(*) FROM booking_seats)::text AS s`,
    );
    expect(counts[0]).toEqual({ b: '0', s: '0' });
    const after: { is_nullable: string }[] = await db.query(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'bookings' AND column_name = 'user_id'`,
    );
    expect(after).toEqual([{ is_nullable: 'NO' }]);
    await truncateAll(db);
  });

  it('seed fills an empty database and does not create duplicates when run again', async () => {
    await truncateAll(db);
    const first = await seed(db, ADMIN);
    expect(first).toEqual({
      users: 1,
      films: 2,
      halls: 2,
      showings: 4,
      bookings: 1,
    });

    const second = await seed(db, ADMIN);
    expect(second).toEqual(first);

    // the administrator from the environment, with a bcrypt hash
    const admins: {
      id: string;
      email: string;
      role: string;
      password_hash: string;
    }[] = await db.query(`SELECT id, email, role, password_hash FROM users`);
    expect(admins).toHaveLength(1);
    expect(admins[0]).toMatchObject({
      email: 'admin@cinema.test',
      role: 'admin',
    });
    expect(await bcrypt.compare(ADMIN.password, admins[0].password_hash)).toBe(
      true,
    );
    // the seeded booking belongs to the administrator
    const owners: { user_id: string }[] = await db.query(
      `SELECT user_id FROM bookings`,
    );
    expect(owners).toEqual([{ user_id: admins[0].id }]);

    const days: { day: string }[] = await db.query(
      `SELECT DISTINCT (starts_at AT TIME ZONE 'UTC')::date::text AS day FROM showings`,
    );
    expect(days).toHaveLength(4);
    const seats: { count: string }[] = await db.query(
      `SELECT COUNT(*)::text AS count FROM booking_seats`,
    );
    expect(Number(seats[0].count)).toBeGreaterThan(0);
    await truncateAll(db);
  });
});

describe('seed: an existing user with the admin email', () => {
  let db: DataSource;

  beforeAll(async () => {
    db = new DataSource(testDataSourceOptions());
    await db.initialize();
  });

  afterAll(async () => {
    await truncateAll(db);
    await db.destroy();
  });

  it('is promoted to admin; the password is not changed', async () => {
    await truncateAll(db);
    const hash = await bcrypt.hash('old-password', 4);
    await db.query(
      `INSERT INTO users (email, password_hash) VALUES ('admin@cinema.test', $1)`,
      [hash],
    );
    await seed(db, ADMIN);
    const rows: { role: string; password_hash: string }[] = await db.query(
      `SELECT role, password_hash FROM users`,
    );
    expect(rows).toEqual([{ role: 'admin', password_hash: hash }]);
  });
});
