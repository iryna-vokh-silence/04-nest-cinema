import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isDbError, PG_FOREIGN_KEY_VIOLATION } from '../common/database-errors';
import { CreateFilmDto } from './dto/create-film.dto';
import { UpdateFilmDto } from './dto/update-film.dto';
import { Film } from './entities/film.entity';

@Injectable()
export class FilmsService {
  constructor(
    @InjectRepository(Film)
    private readonly filmsRepository: Repository<Film>,
  ) {}

  async create(dto: CreateFilmDto): Promise<Film> {
    const film = this.filmsRepository.create({
      title: dto.title,
      durationMinutes: dto.durationMinutes,
      releaseYear: dto.releaseYear,
    });
    return this.filmsRepository.save(film);
  }

  findAll(): Promise<Film[]> {
    return this.filmsRepository.find({ order: { title: 'ASC', id: 'ASC' } });
  }

  /** Returns the film or throws 404. */
  async findOne(id: string): Promise<Film> {
    const film = await this.filmsRepository.findOneBy({ id });
    if (!film) {
      throw new NotFoundException(`Film with id ${id} not found`);
    }
    return film;
  }

  /** Non-throwing lookup for other modules (showings need a 400, not 404). */
  async findById(id: string): Promise<Film | null> {
    return this.filmsRepository.findOneBy({ id });
  }

  async update(id: string, dto: UpdateFilmDto): Promise<Film> {
    const film = await this.findOne(id);
    if (dto.title !== undefined) film.title = dto.title;
    if (dto.durationMinutes !== undefined) {
      film.durationMinutes = dto.durationMinutes;
    }
    if (dto.releaseYear !== undefined) film.releaseYear = dto.releaseYear;
    return this.filmsRepository.save(film);
  }

  /**
   * showings.film_id references films with ON DELETE RESTRICT, so the
   * database itself refuses to delete a film that has showings (no cascade).
   * That foreign key violation is turned into 409.
   */
  async remove(id: string): Promise<void> {
    const film = await this.findOne(id);
    try {
      await this.filmsRepository.delete({ id: film.id });
    } catch (error) {
      if (isDbError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          `Film with id ${id} cannot be deleted because it has showings`,
        );
      }
      throw error;
    }
  }
}
