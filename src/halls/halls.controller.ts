import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Auth } from '../auth/decorators/auth.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { CreateHallDto } from './dto/create-hall.dto';
import { HallWithSeats } from './dto/hall-with-seats.dto';
import { Hall } from './entities/hall.entity';
import { HallsService } from './halls.service';
import { Role } from '../users/role.enum';

@ApiTags('halls')
@Controller('halls')
export class HallsController {
  constructor(private readonly hallsService: HallsService) {}

  @Post()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Create a hall (admin)' })
  @ApiCreatedResponse({ type: Hall, description: 'Hall created' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Missing field, wrong type or not a positive integer',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Hall with this name already exists',
  })
  create(@Body() dto: CreateHallDto): Promise<Hall> {
    return this.hallsService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all halls' })
  @ApiOkResponse({ type: Hall, isArray: true })
  findAll(): Promise<Hall[]> {
    return this.hallsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a hall with its computed seat list' })
  @ApiOkResponse({ type: HallWithSeats })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Hall not found',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<HallWithSeats> {
    return this.hallsService.findOneWithSeats(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Delete a hall (admin)' })
  @ApiNoContentResponse({ description: 'Hall deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Hall not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Hall is referenced by at least one showing (showings are never deleted with it)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.hallsService.remove(id);
  }
}
