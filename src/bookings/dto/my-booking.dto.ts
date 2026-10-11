import { ApiProperty } from '@nestjs/swagger';
import { ShowingView } from '../../showings/dto/showing-view.dto';
import { BookingResponseDto } from './booking-response.dto';

/** An item of GET /bookings/my: the booking together with its showing. */
export class MyBookingDto extends BookingResponseDto {
  @ApiProperty({ type: ShowingView })
  showing: ShowingView;
}
