import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Showing } from '../../showings/entities/showing.entity';
import { User } from '../../users/entities/user.entity';
import { BookingSeat } from './booking-seat.entity';

/**
 * A booking of one or more seats for a showing. The seats themselves live in
 * booking_seats (one row per seat). Not returned directly: the API responds
 * with BookingResponseDto.
 */
@Entity('bookings')
@Index('IDX_bookings_showing_id', ['showingId'])
@Index('IDX_bookings_user_id', ['userId'])
export class Booking {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'PK_bookings' })
  id: string;

  @Column({ name: 'showing_id', type: 'uuid' })
  showingId: string;

  /** A booking does not exist without its showing. */
  @ManyToOne(() => Showing, (showing) => showing.bookings, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({
    name: 'showing_id',
    foreignKeyConstraintName: 'FK_bookings_showing_id',
  })
  showing?: Showing;

  /** Owner of the booking: always the user from the access token. */
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  /** A user with bookings cannot be deleted (RESTRICT). */
  @ManyToOne(() => User, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({
    name: 'user_id',
    foreignKeyConstraintName: 'FK_bookings_user_id',
  })
  user?: User;

  /** Showing price × number of seats, in kopecks. */
  @Column({ name: 'total_price', type: 'integer' })
  totalPrice: number;

  @CreateDateColumn({
    name: 'created_at',
    type: 'timestamptz',
    default: () => 'now()',
  })
  createdAt: Date;

  @OneToMany(() => BookingSeat, (seat) => seat.booking)
  seats?: BookingSeat[];
}
