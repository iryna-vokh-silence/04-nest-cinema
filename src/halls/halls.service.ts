import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  isDbError,
  PG_FOREIGN_KEY_VIOLATION,
  PG_UNIQUE_VIOLATION,
} from '../common/database-errors';
import { Seat } from '../common/seat';
import { CreateHallDto } from './dto/create-hall.dto';
import { HallWithSeats } from './dto/hall-with-seats.dto';
import { Hall } from './entities/hall.entity';

@Injectable()
export class HallsService {
  constructor(
    @InjectRepository(Hall)
    private readonly hallsRepository: Repository<Hall>,
  ) {}

  /**
   * Names are unique case-insensitively. The service checks first to give a
   * friendly message; the unique indexes in the database (name and
   * LOWER(name)) catch the race when two equal names arrive at once.
   */
  async create(dto: CreateHallDto): Promise<Hall> {
    const name = dto.name.trim();
    const exists = await this.hallsRepository
      .createQueryBuilder('hall')
      .where('LOWER(hall.name) = LOWER(:name)', { name })
      .getExists();
    if (exists) {
      throw this.duplicateName(name);
    }
    const hall = this.hallsRepository.create({
      name,
      rows: dto.rows,
      seatsPerRow: dto.seatsPerRow,
    });
    try {
      return await this.hallsRepository.save(hall);
    } catch (error) {
      if (isDbError(error, PG_UNIQUE_VIOLATION)) {
        throw this.duplicateName(name);
      }
      throw error;
    }
  }

  findAll(): Promise<Hall[]> {
    return this.hallsRepository.find({ order: { name: 'ASC', id: 'ASC' } });
  }

  /** Returns the hall with its computed seat list, or throws 404. */
  async findOneWithSeats(id: string): Promise<HallWithSeats> {
    const hall = await this.hallsRepository.findOneBy({ id });
    if (!hall) {
      throw new NotFoundException(`Hall with id ${id} not found`);
    }
    return Object.assign(new HallWithSeats(), {
      ...hall,
      seats: this.computeSeats(hall),
    });
  }

  /** Non-throwing lookup for other modules. */
  findById(id: string): Promise<Hall | null> {
    return this.hallsRepository.findOneBy({ id });
  }

  /** All seats of a hall in row-major order, 1-based (not stored in the DB). */
  computeSeats(hall: Pick<Hall, 'rows' | 'seatsPerRow'>): Seat[] {
    const seats: Seat[] = [];
    for (let row = 1; row <= hall.rows; row++) {
      for (let seat = 1; seat <= hall.seatsPerRow; seat++) {
        seats.push({ row, seat });
      }
    }
    return seats;
  }

  isSeatInHall(hall: Pick<Hall, 'rows' | 'seatsPerRow'>, seat: Seat): boolean {
    return (
      seat.row >= 1 &&
      seat.row <= hall.rows &&
      seat.seat >= 1 &&
      seat.seat <= hall.seatsPerRow
    );
  }

  /**
   * showings.hall_id references halls with ON DELETE RESTRICT: the database
   * refuses to delete a hall that has showings; that becomes 409.
   */
  async remove(id: string): Promise<void> {
    const result = await this.deleteHall(id);
    if (result === 0) {
      throw new NotFoundException(`Hall with id ${id} not found`);
    }
  }

  private async deleteHall(id: string): Promise<number> {
    try {
      const result = await this.hallsRepository.delete({ id });
      return result.affected ?? 0;
    } catch (error) {
      if (isDbError(error, PG_FOREIGN_KEY_VIOLATION)) {
        throw new ConflictException(
          `Hall with id ${id} cannot be deleted because it has showings`,
        );
      }
      throw error;
    }
  }

  private duplicateName(name: string): ConflictException {
    return new ConflictException(`Hall with name "${name}" already exists`);
  }
}
