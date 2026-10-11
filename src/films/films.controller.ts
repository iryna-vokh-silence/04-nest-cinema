import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
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
import { CreateFilmDto } from './dto/create-film.dto';
import { UpdateFilmDto } from './dto/update-film.dto';
import { Film } from './entities/film.entity';
import { FilmsService } from './films.service';
import { Role } from '../users/role.enum';

@ApiTags('films')
@Controller('films')
export class FilmsController {
  constructor(private readonly filmsService: FilmsService) {}

  @Post()
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Create a film (admin)' })
  @ApiCreatedResponse({ type: Film, description: 'Film created' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Missing field or wrong type/range',
  })
  create(@Body() dto: CreateFilmDto): Promise<Film> {
    return this.filmsService.create(dto);
  }

  @Public()
  @Get()
  @ApiOperation({ summary: 'List all films' })
  @ApiOkResponse({ type: Film, isArray: true })
  findAll(): Promise<Film[]> {
    return this.filmsService.findAll();
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Get a film by id' })
  @ApiOkResponse({ type: Film })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Film> {
    return this.filmsService.findOne(id);
  }

  @Patch(':id')
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Update any subset of film fields (admin)' })
  @ApiOkResponse({ type: Film, description: 'Updated film' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid field or id',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFilmDto,
  ): Promise<Film> {
    return this.filmsService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Auth(Role.Admin)
  @ApiOperation({ summary: 'Delete a film (admin)' })
  @ApiNoContentResponse({ description: 'Film deleted' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'id is not a UUID',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'Film not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description:
      'Film is referenced by at least one showing (showings are never deleted with it)',
  })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.filmsService.remove(id);
  }
}
