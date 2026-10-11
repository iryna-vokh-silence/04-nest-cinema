import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { isDbError, PG_UNIQUE_VIOLATION } from '../common/database-errors';
import { User } from './entities/user.entity';
import { Role } from './role.enum';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  /** Email must already be normalized (trimmed, lower case). */
  findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ email });
  }

  findById(id: string): Promise<User | null> {
    return this.usersRepository.findOneBy({ id });
  }

  /**
   * Creates a user with the given password hash. A duplicate email gives 409:
   * checked first for a friendly answer, and the unique constraint catches
   * two simultaneous registrations.
   */
  async create(
    email: string,
    passwordHash: string,
    role: Role = Role.User,
  ): Promise<User> {
    if (await this.usersRepository.existsBy({ email })) {
      throw this.duplicate();
    }
    try {
      // save() returns the entity instance (with id, role and createdAt
      // filled in by the database), so @Exclude() works on serialization.
      return await this.usersRepository.save(
        this.usersRepository.create({ email, passwordHash, role }),
      );
    } catch (error) {
      if (isDbError(error, PG_UNIQUE_VIOLATION)) throw this.duplicate();
      throw error;
    }
  }

  private duplicate(): ConflictException {
    return new ConflictException('User with this email already exists');
  }
}
