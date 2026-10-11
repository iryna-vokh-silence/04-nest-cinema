import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isDbError, PG_FOREIGN_KEY_VIOLATION } from '../common/database-errors';
import { FilmsService } from '../films/films.service';
import { HallsService } from '../halls/halls.service';
import { CreateShowingDto } from './dto/create-showing.dto';
import { FindShowingsQueryDto } from './dto/find-showings-query.dto';
import { PaginatedShowingsDto } from './dto/paginated-showings.dto';
import { ShowingView, toShowingView } from './dto/showing-view.dto';
import { Showing } from './entities/showing.entity';

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class ShowingsService {
  constructor(
    @InjectRepository(Showing)
    private readonly showingsRepository: Repository<Showing>,
    private readonly filmsService: FilmsService,
    private readonly hallsService: HallsService,
  ) {}

  async create(dto: CreateShowingDto): Promise<ShowingView> {
    // Referenced entities live in the request body, so a missing one is a
    // bad request (400), not a missing resource (404).
    const film = await this.filmsService.findById(dto.filmId);
    if (!film) {
      throw new BadRequestException(`Film with id ${dto.filmId} not found`);
    }
    const hall = await this.hallsService.findById(dto.hallId);
    if (!hall) {
      throw new BadRequestException(`Hall with id ${dto.hallId} not found`);
    }
    const startsAt = new Date(dto.startsAt);
    if (Number.isNaN(startsAt.getTime())) {
      throw new BadRequestException(
        'startsAt must be a valid ISO 8601 date-time',
      );
    }
    if (startsAt.getTime() <= Date.now()) {
      throw new BadRequestException('startsAt must be in the future');
    }

    const showing = this.showingsRepository.create({
      filmId: film.id,
      hallId: hall.id,
      startsAt,
      price: dto.price,
    });
    try {
      await this.showingsRepository.save(showing);
    } catch (error) {
      // The film or hall was deleted between the check and the insert.
      if (isDbError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new BadRequestException('Film or hall not found');
      }
      throw error;
    }
    return this.toView({ ...showing, film, hall });
  }

  /**
   * Filtering, sorting and paging are done by a single SQL query
   * (Query Builder); only one page of rows is loaded into memory.
   * Filters combine with AND; order: startsAt (asc|desc), then id.
   */
  async findAll(query: FindShowingsQueryDto): Promise<PaginatedShowingsDto> {
    const { filmId, date, page, limit, sort } = query;

    const qb = this.showingsRepository
      .createQueryBuilder('showing')
      .innerJoinAndSelect('showing.film', 'film')
      .innerJoinAndSelect('showing.hall', 'hall');

    if (filmId) {
      qb.andWhere('showing.filmId = :filmId', { filmId });
    }
    if (date) {
      // The UTC day [date 00:00Z, next day 00:00Z) — an index-friendly range.
      const dayStart = new Date(`${date}T00:00:00.000Z`);
      const dayEnd = new Date(dayStart.getTime() + DAY_MS);
      qb.andWhere('showing.startsAt >= :dayStart', { dayStart }).andWhere(
        'showing.startsAt < :dayEnd',
        { dayEnd },
      );
    }

    // Both relations are many-to-one, so the join does not multiply rows and
    // plain LIMIT/OFFSET can be used.
    const [showings, total] = await qb
      .orderBy('showing.startsAt', sort === 'desc' ? 'DESC' : 'ASC')
      .addOrderBy('showing.id', 'ASC')
      .offset((page - 1) * limit)
      .limit(limit)
      .getManyAndCount();

    return Object.assign(new PaginatedShowingsDto(), {
      items: showings.map((s) => this.toView(s)),
      total,
      page,
      limit,
    });
  }

  async findOne(id: string): Promise<ShowingView> {
    const showing = await this.showingsRepository.findOne({
      where: { id },
      relations: { film: true, hall: true },
    });
    if (!showing) {
      throw this.notFound(id);
    }
    return this.toView(showing);
  }

  /** Showing with its hall, for other modules (bookings); throws 404. */
  async getWithHall(
    id: string,
  ): Promise<Showing & Required<Pick<Showing, 'hall'>>> {
    const showing = await this.showingsRepository.findOne({
      where: { id },
      relations: { hall: true },
    });
    if (!showing || !showing.hall) {
      throw this.notFound(id);
    }
    return showing as Showing & Required<Pick<Showing, 'hall'>>;
  }

  /** Throws 404 if the showing does not exist. */
  async assertExists(id: string): Promise<void> {
    const exists = await this.showingsRepository.existsBy({ id });
    if (!exists) {
      throw this.notFound(id);
    }
  }

  private toView(showing: Showing): ShowingView {
    return toShowingView(showing);
  }

  private notFound(id: string): NotFoundException {
    return new NotFoundException(`Showing with id ${id} not found`);
  }
}
