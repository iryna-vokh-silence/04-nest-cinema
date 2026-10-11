import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial schema: films, halls, showings, bookings, booking_seats.
 *
 * Generated with `npm run migration:generate` from the entities and then
 * reordered for readability; the expression index on LOWER(halls.name) was
 * added by hand (TypeORM cannot describe it in an entity).
 *
 * `down` drops everything in reverse order, returning an empty database.
 */
export class InitialSchema1791700000000 implements MigrationInterface {
  name = 'InitialSchema1791700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // gen_random_uuid() (built into PostgreSQL 13+, provided by pgcrypto before).
    // The extension is not dropped in `down`: other schemas may rely on it.
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    await queryRunner.query(
      `CREATE TABLE "films" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "title" character varying NOT NULL,
        "duration_minutes" integer NOT NULL,
        "release_year" integer NOT NULL,
        CONSTRAINT "PK_films" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE "halls" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "rows" integer NOT NULL,
        "seats_per_row" integer NOT NULL,
        CONSTRAINT "UQ_halls_name" UNIQUE ("name"),
        CONSTRAINT "PK_halls" PRIMARY KEY ("id")
      )`,
    );
    // Hall names are unique regardless of letter case ("Red Hall" = "red hall").
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_halls_name_lower" ON "halls" (LOWER("name"))`,
    );

    await queryRunner.query(
      `CREATE TABLE "showings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "film_id" uuid NOT NULL,
        "hall_id" uuid NOT NULL,
        "starts_at" TIMESTAMP WITH TIME ZONE NOT NULL,
        "price" integer NOT NULL,
        CONSTRAINT "PK_showings" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_showings_film_id" ON "showings" ("film_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_showings_hall_id" ON "showings" ("hall_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_showings_starts_at_id" ON "showings" ("starts_at", "id")`,
    );
    // RESTRICT: a film/hall with showings cannot be deleted (API answers 409).
    await queryRunner.query(
      `ALTER TABLE "showings" ADD CONSTRAINT "FK_showings_film_id"
        FOREIGN KEY ("film_id") REFERENCES "films"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "showings" ADD CONSTRAINT "FK_showings_hall_id"
        FOREIGN KEY ("hall_id") REFERENCES "halls"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "bookings" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "showing_id" uuid NOT NULL,
        "total_price" integer NOT NULL,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_bookings" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_showing_id" ON "bookings" ("showing_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_showing_id"
        FOREIGN KEY ("showing_id") REFERENCES "showings"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "booking_seats" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "booking_id" uuid NOT NULL,
        "showing_id" uuid NOT NULL,
        "row" integer NOT NULL,
        "seat" integer NOT NULL,
        CONSTRAINT "PK_booking_seats" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_booking_seats_booking_id" ON "booking_seats" ("booking_id")`,
    );
    // The main rule: one seat of one showing can be sold only once.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_booking_seats_showing_row_seat"
        ON "booking_seats" ("showing_id", "row", "seat")`,
    );
    // Deleting a booking deletes its seats.
    await queryRunner.query(
      `ALTER TABLE "booking_seats" ADD CONSTRAINT "FK_booking_seats_booking_id"
        FOREIGN KEY ("booking_id") REFERENCES "bookings"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_seats" ADD CONSTRAINT "FK_booking_seats_showing_id"
        FOREIGN KEY ("showing_id") REFERENCES "showings"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "booking_seats" DROP CONSTRAINT "FK_booking_seats_showing_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "booking_seats" DROP CONSTRAINT "FK_booking_seats_booking_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."UQ_booking_seats_showing_row_seat"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_booking_seats_booking_id"`,
    );
    await queryRunner.query(`DROP TABLE "booking_seats"`);

    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_showing_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_showing_id"`);
    await queryRunner.query(`DROP TABLE "bookings"`);

    await queryRunner.query(
      `ALTER TABLE "showings" DROP CONSTRAINT "FK_showings_hall_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "showings" DROP CONSTRAINT "FK_showings_film_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_showings_starts_at_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_showings_hall_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_showings_film_id"`);
    await queryRunner.query(`DROP TABLE "showings"`);

    await queryRunner.query(`DROP INDEX "public"."UQ_halls_name_lower"`);
    await queryRunner.query(`DROP TABLE "halls"`);

    await queryRunner.query(`DROP TABLE "films"`);
  }
}
