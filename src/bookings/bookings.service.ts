import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { isDbError, PG_UNIQUE_VIOLATION } from '../common/database-errors';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { formatSeat, Seat, seatKey } from '../common/seat';
import { HallsService } from '../halls/halls.service';
import { toShowingView } from '../showings/dto/showing-view.dto';
import { ShowingsService } from '../showings/showings.service';
import { Role } from '../users/role.enum';
import { BookingResponseDto } from './dto/booking-response.dto';
import { CreateBookingDto } from './dto/create-booking.dto';
import { MyBookingDto } from './dto/my-booking.dto';
import { SeatStatus } from './dto/seat-status.dto';
import { BookingSeat } from './entities/booking-seat.entity';
import { Booking } from './entities/booking.entity';

@Injectable()
export class BookingsService {
  constructor(
    @InjectRepository(Booking)
    private readonly bookingsRepository: Repository<Booking>,
    @InjectRepository(BookingSeat)
    private readonly bookingSeatsRepository: Repository<BookingSeat>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly showingsService: ShowingsService,
    private readonly hallsService: HallsService,
  ) {}

  async findAll(): Promise<BookingResponseDto[]> {
    const bookings = await this.bookingsRepository.find({
      relations: { seats: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return bookings.map((b) => this.toResponse(b));
  }

  /** Bookings of one user, each with its showing (film title, hall, time). */
  async findMine(userId: string): Promise<MyBookingDto[]> {
    const bookings = await this.bookingsRepository.find({
      where: { userId },
      relations: { seats: true, showing: { film: true, hall: true } },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return bookings.map((b) =>
      Object.assign(new MyBookingDto(), {
        ...this.toResponse(b),
        showing: toShowingView(b.showing!),
      }),
    );
  }

  async findByShowing(showingId: string): Promise<BookingResponseDto[]> {
    await this.showingsService.assertExists(showingId); // 404 if missing
    const bookings = await this.bookingsRepository.find({
      where: { showingId },
      relations: { seats: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });
    return bookings.map((b) => this.toResponse(b));
  }

  /**
   * All-or-nothing booking.
   *
   * The booking row and every seat row are inserted in ONE transaction.
   * The unique index (showing_id, row, seat) on booking_seats is what
   * guarantees that a seat is sold only once — even for two simultaneous
   * requests: the second insert waits for the first transaction and then fails
   * with a unique violation. Any error rolls the whole transaction back, so no
   * booking and no seat of a failed request remain in the database.
   */
  async create(
    showingId: string,
    dto: CreateBookingDto,
    userId: string,
  ): Promise<BookingResponseDto> {
    const showing = await this.showingsService.getWithHall(showingId); // 404
    const { hall } = showing;

    const outside = dto.seats.filter(
      (s) => !this.hallsService.isSeatInHall(hall, s),
    );
    if (outside.length > 0) {
      throw new BadRequestException(
        `Seats outside hall "${hall.name}" (${hall.rows} rows × ${hall.seatsPerRow} seats): ${outside.map(formatSeat).join(', ')}`,
      );
    }

    try {
      // try/catch is AROUND the transaction: an error caught inside the
      // callback would hide it from TypeORM and the transaction would commit.
      const booking = await this.dataSource.transaction(async (manager) => {
        const created = manager.create(Booking, {
          showingId,
          userId,
          totalPrice: showing.price * dto.seats.length,
        });
        await manager.save(created);

        // Seats are inserted in a fixed order (row, seat) so that two
        // concurrent requests for overlapping seats lock index entries in the
        // same order and cannot deadlock each other.
        const ordered = [...dto.seats].sort(
          (x, y) => x.row - y.row || x.seat - y.seat,
        );
        const seats = ordered.map((s) =>
          manager.create(BookingSeat, {
            bookingId: created.id,
            showingId,
            row: s.row,
            seat: s.seat,
          }),
        );
        await manager.save(seats);
        return created;
      });
      // The response keeps the seat order of the request (as in HW1).
      return this.toResponse({ ...booking, seats: dto.seats }, false);
    } catch (error) {
      if (isDbError(error, PG_UNIQUE_VIOLATION)) {
        // The database text is never sent to the client.
        throw new ConflictException(
          await this.conflictMessage(showingId, dto.seats),
        );
      }
      throw error;
    }
  }

  /** Seat map of a showing: every hall seat with its booking status. */
  async getSeatStatuses(showingId: string): Promise<SeatStatus[]> {
    const showing = await this.showingsService.getWithHall(showingId); // 404
    const booked = await this.bookingSeatsRepository.find({
      select: { row: true, seat: true },
      where: { showingId },
    });
    const keys = new Set(booked.map((s) => seatKey(s)));
    return this.hallsService.computeSeats(showing.hall).map((s) =>
      Object.assign(new SeatStatus(), {
        ...s,
        isBooked: keys.has(seatKey(s)),
      }),
    );
  }

  /**
   * Cancels a booking. Deleting it deletes its seats (ON DELETE CASCADE),
   * freeing them.
   *
   * Ownership is checked HERE, not in a guard: it needs the booking from the
   * database. A user may cancel only their own booking (403 otherwise); an
   * administrator may cancel any booking.
   */
  async remove(id: string, user: AuthenticatedUser): Promise<void> {
    const booking = await this.bookingsRepository.findOne({
      select: { id: true, userId: true },
      where: { id },
    });
    if (!booking) {
      throw this.bookingNotFound(id);
    }
    if (user.role !== Role.Admin && booking.userId !== user.id) {
      throw new ForbiddenException('You can cancel only your own bookings');
    }
    const result = await this.bookingsRepository.delete({ id });
    if (!result.affected) {
      throw this.bookingNotFound(id); // cancelled concurrently
    }
  }

  private bookingNotFound(id: string): NotFoundException {
    return new NotFoundException(`Booking with id ${id} not found`);
  }

  /** Names the requested seats that are already taken (read after rollback). */
  private async conflictMessage(
    showingId: string,
    requested: Seat[],
  ): Promise<string> {
    const booked = await this.bookingSeatsRepository.find({
      select: { row: true, seat: true },
      where: requested.map((s) => ({ showingId, row: s.row, seat: s.seat })),
    });
    const keys = new Set(booked.map((s) => seatKey(s)));
    const taken = requested.filter((s) => keys.has(seatKey(s)));
    return taken.length > 0
      ? `Seats already booked for this showing: ${taken.map(formatSeat).join(', ')}`
      : 'One or more seats are already booked for this showing';
  }

  /**
   * API shape: { id, showingId, userId, seats: [{row, seat}], totalPrice }.
   * Seats loaded from the database are ordered by row, then seat; a just
   * created booking keeps the order of the request.
   */
  private toResponse(
    booking: Pick<Booking, 'id' | 'showingId' | 'userId' | 'totalPrice'> & {
      seats?: Seat[];
    },
    sortSeats = true,
  ): BookingResponseDto {
    const seats = (booking.seats ?? []).map((s) => ({
      row: s.row,
      seat: s.seat,
    }));
    if (sortSeats) {
      seats.sort((a, b) => a.row - b.row || a.seat - b.seat);
    }
    return Object.assign(new BookingResponseDto(), {
      id: booking.id,
      showingId: booking.showingId,
      userId: booking.userId,
      seats,
      totalPrice: booking.totalPrice,
    });
  }
}
