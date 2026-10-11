import { DataSource, EntityManager } from 'typeorm';
import { hashPassword } from './auth/password';
import { BookingSeat } from './bookings/entities/booking-seat.entity';
import { Booking } from './bookings/entities/booking.entity';
import appDataSource from './database/data-source';
import { Film } from './films/entities/film.entity';
import { Hall } from './halls/entities/hall.entity';
import { validateEnv } from './config/env.validation';
import { Showing } from './showings/entities/showing.entity';
import { User } from './users/entities/user.entity';
import { Role } from './users/role.enum';

/**
 * Seed data for manual checks: the first administrator (email and password
 * from ADMIN_EMAIL / ADMIN_PASSWORD), 2 films, 2 halls, 4 showings on
 * different dates and 1 booking (owned by the administrator).
 *
 * Run with `npm run seed` on a database with applied migrations.
 * Idempotent: every record is looked up by its natural key first
 * (admin email, film title + year, hall name, film + hall + start time,
 * booked seats),
 * so a repeated run creates no duplicates.
 */
const FILMS = [
  { title: 'Interstellar', durationMinutes: 169, releaseYear: 2014 },
  { title: 'Dune: Part Two', durationMinutes: 166, releaseYear: 2024 },
];

const HALLS = [
  { name: 'Red Hall', rows: 5, seatsPerRow: 8 },
  { name: 'Blue Hall', rows: 3, seatsPerRow: 5 },
];

/** film/hall are indexes in FILMS/HALLS; prices are in kopecks. */
const SHOWINGS = [
  { film: 0, hall: 0, startsAt: '2030-01-15T18:00:00.000Z', price: 15000 },
  { film: 1, hall: 1, startsAt: '2030-01-16T19:30:00.000Z', price: 18000 },
  { film: 0, hall: 1, startsAt: '2030-01-17T12:00:00.000Z', price: 12000 },
  { film: 1, hall: 0, startsAt: '2030-01-18T21:00:00.000Z', price: 20000 },
];

/** One booking of two seats for the first showing. */
const BOOKING = {
  showing: 0,
  seats: [
    { row: 1, seat: 1 },
    { row: 1, seat: 2 },
  ],
};

export interface SeedAdmin {
  email: string;
  password: string;
  /** bcrypt cost factor (BCRYPT_SALT_ROUNDS). */
  saltRounds: number;
}

export interface SeedResult {
  users: number;
  films: number;
  halls: number;
  showings: number;
  bookings: number;
}

/**
 * Creates the administrator. If a user with this email already exists, it is
 * made an administrator; its password is NOT changed (a repeated seed must not
 * overwrite a password changed later).
 */
async function ensureAdmin(
  manager: EntityManager,
  admin: SeedAdmin,
): Promise<User> {
  const email = admin.email.trim().toLowerCase();
  const existing = await manager.findOneBy(User, { email });
  if (existing) {
    if (existing.role !== Role.Admin) {
      await manager.update(User, { id: existing.id }, { role: Role.Admin });
      existing.role = Role.Admin;
    }
    return existing;
  }
  return manager.save(
    manager.create(User, {
      email,
      passwordHash: await hashPassword(admin.password, admin.saltRounds),
      role: Role.Admin,
    }),
  );
}

async function findOrCreateFilm(
  manager: EntityManager,
  data: (typeof FILMS)[number],
): Promise<Film> {
  const existing = await manager.findOneBy(Film, {
    title: data.title,
    releaseYear: data.releaseYear,
  });
  return existing ?? manager.save(manager.create(Film, data));
}

async function findOrCreateHall(
  manager: EntityManager,
  data: (typeof HALLS)[number],
): Promise<Hall> {
  const existing = await manager
    .createQueryBuilder(Hall, 'hall')
    .where('LOWER(hall.name) = LOWER(:name)', { name: data.name })
    .getOne();
  return existing ?? manager.save(manager.create(Hall, data));
}

async function findOrCreateShowing(
  manager: EntityManager,
  data: { filmId: string; hallId: string; startsAt: Date; price: number },
): Promise<Showing> {
  const existing = await manager.findOneBy(Showing, {
    filmId: data.filmId,
    hallId: data.hallId,
    startsAt: data.startsAt,
  });
  return existing ?? manager.save(manager.create(Showing, data));
}

/** Seeds the database behind `dataSource` (must be initialized). */
export async function seed(
  dataSource: DataSource,
  admin: SeedAdmin,
): Promise<SeedResult> {
  return dataSource.transaction(async (manager) => {
    const adminUser = await ensureAdmin(manager, admin);

    const films: Film[] = [];
    for (const data of FILMS) films.push(await findOrCreateFilm(manager, data));

    const halls: Hall[] = [];
    for (const data of HALLS) halls.push(await findOrCreateHall(manager, data));

    const showings: Showing[] = [];
    for (const data of SHOWINGS) {
      showings.push(
        await findOrCreateShowing(manager, {
          filmId: films[data.film].id,
          hallId: halls[data.hall].id,
          startsAt: new Date(data.startsAt),
          price: data.price,
        }),
      );
    }

    const showing = showings[BOOKING.showing];
    const alreadyBooked = await manager.existsBy(
      BookingSeat,
      BOOKING.seats.map((s) => ({ showingId: showing.id, ...s })),
    );
    if (!alreadyBooked) {
      const booking = await manager.save(
        manager.create(Booking, {
          showingId: showing.id,
          userId: adminUser.id,
          totalPrice: showing.price * BOOKING.seats.length,
        }),
      );
      await manager.save(
        BOOKING.seats.map((s) =>
          manager.create(BookingSeat, {
            bookingId: booking.id,
            showingId: showing.id,
            ...s,
          }),
        ),
      );
    }

    return {
      users: await manager.count(User),
      films: await manager.count(Film),
      halls: await manager.count(Hall),
      showings: await manager.count(Showing),
      bookings: await manager.count(Booking),
    };
  });
}

async function main(): Promise<void> {
  // .env is already loaded by data-source.ts; validated with the same rules.
  const env = validateEnv(process.env);
  if (!env.ADMIN_EMAIL || !env.ADMIN_PASSWORD) {
    throw new Error(
      'Set ADMIN_EMAIL and ADMIN_PASSWORD in .env: the seed creates the first administrator from them',
    );
  }
  await appDataSource.initialize();
  try {
    const result = await seed(appDataSource, {
      email: env.ADMIN_EMAIL,
      password: env.ADMIN_PASSWORD,
      saltRounds: env.BCRYPT_SALT_ROUNDS,
    });
    console.log(
      `Seed complete. Administrator: ${env.ADMIN_EMAIL.trim().toLowerCase()}. ` +
        `Rows in the database: ${result.users} users, ${result.films} films, ` +
        `${result.halls} halls, ${result.showings} showings, ${result.bookings} bookings.`,
    );
  } finally {
    await appDataSource.destroy();
  }
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('Seed failed:', error);
    process.exit(1);
  });
}
