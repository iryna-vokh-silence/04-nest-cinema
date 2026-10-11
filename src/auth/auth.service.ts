import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { EnvironmentVariables } from '../config/env.validation';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AccessTokenPayload } from './authenticated-user';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { TokensDto } from './dto/tokens.dto';
import { RefreshToken } from './entities/refresh-token.entity';
import { hashPassword, hashPasswordSync, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken } from './refresh-token.util';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Same message for an unknown email and a wrong password. */
const INVALID_CREDENTIALS = 'Invalid email or password';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';

@Injectable()
export class AuthService {
  private readonly saltRounds: number;
  private readonly refreshTtlDays: number;
  /** Compared against when the email is unknown (equal response time). */
  private readonly dummyPasswordHash: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectDataSource() private readonly dataSource: DataSource,
    config: ConfigService<EnvironmentVariables, true>,
  ) {
    this.saltRounds = config.get('BCRYPT_SALT_ROUNDS', { infer: true });
    this.refreshTtlDays = config.get('REFRESH_TOKEN_TTL_DAYS', { infer: true });
    this.dummyPasswordHash = hashPasswordSync(
      randomBytes(16).toString('hex'),
      this.saltRounds,
    );
  }

  /** New users always get the role "user". Duplicate email -> 409. */
  async register(dto: RegisterDto): Promise<User> {
    const passwordHash = await hashPassword(dto.password, this.saltRounds);
    return this.usersService.create(dto.email, passwordHash);
  }

  /** Wrong email and wrong password give the same 401. */
  async login(dto: LoginDto): Promise<TokensDto> {
    const user = await this.usersService.findByEmail(dto.email);
    const passwordOk = await verifyPassword(
      dto.password,
      user?.passwordHash ?? this.dummyPasswordHash,
    );
    if (!user || !passwordOk) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    // Housekeeping: expired tokens of this user are useless.
    await this.dataSource.query(
      `DELETE FROM "refresh_tokens" WHERE "user_id" = $1 AND "expires_at" <= now()`,
      [user.id],
    );

    return this.issueTokens(user, this.dataSource.manager);
  }

  /**
   * Refresh token rotation.
   *
   * The old token is found AND deleted by one statement:
   *   DELETE FROM refresh_tokens WHERE token_hash = $1 AND expires_at > now()
   *   RETURNING user_id
   * Two simultaneous requests with the same token cannot both succeed: the
   * row is deleted only once, the second DELETE returns nothing. An empty
   * result means the token is unknown, expired or already used -> 401.
   * The new token is inserted in the same transaction.
   */
  async refresh(refreshToken: string): Promise<TokensDto> {
    const tokenHash = hashRefreshToken(refreshToken);
    return this.dataSource.transaction(async (manager) => {
      const consumed = await deleteReturning<{ user_id: string }>(
        manager,
        `DELETE FROM "refresh_tokens"
         WHERE "token_hash" = $1 AND "expires_at" > now()
         RETURNING "user_id"`,
        [tokenHash],
      );
      if (consumed.length === 0) {
        throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
      }

      // The role may have changed since login: take it from the database.
      const user = await manager.findOneBy(User, { id: consumed[0].user_id });
      if (!user) {
        throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
      }
      return this.issueTokens(user, manager);
    });
  }

  /**
   * Revokes one refresh token of the CURRENT user (one DELETE ... RETURNING).
   * A token of another user, or a token that does not exist -> 404.
   */
  async logout(userId: string, refreshToken: string): Promise<void> {
    const revoked = await deleteReturning<{ id: string }>(
      this.dataSource.manager,
      `DELETE FROM "refresh_tokens"
       WHERE "token_hash" = $1 AND "user_id" = $2
       RETURNING "id"`,
      [hashRefreshToken(refreshToken), userId],
    );
    if (revoked.length === 0) {
      throw new NotFoundException('Refresh token not found');
    }
  }

  /** Current user; 401 if the account no longer exists. */
  async me(userId: string): Promise<User> {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }
    return user;
  }

  /**
   * Access token: JWT { sub, role } signed with JWT_ACCESS_SECRET, lives
   * JWT_ACCESS_TTL_MINUTES. Refresh token: random string, its SHA-256 hash is
   * stored with expires_at = now + REFRESH_TOKEN_TTL_DAYS.
   */
  private async issueTokens(
    user: User,
    manager: EntityManager,
  ): Promise<TokensDto> {
    const payload: AccessTokenPayload = { sub: user.id, role: user.role };
    const accessToken = await this.jwtService.signAsync(payload);

    const refreshToken = generateRefreshToken();
    await manager.insert(RefreshToken, {
      userId: user.id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + this.refreshTtlDays * DAY_MS),
    });
    return new TokensDto(accessToken, refreshToken);
  }
}

/**
 * Runs a DELETE ... RETURNING statement and returns the deleted rows.
 * (For DELETE, the TypeORM postgres driver returns [rows, rowCount].)
 */
async function deleteReturning<T>(
  manager: EntityManager,
  sql: string,
  parameters: unknown[],
): Promise<T[]> {
  const [rows] = await manager.query<[T[], number]>(sql, parameters);
  return rows;
}
