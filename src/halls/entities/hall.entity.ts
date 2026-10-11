import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { Showing } from '../../showings/entities/showing.entity';

/**
 * Seats are not stored: the service computes them from rows × seatsPerRow.
 *
 * `name` has a plain UNIQUE constraint (as in the task description) and,
 * additionally, a unique index on LOWER(name) created by the migration, so that
 * "Red Hall" and "red hall" cannot coexist (the case-insensitive rule from HW1).
 * TypeORM cannot describe an expression index, hence `synchronize: false`.
 */
@Entity('halls')
@Unique('UQ_halls_name', ['name'])
@Index('UQ_halls_name_lower', { synchronize: false })
export class Hall {
  @ApiProperty({
    format: 'uuid',
    example: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  })
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_halls' })
  id: string;

  @ApiProperty({ example: 'Red Hall' })
  @Column({ type: 'varchar' })
  name: string;

  @ApiProperty({ type: 'integer', example: 3, minimum: 1 })
  @Column({ type: 'integer' })
  rows: number;

  @ApiProperty({ type: 'integer', example: 5, minimum: 1 })
  @Column({ name: 'seats_per_row', type: 'integer' })
  seatsPerRow: number;

  @OneToMany(() => Showing, (showing) => showing.hall)
  showings?: Showing[];
}
