import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createApp } from './app-factory';
import {
  as,
  createUser,
  TEST_PASSWORD,
  TestUser,
  truncateAll,
} from './db-utils';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const FUTURE = '2030-01-15T18:00:00.000Z';

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
}
interface Tokens {
  accessToken: string;
  refreshToken: string;
}
interface IdBody {
  id: string;
}

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

describe('Authentication, roles and ownership (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let http: App;
  let db: DataSource;
  let jwt: JwtService;

  let admin: TestUser;
  let alice: TestUser;
  let bob: TestUser;

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    db = app.get(DataSource);
    jwt = app.get(JwtService);
  });

  beforeEach(async () => {
    await truncateAll(db);
    admin = await createUser(http, db, 'admin@test.local', 'admin');
    alice = await createUser(http, db, 'alice@test.local');
    bob = await createUser(http, db, 'bob@test.local');
  });

  afterAll(async () => {
    await app.close();
  });

  async function count(table: string, where = 'TRUE', params: unknown[] = []) {
    const rows: { count: string }[] = await db.query(
      `SELECT COUNT(*)::text AS count FROM "${table}" WHERE ${where}`,
      params,
    );
    return Number(rows[0].count);
  }

  /** Film + hall (3×5) + showing, created by the administrator. */
  async function setupShowing(): Promise<{
    filmId: string;
    hallId: string;
    showingId: string;
  }> {
    const api = as(http, admin.accessToken);
    const film = await api
      .post('/films')
      .send({ title: 'Interstellar', durationMinutes: 169, releaseYear: 2014 })
      .expect(201);
    const hall = await api
      .post('/halls')
      .send({ name: 'Red Hall', rows: 3, seatsPerRow: 5 })
      .expect(201);
    const filmId = (film.body as IdBody).id;
    const hallId = (hall.body as IdBody).id;
    const showing = await api
      .post('/showings')
      .send({ filmId, hallId, startsAt: FUTURE, price: 15000 })
      .expect(201);
    return { filmId, hallId, showingId: (showing.body as IdBody).id };
  }

  async function book(
    user: TestUser,
    showingId: string,
    seats: { row: number; seat: number }[],
  ): Promise<string> {
    const res = await as(http, user.accessToken)
      .post(`/showings/${showingId}/bookings`)
      .send({ seats })
      .expect(201);
    return (res.body as IdBody).id;
  }

  // ---------------------------------------------------------------- register

  describe('POST /auth/register', () => {
    it('creates a user with role "user"; no password or hash in the response', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({ email: '  New.User@Example.COM ', password: 'secret-pass' })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        email: 'new.user@example.com',
        role: 'user',
        createdAt: expect.any(String) as string,
      });
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/password|hash|secret-pass/i);
    });

    it('ignores a role sent in the body', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({
          email: 'evil@test.local',
          password: 'password1',
          role: 'admin',
        })
        .expect(201);
      expect((res.body as { role: string }).role).toBe('user');
      const rows: { role: string }[] = await db.query(
        `SELECT role FROM users WHERE email = 'evil@test.local'`,
      );
      expect(rows[0].role).toBe('user');
    });

    it('stores only a bcrypt hash of the password', async () => {
      await request(http)
        .post('/auth/register')
        .send({ email: 'hash@test.local', password: 'my-password-1' })
        .expect(201);
      const rows: { password_hash: string }[] = await db.query(
        `SELECT password_hash FROM users WHERE email = 'hash@test.local'`,
      );
      const hash = rows[0].password_hash;
      expect(hash).toMatch(/^\$2[aby]\$\d{2}\$.{53}$/);
      expect(hash).not.toContain('my-password-1');
      expect(await bcrypt.compare('my-password-1', hash)).toBe(true);
    });

    it('returns 400 for an invalid email or a short password', async () => {
      const cases: [Record<string, unknown>, string][] = [
        [{ email: 'not-an-email', password: 'password1' }, 'email'],
        [{ email: 'a@b', password: 'password1' }, 'email'],
        [{ email: 'x@test.local', password: '1234567' }, 'password'],
        [{ email: 'x@test.local' }, 'password'],
        [{ password: 'password1' }, 'email'],
        [{ email: 'x@test.local', password: 12345678 }, 'password'],
      ];
      for (const [body, field] of cases) {
        const res = await request(http)
          .post('/auth/register')
          .send(body)
          .expect(400);
        expect(JSON.stringify((res.body as ErrorBody).message)).toContain(
          field,
        );
      }
      // exactly 8 characters is enough
      await request(http)
        .post('/auth/register')
        .send({ email: 'eight@test.local', password: '12345678' })
        .expect(201);
    });

    it('returns 409 for an email that is already registered (case-insensitive)', async () => {
      const res = await request(http)
        .post('/auth/register')
        .send({ email: 'alice@test.local', password: 'password1' })
        .expect(409);
      expect((res.body as ErrorBody).message).toBe(
        'User with this email already exists',
      );
      await request(http)
        .post('/auth/register')
        .send({ email: ' ALICE@test.local', password: 'password1' })
        .expect(409);
      expect(await count('users', `email = 'alice@test.local'`)).toBe(1);
    });
  });

  // ------------------------------------------------------------------- login

  describe('POST /auth/login', () => {
    it('returns an access JWT { sub, role } and an opaque refresh token', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: 'Alice@Test.local', password: TEST_PASSWORD })
        .expect(200);
      const tokens = res.body as Tokens;
      expect(Object.keys(tokens).sort()).toEqual([
        'accessToken',
        'refreshToken',
      ]);
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      // the refresh token is a random string, not a JWT
      expect(tokens.refreshToken).not.toContain('.');
      expect(tokens.refreshToken.length).toBeGreaterThanOrEqual(43);

      const payload = jwt.decode<{
        sub: string;
        role: string;
        iat: number;
        exp: number;
      }>(tokens.accessToken);
      expect(payload).toMatchObject({ sub: alice.id, role: 'user' });
      // lives minutes (JWT_ACCESS_TTL_MINUTES), not days
      const ttl = payload.exp - payload.iat;
      expect(ttl).toBe(Number(process.env.JWT_ACCESS_TTL_MINUTES) * 60);
      expect(ttl).toBeLessThanOrEqual(24 * 60 * 60);
    });

    it('stores the refresh token as a SHA-256 hash that expires in days', async () => {
      const res = await request(http)
        .post('/auth/login')
        .send({ email: 'bob@test.local', password: TEST_PASSWORD })
        .expect(200);
      const { refreshToken } = res.body as Tokens;
      const rows: { token_hash: string; days: string }[] = await db.query(
        `SELECT token_hash,
                round(extract(epoch FROM (expires_at - created_at)) / 86400)::text AS days
         FROM refresh_tokens WHERE token_hash = $1`,
        [sha256(refreshToken)],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].days).toBe(process.env.REFRESH_TOKEN_TTL_DAYS);
      // the token itself is not in the database
      expect(
        await count('refresh_tokens', 'token_hash = $1', [refreshToken]),
      ).toBe(0);
    });

    it('returns 401 with the same message for a wrong password and an unknown email', async () => {
      const wrongPassword = await request(http)
        .post('/auth/login')
        .send({ email: 'alice@test.local', password: 'wrong-password' })
        .expect(401);
      const unknownEmail = await request(http)
        .post('/auth/login')
        .send({ email: 'nobody@test.local', password: TEST_PASSWORD })
        .expect(401);
      const a = wrongPassword.body as ErrorBody;
      const b = unknownEmail.body as ErrorBody;
      expect(a.message).toBe('Invalid email or password');
      expect(b.message).toBe(a.message);
      expect(b.error).toBe(a.error);
    });

    it('returns 400 for a missing email or password', async () => {
      await request(http)
        .post('/auth/login')
        .send({ email: 'alice@test.local' })
        .expect(400);
      await request(http)
        .post('/auth/login')
        .send({ password: TEST_PASSWORD })
        .expect(400);
    });

    it('several logins (devices) give independent refresh tokens', async () => {
      const second = await request(http)
        .post('/auth/login')
        .send({ email: 'alice@test.local', password: TEST_PASSWORD })
        .expect(200);
      expect(await count('refresh_tokens', 'user_id = $1', [alice.id])).toBe(2);
      // both work
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(200);
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: (second.body as Tokens).refreshToken })
        .expect(200);
    });
  });

  // ----------------------------------------------------------------- refresh

  describe('POST /auth/refresh', () => {
    it('returns a new pair; the old refresh token becomes invalid (rotation)', async () => {
      const res = await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(200);
      const next = res.body as Tokens;
      expect(next.refreshToken).not.toBe(alice.refreshToken);
      expect(jwt.decode<{ sub: string }>(next.accessToken).sub).toBe(alice.id);

      // the used token is deleted from the database ...
      expect(
        await count('refresh_tokens', 'token_hash = $1', [
          sha256(alice.refreshToken),
        ]),
      ).toBe(0);
      expect(
        await count('refresh_tokens', 'token_hash = $1', [
          sha256(next.refreshToken),
        ]),
      ).toBe(1);
      // ... so it cannot be used again
      const reuse = await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(401);
      expect((reuse.body as ErrorBody).message).toBe(
        'Invalid or expired refresh token',
      );

      // the new pair works
      await as(http, next.accessToken).get('/auth/me').expect(200);
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: next.refreshToken })
        .expect(200);
    });

    it('returns 401 for an unknown or expired token, 400 without a token', async () => {
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: 'definitely-not-a-real-token' })
        .expect(401);
      // an access token is not a refresh token
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.accessToken })
        .expect(401);

      await db.query(
        `UPDATE refresh_tokens SET expires_at = now() - interval '1 second' WHERE token_hash = $1`,
        [sha256(bob.refreshToken)],
      );
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: bob.refreshToken })
        .expect(401);

      await request(http).post('/auth/refresh').send({}).expect(400);
    });

    it('is atomic: the same token used concurrently succeeds exactly once', async () => {
      const results = await Promise.all(
        Array.from({ length: 8 }, () =>
          request(http)
            .post('/auth/refresh')
            .send({ refreshToken: alice.refreshToken }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, ...Array<number>(7).fill(401)]);
      expect(await count('refresh_tokens', 'user_id = $1', [alice.id])).toBe(1);
    });

    it('takes the role from the database (a promoted user gets an admin token)', async () => {
      await db.query(`UPDATE users SET role = 'admin' WHERE id = $1`, [bob.id]);
      // the old access token still says "user"
      await as(http, bob.accessToken).get('/bookings').expect(403);
      const res = await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: bob.refreshToken })
        .expect(200);
      const { accessToken } = res.body as Tokens;
      expect(jwt.decode<{ role: string }>(accessToken).role).toBe('admin');
      await as(http, accessToken).get('/bookings').expect(200);
    });
  });

  // ------------------------------------------------------------------ logout

  describe('POST /auth/logout', () => {
    it('revokes the refresh token (204, empty body)', async () => {
      const res = await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({ refreshToken: alice.refreshToken })
        .expect(204);
      expect(res.text).toBe('');
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(401);
      // the access token itself keeps working until it expires
      await as(http, alice.accessToken).get('/auth/me').expect(200);
      // a second logout with the same token: it no longer exists
      await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({ refreshToken: alice.refreshToken })
        .expect(404);
    });

    it("returns 404 for another user's token and does not revoke it", async () => {
      const res = await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({ refreshToken: bob.refreshToken })
        .expect(404);
      expect((res.body as ErrorBody).message).toBe('Refresh token not found');
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: bob.refreshToken })
        .expect(200);
    });

    it('returns 404 for an unknown token, 400 without a token', async () => {
      await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({ refreshToken: 'unknown-token' })
        .expect(404);
      await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({})
        .expect(400);
    });

    it('revokes only the given token: other devices stay logged in', async () => {
      const other = await request(http)
        .post('/auth/login')
        .send({ email: 'alice@test.local', password: TEST_PASSWORD })
        .expect(200);
      await as(http, alice.accessToken)
        .post('/auth/logout')
        .send({ refreshToken: alice.refreshToken })
        .expect(204);
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: (other.body as Tokens).refreshToken })
        .expect(200);
    });

    it('returns 401 without an access token or with an invalid one', async () => {
      await request(http)
        .post('/auth/logout')
        .send({ refreshToken: alice.refreshToken })
        .expect(401);
      await as(http, 'abc.def.ghi')
        .post('/auth/logout')
        .send({ refreshToken: alice.refreshToken })
        .expect(401);
      // nothing was revoked
      await request(http)
        .post('/auth/refresh')
        .send({ refreshToken: alice.refreshToken })
        .expect(200);
    });
  });

  // ---------------------------------------------------------------------- me

  describe('GET /auth/me and the Authorization header', () => {
    it('returns the current user without the password hash', async () => {
      const res = await as(http, alice.accessToken).get('/auth/me').expect(200);
      expect(res.body).toMatchObject({
        id: alice.id,
        email: 'alice@test.local',
        role: 'user',
      });
      expect(res.body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.body)).not.toMatch(/password|\$2[aby]\$/);
      await as(http, admin.accessToken)
        .get('/auth/me')
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({ id: admin.id, role: 'admin' }),
        );
    });

    it('returns 401 for a missing header, a broken format, a bad signature or an expired token', async () => {
      const otherSecret = new JwtService({ secret: 'x'.repeat(40) });
      const forged = otherSecret.sign({ sub: alice.id, role: 'admin' });
      const expired = jwt.sign(
        { sub: alice.id, role: 'user' },
        { expiresIn: -10 },
      );
      const unsigned =
        Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url') +
        '.' +
        Buffer.from(JSON.stringify({ sub: alice.id, role: 'admin' })).toString(
          'base64url',
        ) +
        '.';
      const tampered = (() => {
        const [h, , s] = alice.accessToken.split('.');
        const p = Buffer.from(
          JSON.stringify({ sub: alice.id, role: 'admin', exp: 4102444800 }),
        ).toString('base64url');
        return `${h}.${p}.${s}`;
      })();
      const noRole = jwt.sign({ sub: alice.id });

      const headers: [string | undefined, string][] = [
        [undefined, 'Missing access token'],
        ['', 'Missing access token'],
        ['Bearer', 'format'],
        ['Bearer ', 'format'],
        [`Basic ${alice.accessToken}`, 'format'],
        [`Token ${alice.accessToken}`, 'format'],
        [alice.accessToken, 'format'],
        [`Bearer ${alice.accessToken} extra`, 'format'],
        ['Bearer not-a-jwt', 'format'],
        [`Bearer ${forged}`, 'Invalid or expired access token'],
        [`Bearer ${expired}`, 'Invalid or expired access token'],
        [`Bearer ${unsigned}`, 'format'],
        [`Bearer ${tampered}`, 'Invalid or expired access token'],
        [`Bearer ${noRole}`, 'Invalid or expired access token'],
        [`Bearer ${alice.refreshToken}`, 'format'],
      ];
      for (const [header, message] of headers) {
        const req = request(http).get('/auth/me');
        if (header !== undefined) req.set('Authorization', header);
        const res = await req;
        expect({ header, status: res.status }).toEqual({ header, status: 401 });
        expect((res.body as ErrorBody).message).toContain(message);
      }
    });

    it('returns 401 when the user of a valid token no longer exists', async () => {
      await db.query(`DELETE FROM users WHERE id = $1`, [bob.id]);
      await as(http, bob.accessToken).get('/auth/me').expect(401);
    });
  });

  // ------------------------------------------------------------ access rules

  describe('access rules', () => {
    it('public routes work without a token', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      for (const url of [
        '/films',
        `/films/${filmId}`,
        '/halls',
        `/halls/${hallId}`,
        '/showings',
        `/showings/${showingId}`,
        `/showings/${showingId}/seats`,
      ]) {
        const res = await request(http).get(url);
        expect({ url, status: res.status }).toEqual({ url, status: 200 });
      }
    });

    it('public routes ignore a broken token', async () => {
      await request(http)
        .get('/films')
        .set('Authorization', 'Bearer broken')
        .expect(200);
    });

    it('admin routes: 401 without a token, 403 for role user, allowed for admin', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const spareHall = await as(http, admin.accessToken)
        .post('/halls')
        .send({ name: 'Spare', rows: 1, seatsPerRow: 1 })
        .expect(201);
      const spareFilm = await as(http, admin.accessToken)
        .post('/films')
        .send({ title: 'Spare', durationMinutes: 90, releaseYear: 2000 })
        .expect(201);

      type Method = 'get' | 'post' | 'patch' | 'delete';
      const routes: [Method, string, object | undefined, number][] = [
        [
          'post',
          '/films',
          { title: 'Dune', durationMinutes: 155, releaseYear: 2021 },
          201,
        ],
        ['patch', `/films/${filmId}`, { title: 'Interstellar (IMAX)' }, 200],
        ['delete', `/films/${(spareFilm.body as IdBody).id}`, undefined, 204],
        ['post', '/halls', { name: 'Blue Hall', rows: 2, seatsPerRow: 2 }, 201],
        ['delete', `/halls/${(spareHall.body as IdBody).id}`, undefined, 204],
        ['get', '/bookings', undefined, 200],
        [
          'post',
          '/showings',
          { filmId, hallId, startsAt: '2030-02-01T10:00:00Z', price: 100 },
          201,
        ],
        ['get', `/showings/${showingId}/bookings`, undefined, 200],
      ];

      for (const [method, url, body, okStatus] of routes) {
        const anonymous = await request(http)[method](url).send(body);
        expect({ method, url, status: anonymous.status }).toEqual({
          method,
          url,
          status: 401,
        });
        const asUser = await as(http, alice.accessToken)
          [method](url)
          .send(body);
        expect({ method, url, status: asUser.status }).toEqual({
          method,
          url,
          status: 403,
        });
        expect((asUser.body as ErrorBody).message).toBe(
          'Access denied: requires role admin',
        );
        const asAdmin = await as(http, admin.accessToken)
          [method](url)
          .send(body);
        expect({ method, url, status: asAdmin.status }).toEqual({
          method,
          url,
          status: okStatus,
        });
      }
      // a forbidden request changed nothing
      expect(await count('films', `title = 'Dune'`)).toBe(1);
    });

    it('routes for any logged-in user: 401 without a token', async () => {
      const { showingId } = await setupShowing();
      const bookingId = await book(alice, showingId, [{ row: 1, seat: 1 }]);
      const cases: [string, string, object | undefined][] = [
        [
          'post',
          `/showings/${showingId}/bookings`,
          { seats: [{ row: 2, seat: 2 }] },
        ],
        ['delete', `/bookings/${bookingId}`, undefined],
        ['get', '/bookings/my', undefined],
        ['post', '/auth/logout', { refreshToken: alice.refreshToken }],
        ['get', '/auth/me', undefined],
      ];
      for (const [method, url, body] of cases) {
        const res = await request(http)[method as 'get'](url).send(body);
        expect({ method, url, status: res.status }).toEqual({
          method,
          url,
          status: 401,
        });
      }
      expect(await count('bookings')).toBe(1);
    });
  });

  // --------------------------------------------------------------- ownership

  describe('bookings and their owners', () => {
    it('a booking belongs to the user from the token; userId in the body is ignored', async () => {
      const { showingId } = await setupShowing();
      const res = await as(http, alice.accessToken)
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }], userId: bob.id })
        .expect(201);
      expect(res.body).toMatchObject({ userId: alice.id, totalPrice: 15000 });
      const rows: { user_id: string }[] = await db.query(
        `SELECT user_id FROM bookings WHERE id = $1`,
        [(res.body as IdBody).id],
      );
      expect(rows[0].user_id).toBe(alice.id);
    });

    it('GET /bookings/my returns only own bookings, with showing data', async () => {
      const { showingId } = await setupShowing();
      const mine = await book(alice, showingId, [
        { row: 1, seat: 2 },
        { row: 1, seat: 1 },
      ]);
      await book(bob, showingId, [{ row: 2, seat: 1 }]);

      const res = await as(http, alice.accessToken)
        .get('/bookings/my')
        .expect(200);
      expect(res.body).toEqual([
        {
          id: mine,
          showingId,
          userId: alice.id,
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 2 },
          ],
          totalPrice: 30000,
          showing: {
            id: showingId,
            filmTitle: 'Interstellar',
            hallName: 'Red Hall',
            startsAt: FUTURE,
            price: 15000,
          },
        },
      ]);
      await as(http, admin.accessToken)
        .get('/bookings/my')
        .expect(200)
        .expect((r) => expect(r.body).toEqual([]));
      // the administrator sees everybody's bookings with their owners
      const all = await as(http, admin.accessToken)
        .get('/bookings')
        .expect(200);
      expect(
        (all.body as { userId: string }[]).map((b) => b.userId).sort(),
      ).toEqual([alice.id, bob.id].sort());
    });

    it("a user cannot cancel another user's booking (403), nothing is deleted", async () => {
      const { showingId } = await setupShowing();
      const alicesBooking = await book(alice, showingId, [{ row: 1, seat: 1 }]);
      const res = await as(http, bob.accessToken)
        .delete(`/bookings/${alicesBooking}`)
        .expect(403);
      expect((res.body as ErrorBody).message).toBe(
        'You can cancel only your own bookings',
      );
      expect(await count('bookings')).toBe(1);
      expect(await count('booking_seats')).toBe(1);
    });

    it('the owner cancels own booking (204); then 404', async () => {
      const { showingId } = await setupShowing();
      const id = await book(alice, showingId, [{ row: 1, seat: 1 }]);
      await as(http, alice.accessToken).delete(`/bookings/${id}`).expect(204);
      await as(http, alice.accessToken).delete(`/bookings/${id}`).expect(404);
      await as(http, alice.accessToken)
        .delete(`/bookings/${MISSING_ID}`)
        .expect(404);
      expect(await count('booking_seats')).toBe(0);
    });

    it('an administrator cancels any booking', async () => {
      const { showingId } = await setupShowing();
      const id = await book(bob, showingId, [{ row: 3, seat: 5 }]);
      await as(http, admin.accessToken).delete(`/bookings/${id}`).expect(204);
      expect(await count('bookings')).toBe(0);
    });
  });

  // ----------------------------------------------------------------- swagger

  describe('Swagger', () => {
    interface Operation {
      security?: Record<string, string[]>[];
      responses: Record<string, unknown>;
    }

    it('describes the Bearer scheme, 401 for protected routes and 403 where access can be denied', async () => {
      const res = await request(http).get('/docs-json').expect(200);
      const doc = res.body as {
        paths: Record<string, Record<string, Operation>>;
        components: {
          securitySchemes: Record<string, { type: string; scheme: string }>;
          schemas: Record<string, { properties: Record<string, unknown> }>;
        };
      };
      expect(doc.components.securitySchemes.bearer).toMatchObject({
        type: 'http',
        scheme: 'bearer',
      });

      const publicOps = new Set([
        'post /auth/register',
        'post /auth/login',
        'post /auth/refresh',
        'get /films',
        'get /films/{id}',
        'get /halls',
        'get /halls/{id}',
        'get /showings',
        'get /showings/{id}',
        'get /showings/{id}/seats',
      ]);
      const forbiddenOps = new Set([
        'post /films',
        'patch /films/{id}',
        'delete /films/{id}',
        'post /halls',
        'delete /halls/{id}',
        'get /bookings',
        'post /showings',
        'get /showings/{id}/bookings',
        'delete /bookings/{id}',
      ]);

      const seen = new Set<string>();
      for (const [path, ops] of Object.entries(doc.paths)) {
        for (const [method, op] of Object.entries(ops)) {
          const key = `${method} ${path}`;
          seen.add(key);
          if (publicOps.has(key)) {
            expect({ key, security: op.security }).toEqual({
              key,
              security: undefined,
            });
            continue;
          }
          expect({ key, security: op.security }).toEqual({
            key,
            security: [{ bearer: [] }],
          });
          expect({ key, has401: '401' in op.responses }).toEqual({
            key,
            has401: true,
          });
          expect({ key, has403: '403' in op.responses }).toEqual({
            key,
            has403: forbiddenOps.has(key),
          });
        }
      }
      for (const key of [...publicOps, ...forbiddenOps]) {
        expect(seen).toContain(key);
      }
      expect(seen).toContain('get /bookings/my');
      expect(seen).toContain('get /auth/me');
      expect(seen).toContain('post /auth/logout');

      expect(
        Object.keys(doc.components.schemas.User.properties).sort(),
      ).toEqual(['createdAt', 'email', 'id', 'role']);
      expect(
        Object.keys(doc.components.schemas.TokensDto.properties).sort(),
      ).toEqual(['accessToken', 'refreshToken']);
    });
  });
});
