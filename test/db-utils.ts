import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';

/** Empties every application table (the schema itself stays). */
export async function truncateAll(dataSource: DataSource): Promise<void> {
  await dataSource.query(
    'TRUNCATE TABLE "booking_seats", "bookings", "showings", "halls", "films", "refresh_tokens", "users" RESTART IDENTITY CASCADE',
  );
}

export const TEST_PASSWORD = 'password123';

export interface TestUser {
  id: string;
  email: string;
  role: 'user' | 'admin';
  accessToken: string;
  refreshToken: string;
}

/** supertest methods that send "Authorization: Bearer <token>". */
export function as(http: App, token: string) {
  const auth = { Authorization: `Bearer ${token}` };
  return {
    get: (url: string) => request(http).get(url).set(auth),
    post: (url: string) => request(http).post(url).set(auth),
    patch: (url: string) => request(http).patch(url).set(auth),
    delete: (url: string) => request(http).delete(url).set(auth),
  };
}

/**
 * Registers a user through the API, makes it an administrator directly in the
 * database if needed (the API never grants the admin role) and logs in.
 */
export async function createUser(
  http: App,
  db: DataSource,
  email: string,
  role: 'user' | 'admin' = 'user',
): Promise<TestUser> {
  const registered = await request(http)
    .post('/auth/register')
    .send({ email, password: TEST_PASSWORD })
    .expect(201);
  const { id } = registered.body as { id: string };
  if (role === 'admin') {
    await db.query(`UPDATE "users" SET "role" = 'admin' WHERE "id" = $1`, [id]);
  }
  const login = await request(http)
    .post('/auth/login')
    .send({ email, password: TEST_PASSWORD })
    .expect(200);
  const tokens = login.body as { accessToken: string; refreshToken: string };
  return { id, email, role, ...tokens };
}
