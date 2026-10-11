import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  CALENDAR_DATE_REGEX,
  IsCalendarDate,
} from '../../common/validators/is-calendar-date.decorator';

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

/**
 * Query strings arrive as text. Only plain digit strings become numbers;
 * anything else ("abc", "1.5", "1e2", "", repeated params) is left as is and
 * rejected by @IsInt() with 400.
 */
const toStrictInt = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;

// Decorators run bottom-up; with stopAtFirstError only the first failure
// is reported (type before range).
export class FindShowingsQueryDto {
  @ApiPropertyOptional({
    format: 'uuid',
    example: '3f2b8c1e-7a4d-4e9b-9c1a-2d5e6f7a8b9c',
    description: 'Only showings of this film',
  })
  @IsUUID()
  @IsOptional()
  filmId?: string;

  @ApiPropertyOptional({
    example: '2030-01-15',
    description:
      'Only showings starting on this day (YYYY-MM-DD, compared in UTC)',
  })
  @IsOptional()
  // Bottom-up: the format check runs first, then the real-date check.
  @IsCalendarDate()
  @Matches(CALENDAR_DATE_REGEX, { message: 'date must match YYYY-MM-DD' })
  date?: string;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    default: DEFAULT_PAGE,
    example: 1,
    description: 'Page number, starting from 1',
  })
  @Min(1)
  @IsInt()
  @IsOptional()
  @Transform(toStrictInt)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    type: 'integer',
    minimum: 1,
    maximum: MAX_LIMIT,
    default: DEFAULT_LIMIT,
    example: 20,
    description: `Page size, 1–${MAX_LIMIT}`,
  })
  @Max(MAX_LIMIT)
  @Min(1)
  @IsInt()
  @IsOptional()
  @Transform(toStrictInt)
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({
    enum: SORT_ORDERS,
    default: 'asc',
    description:
      'Order by start time; showings with the same start time are ordered by id',
  })
  @IsIn(SORT_ORDERS, { message: 'sort must be one of: asc, desc' })
  @IsOptional()
  sort: SortOrder = 'asc';
}
