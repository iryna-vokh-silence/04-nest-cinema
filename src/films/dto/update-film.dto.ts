import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MAX_DURATION_MINUTES,
  MAX_RELEASE_YEAR,
  MAX_TITLE_LENGTH,
  MIN_RELEASE_YEAR,
} from '../../common/limits';
import { Trim } from '../../common/transforms/trim.transform';
import { IsDefinedIfPresent } from '../../common/validators/is-defined-if-present.decorator';

/** Any subset of film fields. Absent fields are kept, null is rejected. */
export class UpdateFilmDto {
  @ApiPropertyOptional({
    example: 'Interstellar (IMAX)',
    maxLength: MAX_TITLE_LENGTH,
  })
  @MaxLength(MAX_TITLE_LENGTH)
  @IsNotEmpty()
  @IsString()
  @IsDefinedIfPresent()
  @Trim()
  title?: string;

  @ApiPropertyOptional({
    type: 'integer',
    example: 170,
    minimum: 1,
    maximum: MAX_DURATION_MINUTES,
  })
  @Max(MAX_DURATION_MINUTES)
  @Min(1)
  @IsInt()
  @IsDefinedIfPresent()
  durationMinutes?: number;

  @ApiPropertyOptional({
    type: 'integer',
    example: 2014,
    minimum: MIN_RELEASE_YEAR,
    maximum: MAX_RELEASE_YEAR,
  })
  @Max(MAX_RELEASE_YEAR)
  @Min(MIN_RELEASE_YEAR)
  @IsInt()
  @IsDefinedIfPresent()
  releaseYear?: number;
}
