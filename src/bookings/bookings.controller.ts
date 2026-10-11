import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/authenticated-user';
import { Auth } from '../auth/decorators/auth.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { Role } from '../users/role.enum';
import { BookingsService } from './bookings.service';
import { BookingResponseDto } from './dto/booking-response.dto';
import { MyBookingDto } from './dto/my-booking.dto';

@ApiTags('bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Get()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'List all bookings (admin)' })
  @ApiOkResponse({ type: BookingResponseDto, isArray: true })
  findAll(): Promise<BookingResponseDto[]> {
    return this.bookingsService.findAll();
  }

  // Declared before ':id' routes; "my" is not a UUID anyway.
  @Get('my')
  @Auth()
  @ApiOperation({ summary: 'Bookings of the current user, with showing data' })
  @ApiOkResponse({ type: MyBookingDto, isArray: true })
  findMine(@CurrentUser('id') userId: string): Promise<MyBookingDto[]> {
    return this.bookingsService.findMine(userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth()
  @ApiOperation({
    summary: 'Cancel a booking (own booking; admin: any booking)',
    description: 'Its seats are deleted and become free.',
  })
  @ApiNoContentResponse({ description: 'Booking cancelled' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiForbiddenResponse({
    type: ErrorResponseDto,
    description: 'The booking belongs to another user',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Booking not found',
  })
  remove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<void> {
    return this.bookingsService.remove(id, user);
  }
}
