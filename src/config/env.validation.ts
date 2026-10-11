import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/** "5432" -> 5432; anything that is not a plain integer stays as is (and fails IsInt). */
const toInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value.trim())
    ? Number(value.trim())
    : value;

const required = { message: '$property is required' };

/** "true"/"false" -> boolean; anything else stays as is (and fails IsBoolean). */
const toBoolean = ({ value }: { value: unknown }): unknown => {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

/**
 * Environment variables of the application. Described with the same
 * class-validator decorators as the DTOs and checked once at startup:
 * if a database parameter is missing or invalid, the application does not start.
 */
export class EnvironmentVariables {
  @Max(65535)
  @Min(1)
  @IsInt()
  @IsOptional()
  @Transform(toInt)
  PORT: number = 3000;

  @IsNotEmpty()
  @IsString()
  @IsDefined(required)
  DB_HOST: string;

  @Max(65535)
  @Min(1)
  @IsInt()
  @IsDefined(required)
  @Transform(toInt)
  DB_PORT: number;

  @IsNotEmpty()
  @IsString()
  @IsDefined(required)
  DB_USERNAME: string;

  // May be empty (e.g. trust authentication), but must be present.
  @IsString()
  @IsDefined(required)
  DB_PASSWORD: string;

  @IsNotEmpty()
  @IsString()
  @IsDefined(required)
  DB_NAME: string;

  /** Log SQL queries to the console. */
  @IsBoolean()
  @IsOptional()
  @Transform(toBoolean)
  DB_LOGGING: boolean = false;

  // ---------- authentication (HW4) ----------

  /** Secret that signs access tokens (HS256). At least 32 characters. */
  @MinLength(32, { message: '$property must be at least 32 characters long' })
  @IsString()
  @IsDefined(required)
  JWT_ACCESS_SECRET: string;

  /** Access token lifetime in MINUTES (short-lived: 1 minute .. 24 hours). */
  @Max(1440)
  @Min(1)
  @IsInt()
  @IsDefined(required)
  @Transform(toInt)
  JWT_ACCESS_TTL_MINUTES: number;

  /** Refresh token lifetime in DAYS (1 .. 365). */
  @Max(365)
  @Min(1)
  @IsInt()
  @IsDefined(required)
  @Transform(toInt)
  REFRESH_TOKEN_TTL_DAYS: number;

  /** bcrypt cost factor (work = 2^rounds). 10 by default; tests use 4. */
  @Max(15)
  @Min(4)
  @IsInt()
  @IsOptional()
  @Transform(toInt)
  BCRYPT_SALT_ROUNDS: number = 10;

  /** First administrator, created by `npm run seed` (not needed by the API). */
  @IsEmail({}, { message: '$property must be an email' })
  @IsOptional()
  ADMIN_EMAIL?: string;

  @MaxLength(72, { message: '$property must be at most 72 characters long' })
  @MinLength(8, { message: '$property must be at least 8 characters long' })
  @IsString()
  @IsOptional()
  ADMIN_PASSWORD?: string;
}

/**
 * Used by ConfigModule.forRoot({ validate }) and by the TypeORM CLI data source.
 * Decorators run bottom-up and stop at the first failure (presence, type, range).
 * Returns the typed, converted config or throws with every problem listed.
 */
export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config);
  const errors = validateSync(validated, {
    skipMissingProperties: false,
    stopAtFirstError: true,
  });
  if (errors.length > 0) {
    const details = errors
      .map((e) => Object.values(e.constraints ?? {}).join(', '))
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return validated;
}
