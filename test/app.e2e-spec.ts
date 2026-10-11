import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { createApp } from './app-factory';
import { as, createUser, TestUser, truncateAll } from './db-utils';

const MISSING_ID = '00000000-0000-4000-8000-000000000000';
const FUTURE = '2030-01-15T18:00:00.000Z';
const PAST = '2020-01-01T10:00:00.000Z';

interface IdBody {
  id: string;
}
interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  path: string;
  timestamp: string;
}
interface ShowingsPage {
  items: IdBody[];
  total: number;
  page: number;
  limit: number;
}

/** Joins validation messages (array) or a single message into one string. */
function messageOf(body: unknown): string {
  const { message } = body as ErrorBody;
  return Array.isArray(message) ? message.join('; ') : message;
}

describe('Cinema API (e2e, PostgreSQL)', () => {
  let app: INestApplication<App>;
  let http: App;
  let db: DataSource;
  /** HW2 scenarios run as an administrator (allowed to call every route). */
  let admin: TestUser;
  const asAdmin = () => as(http, admin.accessToken);

  beforeAll(async () => {
    app = await createApp();
    http = app.getHttpServer();
    db = app.get(DataSource);
  });

  // Every test starts with empty tables (the schema stays, built by migrations).
  beforeEach(async () => {
    await truncateAll(db);
    admin = await createUser(http, db, 'admin@test.local', 'admin');
  });

  afterAll(async () => {
    await app.close();
  });

  async function count(table: string): Promise<number> {
    const rows: { count: string }[] = await db.query(
      `SELECT COUNT(*)::text AS count FROM "${table}"`,
    );
    return Number(rows[0].count);
  }

  // ---------- helpers ----------

  async function createFilm(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await asAdmin()
      .post('/films')
      .send({
        title: 'Interstellar',
        durationMinutes: 169,
        releaseYear: 2014,
        ...overrides,
      })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function createHall(
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await asAdmin()
      .post('/halls')
      .send({ name: 'Red Hall', rows: 3, seatsPerRow: 5, ...overrides })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function createShowing(
    filmId: string,
    hallId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const res = await asAdmin()
      .post('/showings')
      .send({ filmId, hallId, startsAt: FUTURE, price: 15000, ...overrides })
      .expect(201);
    return (res.body as IdBody).id;
  }

  async function setupShowing(): Promise<{
    filmId: string;
    hallId: string;
    showingId: string;
  }> {
    const filmId = await createFilm();
    const hallId = await createHall();
    const showingId = await createShowing(filmId, hallId);
    return { filmId, hallId, showingId };
  }

  // ---------- general ----------

  it('strips unknown properties (whitelist)', async () => {
    const res = await asAdmin()
      .post('/films')
      .send({
        title: 'Dune',
        durationMinutes: 155,
        releaseYear: 2021,
        isAdmin: true,
        id: 'hacked',
      })
      .expect(201);
    expect(res.body).not.toHaveProperty('isAdmin');
    expect((res.body as IdBody).id).not.toBe('hacked');
    expect(Object.keys(res.body as object).sort()).toEqual([
      'durationMinutes',
      'id',
      'releaseYear',
      'title',
    ]);
  });

  it('serves the Swagger document at /docs-json', async () => {
    const res = await asAdmin().get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<string, Record<string, { tags: string[] }>>;
      components: {
        schemas: Record<
          string,
          { properties: Record<string, { type?: string; maximum?: number }> }
        >;
      };
    };
    expect(doc.paths['/showings/{id}/seats'].get.tags).toEqual(['showings']);
    const { schemas } = doc.components;
    expect(schemas.ErrorResponseDto).toBeDefined();
    expect(schemas.CreateHallDto.properties.rows).toMatchObject({
      type: 'integer',
      maximum: 50,
    });
    expect(schemas.CreateShowingDto.properties.price.type).toBe('integer');
    expect(schemas.Seat.properties.row.type).toBe('integer');
    expect(schemas.BookingResponseDto.properties.totalPrice.type).toBe(
      'integer',
    );
    expect(Object.keys(schemas.ErrorResponseDto.properties)).toEqual(
      expect.arrayContaining(['statusCode', 'message', 'path']),
    );
    expect(Object.keys(schemas.PaginatedShowingsDto.properties).sort()).toEqual(
      ['items', 'limit', 'page', 'total'],
    );
  });

  it('documents the paging query parameters of GET /showings', async () => {
    const res = await asAdmin().get('/docs-json').expect(200);
    const doc = res.body as {
      paths: Record<
        string,
        Record<
          string,
          {
            parameters: { name: string; in: string }[];
            responses: Record<string, { content?: unknown }>;
          }
        >
      >;
    };
    const op = doc.paths['/showings'].get;
    const names = op.parameters
      .filter((p) => p.in === 'query')
      .map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(['filmId', 'date', 'page', 'limit', 'sort']),
    );
    expect(JSON.stringify(op.responses['200'])).toContain(
      'PaginatedShowingsDto',
    );
  });

  it('returns 400 for a non-UUID :id', async () => {
    await asAdmin().get('/films/not-a-uuid').expect(400);
    await asAdmin().get('/halls/123').expect(400);
    await asAdmin().get('/showings/abc').expect(400);
    await asAdmin().delete('/bookings/abc').expect(400);
  });

  // ---------- films ----------

  describe('films', () => {
    it('POST /films creates a film (201)', async () => {
      const res = await asAdmin()
        .post('/films')
        .send({
          title: 'Interstellar',
          durationMinutes: 169,
          releaseYear: 2014,
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        title: 'Interstellar',
        durationMinutes: 169,
        releaseYear: 2014,
      });
    });

    it('POST /films returns 400 for missing fields', async () => {
      const res = await asAdmin()
        .post('/films')
        .send({ title: 'Only title' })
        .expect(400);
      expect(messageOf(res.body)).toContain('durationMinutes');
      expect(messageOf(res.body)).toContain('releaseYear');
    });

    it('POST /films returns 400 for wrong types and ranges', async () => {
      await asAdmin()
        .post('/films')
        .send({ title: 42, durationMinutes: 100, releaseYear: 2000 })
        .expect(400);
      await asAdmin()
        .post('/films')
        .send({ title: 'A', durationMinutes: '100', releaseYear: 2000 })
        .expect(400);
      await asAdmin()
        .post('/films')
        .send({ title: 'A', durationMinutes: 0, releaseYear: 2000 })
        .expect(400);
      await asAdmin()
        .post('/films')
        .send({ title: 'A', durationMinutes: 90.5, releaseYear: 2000 })
        .expect(400);
      await asAdmin()
        .post('/films')
        .send({ title: 'A', durationMinutes: 90, releaseYear: 1999.5 })
        .expect(400);
    });

    it('GET /films returns an array', async () => {
      await asAdmin().get('/films').expect(200).expect([]);
      await createFilm();
      await createFilm({ title: 'Dune' });
      const res = await asAdmin().get('/films').expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('GET /films/:id returns the film or 404', async () => {
      const id = await createFilm();
      const res = await asAdmin().get(`/films/${id}`).expect(200);
      expect(res.body).toMatchObject({ id, title: 'Interstellar' });
      await asAdmin().get(`/films/${MISSING_ID}`).expect(404);
    });

    it('PATCH /films/:id updates any subset', async () => {
      const id = await createFilm();
      const res = await asAdmin()
        .patch(`/films/${id}`)
        .send({ title: 'Interstellar (IMAX)' })
        .expect(200);
      expect(res.body).toEqual({
        id,
        title: 'Interstellar (IMAX)',
        durationMinutes: 169,
        releaseYear: 2014,
      });
      await asAdmin()
        .patch(`/films/${id}`)
        .send({ durationMinutes: 170, releaseYear: 2015 })
        .expect(200)
        .expect((r) =>
          expect(r.body).toMatchObject({
            durationMinutes: 170,
            releaseYear: 2015,
          }),
        );
    });

    it('PATCH /films/:id returns 400 for invalid values and 404 for missing', async () => {
      const id = await createFilm();
      await asAdmin()
        .patch(`/films/${id}`)
        .send({ durationMinutes: -5 })
        .expect(400);
      await asAdmin().patch(`/films/${id}`).send({ title: null }).expect(400);
      await asAdmin()
        .patch(`/films/${MISSING_ID}`)
        .send({ title: 'X' })
        .expect(404);
    });

    it('DELETE /films/:id returns 204, then 404', async () => {
      const id = await createFilm();
      const res = await asAdmin().delete(`/films/${id}`).expect(204);
      expect(res.text).toBe('');
      await asAdmin().get(`/films/${id}`).expect(404);
      await asAdmin().delete(`/films/${id}`).expect(404);
    });

    it('DELETE /films/:id returns 409 when a showing references the film', async () => {
      const { filmId } = await setupShowing();
      const res = await asAdmin().delete(`/films/${filmId}`).expect(409);
      expect(messageOf(res.body)).toContain('showings');
      await asAdmin().get(`/films/${filmId}`).expect(200);
    });
  });

  // ---------- halls ----------

  describe('halls', () => {
    it('POST /halls creates a hall (201)', async () => {
      const res = await asAdmin()
        .post('/halls')
        .send({ name: 'Red Hall', rows: 3, seatsPerRow: 5 })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        name: 'Red Hall',
        rows: 3,
        seatsPerRow: 5,
      });
    });

    it('POST /halls returns 400 for missing, wrong type, non-positive', async () => {
      await asAdmin().post('/halls').send({ name: 'A' }).expect(400);
      await asAdmin()
        .post('/halls')
        .send({ name: 'A', rows: '3', seatsPerRow: 5 })
        .expect(400);
      await asAdmin()
        .post('/halls')
        .send({ name: 'A', rows: 0, seatsPerRow: 5 })
        .expect(400);
      await asAdmin()
        .post('/halls')
        .send({ name: 'A', rows: 3, seatsPerRow: -1 })
        .expect(400);
      await asAdmin()
        .post('/halls')
        .send({ name: 'A', rows: 2.5, seatsPerRow: 5 })
        .expect(400);
    });

    it('POST /halls returns 409 for a duplicate name', async () => {
      await createHall({ name: 'Red Hall' });
      const res = await asAdmin()
        .post('/halls')
        .send({ name: 'Red Hall', rows: 1, seatsPerRow: 1 })
        .expect(409);
      expect(messageOf(res.body)).toContain('Red Hall');
      // case-insensitive, surrounding spaces ignored
      await asAdmin()
        .post('/halls')
        .send({ name: '  red hall ', rows: 1, seatsPerRow: 1 })
        .expect(409);
    });

    it('GET /halls returns an array', async () => {
      await createHall({ name: 'A' });
      await createHall({ name: 'B' });
      const res = await asAdmin().get('/halls').expect(200);
      expect(res.body).toHaveLength(2);
    });

    it('GET /halls/:id returns 15 seats for 3×5, or 404', async () => {
      const id = await createHall({ rows: 3, seatsPerRow: 5 });
      const res = await asAdmin().get(`/halls/${id}`).expect(200);
      const body = res.body as {
        seats: { row: number; seat: number }[];
      };
      expect(body).toMatchObject({ id, rows: 3, seatsPerRow: 5 });
      expect(body.seats).toHaveLength(15);
      expect(body.seats[0]).toEqual({ row: 1, seat: 1 });
      expect(body.seats[14]).toEqual({ row: 3, seat: 5 });
      await asAdmin().get(`/halls/${MISSING_ID}`).expect(404);
    });

    it('DELETE /halls/:id returns 204, then 404', async () => {
      const id = await createHall();
      await asAdmin().delete(`/halls/${id}`).expect(204);
      await asAdmin().get(`/halls/${id}`).expect(404);
      await asAdmin().delete(`/halls/${id}`).expect(404);
    });

    it('DELETE /halls/:id returns 409 when a showing references the hall', async () => {
      const { hallId } = await setupShowing();
      await asAdmin().delete(`/halls/${hallId}`).expect(409);
      await asAdmin().get(`/halls/${hallId}`).expect(200);
    });
  });

  // ---------- showings ----------

  describe('showings', () => {
    it('POST /showings creates a showing (201) with title and hall name', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const res = await asAdmin()
        .post('/showings')
        .send({ filmId, hallId, startsAt: FUTURE, price: 15000 })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        filmTitle: 'Interstellar',
        hallName: 'Red Hall',
        startsAt: FUTURE,
        price: 15000,
      });
    });

    it('POST /showings returns 400 (not 404) naming a missing film or hall', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const r1 = await asAdmin()
        .post('/showings')
        .send({ filmId: MISSING_ID, hallId, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r1.body)).toBe(`Film with id ${MISSING_ID} not found`);
      const r2 = await asAdmin()
        .post('/showings')
        .send({ filmId, hallId: MISSING_ID, startsAt: FUTURE, price: 100 })
        .expect(400);
      expect(messageOf(r2.body)).toBe(`Hall with id ${MISSING_ID} not found`);
    });

    it('POST /showings returns 400 for invalid or past startsAt', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      for (const startsAt of [
        'not-a-date',
        '2030-13-01T10:00:00Z',
        '2030-02-30T10:00:00Z',
        '2030-01-15',
        '2030-01-15T18:00:00',
        12345,
      ]) {
        const res = await asAdmin()
          .post('/showings')
          .send({ filmId, hallId, startsAt, price: 100 })
          .expect(400);
        expect(messageOf(res.body)).toContain('startsAt');
      }
      const past = await asAdmin()
        .post('/showings')
        .send({ filmId, hallId, startsAt: PAST, price: 100 })
        .expect(400);
      expect(messageOf(past.body)).toBe('startsAt must be in the future');
    });

    it('POST /showings returns 400 for a non-positive or non-integer price', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      for (const price of [0, -100, 99.5, '100']) {
        const res = await asAdmin()
          .post('/showings')
          .send({ filmId, hallId, startsAt: FUTURE, price })
          .expect(400);
        expect(messageOf(res.body)).toContain('price');
      }
    });

    it('POST /showings normalizes startsAt with offset to UTC', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      const res = await asAdmin()
        .post('/showings')
        .send({
          filmId,
          hallId,
          startsAt: '2030-01-16T01:30:00+03:00',
          price: 100,
        })
        .expect(201);
      expect((res.body as { startsAt: string }).startsAt).toBe(
        '2030-01-15T22:30:00.000Z',
      );
    });

    it('GET /showings sorts by startsAt asc, ties by id', async () => {
      const filmId = await createFilm();
      const hallA = await createHall({ name: 'A' });
      const hallB = await createHall({ name: 'B' });
      const late = await createShowing(filmId, hallA, {
        startsAt: '2030-01-17T10:00:00.000Z',
      });
      const tie1 = await createShowing(filmId, hallA, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const tie2 = await createShowing(filmId, hallB, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const early = await createShowing(filmId, hallB, {
        startsAt: '2030-01-14T10:00:00.000Z',
      });

      const res = await asAdmin().get('/showings').expect(200);
      const page = res.body as ShowingsPage;
      const ids = page.items.map((s) => s.id);
      const ties = [tie1, tie2].sort();
      expect(ids).toEqual([early, ...ties, late]);
      expect(page).toMatchObject({ total: 4, page: 1, limit: 20 });
      const first = page.items[0] as unknown as Record<string, unknown>;
      expect(first).toEqual({
        id: early,
        filmTitle: 'Interstellar',
        hallName: 'B',
        startsAt: '2030-01-14T10:00:00.000Z',
        price: 15000,
      });
      expect(first).not.toHaveProperty('filmId');
      expect(first).not.toHaveProperty('hallId');
    });

    it('GET /showings filters by filmId and date (AND, UTC date)', async () => {
      const film1 = await createFilm({ title: 'One' });
      const film2 = await createFilm({ title: 'Two' });
      const hallId = await createHall();
      const a = await createShowing(film1, hallId, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const b = await createShowing(film1, hallId, {
        startsAt: '2030-01-16T10:00:00.000Z',
      });
      const c = await createShowing(film2, hallId, {
        startsAt: '2030-01-15T12:00:00.000Z',
      });
      // 23:30 UTC on the 15th, although it is already the 16th in Kyiv
      const d = await createShowing(film2, hallId, {
        startsAt: '2030-01-16T01:30:00+02:00',
      });

      const ids = async (query: string): Promise<string[]> => {
        const res = await asAdmin().get(`/showings${query}`).expect(200);
        return (res.body as ShowingsPage).items.map((s) => s.id);
      };

      expect(await ids(`?filmId=${film1}`)).toEqual([a, b]);
      expect(await ids('?date=2030-01-15')).toEqual([a, c, d]);
      expect(await ids(`?filmId=${film2}&date=2030-01-15`)).toEqual([c, d]);
      expect(await ids(`?filmId=${film1}&date=2030-01-16`)).toEqual([b]);
      expect(await ids('?date=2031-01-01')).toEqual([]);
      expect(await ids(`?filmId=${MISSING_ID}`)).toEqual([]);
    });

    it('GET /showings returns 400 for a bad date or filmId filter', async () => {
      for (const date of ['15-01-2030', '2030-1-5', '2030-02-30', 'today']) {
        const res = await asAdmin().get(`/showings?date=${date}`).expect(400);
        expect(messageOf(res.body)).toContain('date');
      }
      await asAdmin().get('/showings?filmId=abc').expect(400);
    });

    it('GET /showings/:id returns the view or 404', async () => {
      const { showingId } = await setupShowing();
      const res = await asAdmin().get(`/showings/${showingId}`).expect(200);
      expect(res.body).toEqual({
        id: showingId,
        filmTitle: 'Interstellar',
        hallName: 'Red Hall',
        startsAt: FUTURE,
        price: 15000,
      });
      await asAdmin().get(`/showings/${MISSING_ID}`).expect(404);
    });

    it('GET /showings/:id/seats returns all hall seats with status, or 404', async () => {
      const { showingId } = await setupShowing();
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 2, seat: 3 }] })
        .expect(201);
      const res = await asAdmin()
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      const seats = res.body as {
        row: number;
        seat: number;
        isBooked: boolean;
      }[];
      expect(seats).toHaveLength(15);
      expect(seats.filter((s) => s.isBooked)).toEqual([
        { row: 2, seat: 3, isBooked: true },
      ]);
      expect(seats[0]).toEqual({ row: 1, seat: 1, isBooked: false });
      await asAdmin().get(`/showings/${MISSING_ID}/seats`).expect(404);
    });
  });

  // ---------- trimming, limits and messages ----------

  describe('trimming, limits and validation messages', () => {
    it('trims film titles and rejects whitespace-only titles (create + PATCH)', async () => {
      const created = await asAdmin()
        .post('/films')
        .send({ title: '  Dune  ', durationMinutes: 155, releaseYear: 2021 })
        .expect(201);
      expect((created.body as { title: string }).title).toBe('Dune');
      const id = (created.body as IdBody).id;

      const blank = await asAdmin()
        .post('/films')
        .send({ title: '   ', durationMinutes: 155, releaseYear: 2021 })
        .expect(400);
      expect(messageOf(blank.body)).toBe('title should not be empty');

      await asAdmin().patch(`/films/${id}`).send({ title: ' \t ' }).expect(400);
      await asAdmin()
        .patch(`/films/${id}`)
        .send({ title: '  Dune: Part Two ' })
        .expect(200)
        .expect((r) =>
          expect((r.body as { title: string }).title).toBe('Dune: Part Two'),
        );
    });

    it('trims hall names and rejects whitespace-only names', async () => {
      const res = await asAdmin()
        .post('/halls')
        .send({ name: '   ', rows: 3, seatsPerRow: 5 })
        .expect(400);
      expect(messageOf(res.body)).toBe('name should not be empty');
      const created = await asAdmin()
        .post('/halls')
        .send({ name: '  Blue  ', rows: 3, seatsPerRow: 5 })
        .expect(201);
      expect((created.body as { name: string }).name).toBe('Blue');
    });

    it('limits durationMinutes to 1000', async () => {
      await createFilm({ durationMinutes: 1000 });
      const res = await asAdmin()
        .post('/films')
        .send({ title: 'Long', durationMinutes: 1001, releaseYear: 2000 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'durationMinutes must not be greater than 1000',
      );
    });

    it('limits rows and seatsPerRow to 50', async () => {
      const id = await createHall({ name: 'Max', rows: 50, seatsPerRow: 50 });
      const hall = await asAdmin().get(`/halls/${id}`).expect(200);
      expect((hall.body as { seats: unknown[] }).seats).toHaveLength(2500);

      const res = await asAdmin()
        .post('/halls')
        .send({ name: 'Huge', rows: 100000, seatsPerRow: 100000 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'rows must not be greater than 50; seatsPerRow must not be greater than 50',
      );
      await asAdmin()
        .post('/halls')
        .send({ name: 'Wide', rows: 1, seatsPerRow: 51 })
        .expect(400);
    });

    it('limits price to 10 000 000 kopecks', async () => {
      const filmId = await createFilm();
      const hallId = await createHall();
      await createShowing(filmId, hallId, { price: 10_000_000 });
      const res = await asAdmin()
        .post('/showings')
        .send({ filmId, hallId, startsAt: FUTURE, price: 10_000_001 })
        .expect(400);
      expect(messageOf(res.body)).toBe(
        'price must not exceed 10000000 kopecks',
      );
    });

    it('reports one message per missing field', async () => {
      const res = await asAdmin().post('/films').send({}).expect(400);
      expect((res.body as ErrorBody).message).toEqual([
        'title should not be null or undefined',
        'durationMinutes should not be null or undefined',
        'releaseYear should not be null or undefined',
      ]);
    });

    it('gives clear messages for malformed seats', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const message = async (body: object): Promise<string> =>
        messageOf((await asAdmin().post(url).send(body).expect(400)).body);

      expect(await message({})).toBe('seats should not be null or undefined');
      expect(await message({ seats: 'A1' })).toBe(
        'seats must be an array of {row, seat} objects',
      );
      expect(await message({ seats: [] })).toBe(
        'seats must contain at least one seat',
      );
      expect(await message({ seats: [null, null] })).toBe(
        'each seat must be an object {row, seat}',
      );
      expect(await message({ seats: [{ row: 1 }] })).toBe(
        'seats.0.seat should not be null or undefined',
      );
      expect(
        await message({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 1 },
          ],
        }),
      ).toBe('seats must not contain duplicate seats');
    });
  });

  // ---------- bookings ----------

  describe('bookings', () => {
    it('POST /showings/:id/bookings creates a booking with totalPrice', async () => {
      const { showingId } = await setupShowing();
      const res = await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 1, seat: 1, vip: true },
            { row: 1, seat: 2 },
          ],
        })
        .expect(201);
      expect(res.body).toEqual({
        id: expect.any(String) as string,
        showingId,
        userId: admin.id,
        seats: [
          { row: 1, seat: 1 },
          { row: 1, seat: 2 },
        ],
        totalPrice: 30000,
      });
    });

    it('POST /showings/:id/bookings returns 404 for a missing showing', async () => {
      await asAdmin()
        .post(`/showings/${MISSING_ID}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(404);
    });

    it('POST /showings/:id/bookings returns 400 for invalid bodies', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;

      const empty = await asAdmin().post(url).send({ seats: [] });
      expect(empty.status).toBe(400);
      expect(messageOf(empty.body)).toContain('at least one seat');

      await asAdmin().post(url).send({}).expect(400);
      await asAdmin().post(url).send({ seats: 'A1' }).expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 1 }] })
        .expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: '1', seat: 1 }] })
        .expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 0, seat: 1 }] })
        .expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 1, seat: -2 }] })
        .expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 1, seat: 1.5 }] })
        .expect(400);
      await asAdmin()
        .post(url)
        .send({ seats: [null] })
        .expect(400);

      const dup = await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(400);
      expect(messageOf(dup.body)).toContain('duplicate');

      const outRow = await asAdmin()
        .post(url)
        .send({ seats: [{ row: 4, seat: 1 }] })
        .expect(400);
      expect(messageOf(outRow.body)).toContain('outside hall');
      const outSeat = await asAdmin()
        .post(url)
        .send({ seats: [{ row: 1, seat: 6 }] })
        .expect(400);
      expect(messageOf(outSeat.body)).toContain('row 1 seat 6');

      // nothing was booked by any of the failing requests
      await asAdmin().get(`/showings/${showingId}/bookings`).expect(200, []);
    });

    it('is all-or-nothing: 409 if any seat is taken, nothing is booked', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);

      const res = await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(409);
      expect(messageOf(res.body)).toContain('row 1 seat 1');

      const seats = await asAdmin()
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      const booked = (seats.body as { isBooked: boolean }[]).filter(
        (s) => s.isBooked,
      );
      expect(booked).toHaveLength(1); // row 1 seat 2 stayed free
      const list = await asAdmin().get(url).expect(200);
      expect(list.body).toHaveLength(1);

      // a seat outside the hall in the same request also books nothing
      await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 9, seat: 9 },
          ],
        })
        .expect(400);
      await asAdmin()
        .get(url)
        .expect(200)
        .expect((r) => expect(r.body).toHaveLength(1));
    });

    it('same seat can be booked for different showings', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const other = await createShowing(filmId, hallId, {
        startsAt: '2030-01-16T18:00:00.000Z',
      });
      const body = { seats: [{ row: 1, seat: 1 }] };
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send(body)
        .expect(201);
      await asAdmin()
        .post(`/showings/${other}/bookings`)
        .send(body)
        .expect(201);
    });

    it('GET /showings/:id/bookings lists bookings of a showing, or 404', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      const other = await createShowing(filmId, hallId, {
        startsAt: '2030-01-16T18:00:00.000Z',
      });
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      await asAdmin()
        .post(`/showings/${other}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      const res = await asAdmin()
        .get(`/showings/${showingId}/bookings`)
        .expect(200);
      expect(res.body).toHaveLength(1);
      expect((res.body as Record<string, unknown>[])[0]).toMatchObject({
        showingId,
      });
      await asAdmin().get(`/showings/${MISSING_ID}/bookings`).expect(404);
    });

    it('GET /bookings lists all bookings', async () => {
      await asAdmin().get('/bookings').expect(200, []);
      const { showingId } = await setupShowing();
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);
      const res = await asAdmin().get('/bookings').expect(200);
      expect(res.body).toHaveLength(1);
    });

    it('DELETE /bookings/:id frees seats (204), then 404', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const created = await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 3, seat: 4 },
            { row: 3, seat: 5 },
          ],
        })
        .expect(201);
      const bookingId = (created.body as IdBody).id;

      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 3, seat: 5 }] })
        .expect(409);

      const del = await asAdmin().delete(`/bookings/${bookingId}`).expect(204);
      expect(del.text).toBe('');

      const seats = await asAdmin()
        .get(`/showings/${showingId}/seats`)
        .expect(200);
      expect(
        (seats.body as { isBooked: boolean }[]).every((s) => !s.isBooked),
      ).toBe(true);
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 3, seat: 5 }] })
        .expect(201);

      await asAdmin().delete(`/bookings/${bookingId}`).expect(404);
      await asAdmin().delete(`/bookings/${MISSING_ID}`).expect(404);
    });
  });

  // ---------- HW2: unified error format ----------

  describe('global exception filter', () => {
    it('returns { statusCode, message, error, path, timestamp } for every error', async () => {
      const cases: [() => request.Test, number, string][] = [
        [
          () => asAdmin().get(`/films/${MISSING_ID}`),
          404,
          `/films/${MISSING_ID}`,
        ],
        [() => asAdmin().get('/films/abc'), 400, '/films/abc'],
        [() => asAdmin().post('/films').send({}), 400, '/films'],
        [() => asAdmin().get('/showings?limit=0'), 400, '/showings?limit=0'],
        [() => asAdmin().get('/nope'), 404, '/nope'],
      ];
      for (const [send, status, path] of cases) {
        const res = await send().expect(status);
        const body = res.body as ErrorBody;
        expect(Object.keys(body).sort()).toEqual([
          'error',
          'message',
          'path',
          'statusCode',
          'timestamp',
        ]);
        expect(body.statusCode).toBe(status);
        expect(body.path).toBe(path);
        expect(Number.isNaN(Date.parse(body.timestamp))).toBe(false);
      }
    });
  });

  // ---------- HW2: pagination, filtering and sorting in the database ----------

  describe('GET /showings pagination', () => {
    async function createMany(n: number): Promise<string[]> {
      const filmId = await createFilm();
      const hallId = await createHall();
      const ids: string[] = [];
      for (let i = 0; i < n; i++) {
        const day = String(10 + i).padStart(2, '0');
        ids.push(
          await createShowing(filmId, hallId, {
            startsAt: `2030-03-${day}T18:00:00.000Z`,
          }),
        );
      }
      return ids;
    }

    async function getPage(query: string): Promise<ShowingsPage> {
      const res = await asAdmin().get(`/showings${query}`).expect(200);
      return res.body as ShowingsPage;
    }

    it('defaults to page=1, limit=20, sort=asc and returns items/total/page/limit', async () => {
      await asAdmin()
        .get('/showings')
        .expect(200, { items: [], total: 0, page: 1, limit: 20 });
      const ids = await createMany(3);
      const page = await getPage('');
      expect(page).toMatchObject({ total: 3, page: 1, limit: 20 });
      expect(page.items.map((s) => s.id)).toEqual(ids);
    });

    it('splits results into pages; total counts all matching showings', async () => {
      const ids = await createMany(5);
      const p1 = await getPage('?page=1&limit=2');
      const p2 = await getPage('?page=2&limit=2');
      const p3 = await getPage('?page=3&limit=2');
      const p4 = await getPage('?page=4&limit=2');
      expect(p1).toMatchObject({ total: 5, page: 1, limit: 2 });
      expect(p1.items.map((s) => s.id)).toEqual(ids.slice(0, 2));
      expect(p2.items.map((s) => s.id)).toEqual(ids.slice(2, 4));
      expect(p3.items.map((s) => s.id)).toEqual(ids.slice(4));
      expect(p4).toEqual({ items: [], total: 5, page: 4, limit: 2 });
      const max = await getPage('?limit=100');
      expect(max.items).toHaveLength(5);
    });

    it('sorts by start time asc/desc, equal start times by id', async () => {
      const filmId = await createFilm();
      const hallA = await createHall({ name: 'A' });
      const hallB = await createHall({ name: 'B' });
      const early = await createShowing(filmId, hallA, {
        startsAt: '2030-01-14T10:00:00.000Z',
      });
      const tieA = await createShowing(filmId, hallA, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const tieB = await createShowing(filmId, hallB, {
        startsAt: '2030-01-15T10:00:00.000Z',
      });
      const late = await createShowing(filmId, hallB, {
        startsAt: '2030-01-16T10:00:00.000Z',
      });
      const ties = [tieA, tieB].sort();

      const asc = await getPage('?sort=asc');
      expect(asc.items.map((s) => s.id)).toEqual([early, ...ties, late]);
      const desc = await getPage('?sort=desc');
      expect(desc.items.map((s) => s.id)).toEqual([late, ...ties, early]);
      // paging is stable for equal start times
      const descPage2 = await getPage('?sort=desc&limit=2&page=2');
      expect(descPage2.items.map((s) => s.id)).toEqual([ties[1], early]);
    });

    it('combines filters with paging: total reflects the filters', async () => {
      const film1 = await createFilm({ title: 'One' });
      const film2 = await createFilm({ title: 'Two' });
      const hallId = await createHall();
      for (const hour of ['10', '12', '14']) {
        await createShowing(film1, hallId, {
          startsAt: `2030-02-01T${hour}:00:00.000Z`,
        });
      }
      await createShowing(film2, hallId, {
        startsAt: '2030-02-01T16:00:00.000Z',
      });
      await createShowing(film1, hallId, {
        startsAt: '2030-02-02T10:00:00.000Z',
      });
      const page = await getPage(
        `?filmId=${film1}&date=2030-02-01&limit=2&page=2&sort=desc`,
      );
      expect(page.total).toBe(3);
      expect(page.items).toHaveLength(1);
      expect(page.items[0]).toMatchObject({
        startsAt: '2030-02-01T10:00:00.000Z',
      });
    });

    it('returns 400 for invalid page, limit or sort', async () => {
      const bad = [
        'page=0',
        'page=-1',
        'page=1.5',
        'page=abc',
        'page=',
        'page=1&page=2',
        'limit=0',
        'limit=101',
        'limit=2.5',
        'limit=ten',
        'limit=1e1',
        'sort=up',
        'sort=ASC',
        'sort=',
      ];
      for (const query of bad) {
        const res = await asAdmin().get(`/showings?${query}`);
        expect({ query, status: res.status }).toEqual({ query, status: 400 });
        const param = query.split('=')[0];
        expect(messageOf(res.body)).toContain(param);
      }
    });
  });

  // ---------- HW2: booking transaction ----------

  describe('booking transaction and seat uniqueness', () => {
    it('stores one bookings row and one booking_seats row per seat', async () => {
      const { showingId } = await setupShowing();
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 2, seat: 1 },
            { row: 2, seat: 2 },
            { row: 2, seat: 3 },
          ],
        })
        .expect(201);
      expect(await count('bookings')).toBe(1);
      expect(await count('booking_seats')).toBe(3);
    });

    it('409 leaves no partial records: no booking and no seat of the failed request', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      await asAdmin()
        .post(url)
        .send({ seats: [{ row: 3, seat: 3 }] })
        .expect(201);

      // free seats come first in the request, the taken one is last
      const res = await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 2 },
            { row: 3, seat: 3 },
          ],
        })
        .expect(409);
      const body = res.body as ErrorBody;
      expect(body.message).toBe(
        'Seats already booked for this showing: row 3 seat 3',
      );
      // the database error text is not exposed
      expect(JSON.stringify(body)).not.toMatch(
        /duplicate key|violates|constraint|UQ_|23505/i,
      );

      expect(await count('bookings')).toBe(1);
      expect(await count('booking_seats')).toBe(1);
    });

    it('concurrent requests for the same seat: exactly one succeeds, the rest get 409', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          asAdmin()
            .post(url)
            // every request wants seat 1/1 plus a different free seat
            .send({
              seats: [
                { row: 1, seat: 1 },
                { row: 2 + (i % 2), seat: 1 + Math.floor(i / 2) },
              ],
            }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, ...Array<number>(9).fill(409)]);
      expect(await count('bookings')).toBe(1);
      expect(await count('booking_seats')).toBe(2);
    });

    it('concurrent requests with overlapping seats in opposite order do not deadlock', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const forward = Array.from({ length: 5 }, (_, i) => ({
        row: 1,
        seat: i + 1,
      }));
      const backward = [...forward].reverse();
      const results = await Promise.all(
        [forward, backward, forward, backward].map((seats) =>
          asAdmin().post(url).send({ seats }),
        ),
      );
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([201, 409, 409, 409]);
      expect(await count('booking_seats')).toBe(5);
    });

    it('DELETE /bookings/:id removes its seats in the database (cascade) and frees them', async () => {
      const { showingId } = await setupShowing();
      const url = `/showings/${showingId}/bookings`;
      const created = await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 1 },
            { row: 1, seat: 2 },
          ],
        })
        .expect(201);
      expect(await count('booking_seats')).toBe(2);
      await asAdmin()
        .delete(`/bookings/${(created.body as IdBody).id}`)
        .expect(204);
      expect(await count('bookings')).toBe(0);
      expect(await count('booking_seats')).toBe(0);
      await asAdmin()
        .post(url)
        .send({
          seats: [
            { row: 1, seat: 2 },
            { row: 1, seat: 1 },
          ],
        })
        .expect(201);
    });

    it('lists seats of a booking ordered by row and seat', async () => {
      const { showingId } = await setupShowing();
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({
          seats: [
            { row: 2, seat: 5 },
            { row: 1, seat: 3 },
            { row: 2, seat: 1 },
          ],
        })
        .expect(201)
        .expect((r) =>
          // the created booking keeps the request order
          expect((r.body as { seats: unknown[] }).seats).toEqual([
            { row: 2, seat: 5 },
            { row: 1, seat: 3 },
            { row: 2, seat: 1 },
          ]),
        );
      const res = await asAdmin().get('/bookings').expect(200);
      expect((res.body as { seats: unknown[] }[])[0].seats).toEqual([
        { row: 1, seat: 3 },
        { row: 2, seat: 1 },
        { row: 2, seat: 5 },
      ]);
    });
  });

  // ---------- HW2: foreign keys and delete rules ----------

  describe('delete rules', () => {
    it('a film or hall with showings is not deleted and nothing is cascaded', async () => {
      const { filmId, hallId, showingId } = await setupShowing();
      await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 1 }] })
        .expect(201);

      const film = await asAdmin().delete(`/films/${filmId}`).expect(409);
      expect(messageOf(film.body)).toBe(
        `Film with id ${filmId} cannot be deleted because it has showings`,
      );
      const hall = await asAdmin().delete(`/halls/${hallId}`).expect(409);
      expect(messageOf(hall.body)).toBe(
        `Hall with id ${hallId} cannot be deleted because it has showings`,
      );

      expect(await count('films')).toBe(1);
      expect(await count('halls')).toBe(1);
      expect(await count('showings')).toBe(1);
      expect(await count('bookings')).toBe(1);
      expect(await count('booking_seats')).toBe(1);
    });
  });

  // ---------- HW2: data lives in PostgreSQL ----------

  describe('persistence', () => {
    it('keeps data after the application is restarted', async () => {
      const { filmId, showingId } = await setupShowing();
      const booking = await asAdmin()
        .post(`/showings/${showingId}/bookings`)
        .send({ seats: [{ row: 1, seat: 4 }] })
        .expect(201);

      const second = await createApp();
      try {
        const http2 = second.getHttpServer();
        await as(http2, admin.accessToken)
          .get(`/films/${filmId}`)
          .expect(200)
          .expect((r) =>
            expect(r.body).toMatchObject({ title: 'Interstellar' }),
          );
        await as(http2, admin.accessToken)
          .get('/bookings')
          .expect(200)
          .expect((r) => expect(r.body).toEqual([booking.body]));
        await as(http2, admin.accessToken)
          .post(`/showings/${showingId}/bookings`)
          .send({ seats: [{ row: 1, seat: 4 }] })
          .expect(409);
      } finally {
        await second.close();
      }
    });
  });
});
