import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Booking } from '../../bookings/entities/booking.entity';
import { Film } from '../../films/entities/film.entity';
import { Hall } from '../../halls/entities/hall.entity';

/**
 * A showing of a film in a hall. Both relations are required.
 * ON DELETE RESTRICT: a film or hall that has showings cannot be deleted
 * (the services turn the FK violation into 409), showings are never cascaded.
 *
 * Not returned directly: the API responds with ShowingView.
 */
@Entity('showings')
@Index('IDX_showings_starts_at_id', ['startsAt', 'id'])
@Index('IDX_showings_film_id', ['filmId'])
@Index('IDX_showings_hall_id', ['hallId'])
export class Showing {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_showings' })
  id: string;

  @Column({ name: 'film_id', type: 'uuid' })
  filmId: string;

  @ManyToOne(() => Film, (film) => film.showings, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'film_id',
    foreignKeyConstraintName: 'FK_showings_film_id',
  })
  film?: Film;

  @Column({ name: 'hall_id', type: 'uuid' })
  hallId: string;

  @ManyToOne(() => Hall, (hall) => hall.showings, {
    nullable: false,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({
    name: 'hall_id',
    foreignKeyConstraintName: 'FK_showings_hall_id',
  })
  hall?: Hall;

  @Column({ name: 'starts_at', type: 'timestamptz' })
  startsAt: Date;

  /** Price per seat in kopecks. */
  @Column({ type: 'integer' })
  price: number;

  @OneToMany(() => Booking, (booking) => booking.showing)
  bookings?: Booking[];
}
