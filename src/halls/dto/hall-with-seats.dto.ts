import { ApiProperty } from '@nestjs/swagger';
import { Seat } from '../../common/seat';
import { Hall } from '../entities/hall.entity';

export class HallWithSeats extends Hall {
  @ApiProperty({
    type: Seat,
    isArray: true,
    description: 'All seats of the hall (rows × seatsPerRow), 1-based',
  })
  seats: Seat[];
}
