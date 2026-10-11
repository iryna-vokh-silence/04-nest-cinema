import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsInt, Min } from 'class-validator';

/**
 * A seat position inside a hall (both numbers are 1-based).
 * Used both as the booking request item (validated) and in responses.
 * Hall bounds are checked in BookingsService because they depend on the hall.
 */
export class Seat {
  @ApiProperty({ type: 'integer', example: 1, minimum: 1 })
  @Min(1)
  @IsInt()
  @IsDefined()
  row: number;

  @ApiProperty({ type: 'integer', example: 3, minimum: 1 })
  @Min(1)
  @IsInt()
  @IsDefined()
  seat: number;
}

export function seatKey(seat: Seat): string {
  return `${seat.row}:${seat.seat}`;
}

export function formatSeat(seat: Seat): string {
  return `row ${seat.row} seat ${seat.seat}`;
}
