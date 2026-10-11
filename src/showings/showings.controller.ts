import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreateShowingDto } from './dto/create-showing.dto';
import { FindShowingsQueryDto } from './dto/find-showings-query.dto';
import { PaginatedShowingsDto } from './dto/paginated-showings.dto';
import { ShowingView } from './dto/showing-view.dto';
import { ShowingsService } from './showings.service';
import { Role } from '../users/role.enum';

@ApiTags('showings')
@Controller('showings')
export class ShowingsController {
  constructor(private readonly showingsService: ShowingsService) {}

  @Post()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Create a showing (admin)' })
  @ApiCreatedResponse({ type: ShowingView, description: 'Showing created' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Film or hall not found, startsAt invalid or in the past, price not a positive integer',
  })
  create(@Body() dto: CreateShowingDto): Promise<ShowingView> {
    return this.showingsService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List showings (filters, sorting, pagination)',
    description:
      'Optional filters combine with AND. `date` matches the UTC date of startsAt. ' +
      'Sorted by startsAt (`sort=asc|desc`, default asc); showings with the same ' +
      'start time are ordered by id. Paged with `page` (from 1, default 1) and ' +
      '`limit` (1–100, default 20). Filtering, sorting and paging run in the database.',
  })
  @ApiOkResponse({
    type: PaginatedShowingsDto,
    description: 'One page of showings: { items, total, page, limit }',
  })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description:
      'Invalid filmId, date not in YYYY-MM-DD, page/limit not an integer or out of range, sort not asc/desc',
  })
  findAll(@Query() query: FindShowingsQueryDto): Promise<PaginatedShowingsDto> {
    return this.showingsService.findAll(query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a showing by id' })
  @ApiOkResponse({ type: ShowingView })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Showing not found',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<ShowingView> {
    return this.showingsService.findOne(id);
  }
}
