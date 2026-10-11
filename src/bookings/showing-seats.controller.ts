import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { BookingsService } from './bookings.service';
import { SeatStatus } from './dto/seat-status.dto';

/**
 * Seat map of a showing. Documented under "showings", but implemented in the
 * bookings module because seat occupancy is owned by BookingsService.
 */
@ApiTags('showings')
@Controller('showings/:id/seats')
export class ShowingSeatsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Seat map of a showing with booking status' })
  @ApiOkResponse({ type: SeatStatus, isArray: true })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  getSeats(@Param('id', ParseUUIDPipe) id: string): Promise<SeatStatus[]> {
    return this.bookingsService.getSeatStatuses(id);
  }
}
