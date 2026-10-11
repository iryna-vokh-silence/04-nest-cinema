import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * HW4: every booking belongs to a user (bookings.user_id, NOT NULL).
 *
 * The database before HW4 is a development database, so existing bookings
 * (and their seats, via ON DELETE CASCADE) are deleted first: a NOT NULL
 * column cannot be added to rows that have no owner.
 *
 * A user who has bookings cannot be deleted (ON DELETE RESTRICT).
 *
 * `down` removes the column (bookings stay, without an owner).
 */
export class AddUserIdToBookings1791800000001 implements MigrationInterface {
  name = 'AddUserIdToBookings1791800000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "bookings"`);
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "user_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bookings_user_id" ON "bookings" ("user_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_bookings_user_id"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "user_id"`);
  }
}
