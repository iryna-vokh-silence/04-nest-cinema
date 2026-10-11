import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Showing } from '../../showings/entities/showing.entity';
import { Booking } from './booking.entity';

/**
 * One booked seat = one row.
 *
 * The unique index on (showing_id, row, seat) is the main rule of the service:
 * the same seat of the same showing cannot be sold twice. The database enforces
 * it even when two requests arrive at the same time. That is why showing_id is
 * stored here although it could be reached through booking_id: an index can
 * only cover columns of one table.
 */
@Entity('booking_seats')
@Index('UQ_booking_seats_showing_row_seat', ['showingId', 'row', 'seat'], {
  unique: true,
})
@Index('IDX_booking_seats_booking_id', ['bookingId'])
export class BookingSeat {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'PK_booking_seats',
  })
  id: string;

  @Column({ name: 'booking_id', type: 'uuid' })
  bookingId: string;

  /** Deleting a booking deletes its seats (ON DELETE CASCADE in the database). */
  @ManyToOne(() => Booking, (booking) => booking.seats, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'booking_id',
    foreignKeyConstraintName: 'FK_booking_seats_booking_id',
  })
  booking?: Booking;

  @Column({ name: 'showing_id', type: 'uuid' })
  showingId: string;

  @ManyToOne(() => Showing, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'showing_id',
    foreignKeyConstraintName: 'FK_booking_seats_showing_id',
  })
  showing?: Showing;

  @Column({ type: 'integer' })
  row: number;

  @Column({ type: 'integer' })
  seat: number;
}
