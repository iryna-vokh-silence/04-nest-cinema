import { ApiProperty } from '@nestjs/swagger';
import { Seat } from '../../common/seat';

/** A hall seat together with its booking status for a given showing. */
export class SeatStatus extends Seat {
  @ApiProperty({ example: false })
  isBooked: boolean;
}
