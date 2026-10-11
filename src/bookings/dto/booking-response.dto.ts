import { ApiProperty } from '@nestjs/swagger';
import { Seat } from '../../common/seat';

/** Booking as returned by the API (same shape as in HW1). */
export class BookingResponseDto {
  @ApiProperty({
    format: 'uuid',
    example: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
  })
  id: string;

  @ApiProperty({
    format: 'uuid',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  showingId: string;

  @ApiProperty({
    format: 'uuid',
    example: '6c3f1f7e-2a4b-4c8d-9e1f-0a1b2c3d4e5f',
    description: 'Owner of the booking (the user from the access token)',
  })
  userId: string;

  @ApiProperty({ type: Seat, isArray: true })
  seats: Seat[];

  @ApiProperty({
    type: 'integer',
    example: 30000,
    description: 'Showing price × number of seats, in kopecks',
  })
  totalPrice: number;
}
