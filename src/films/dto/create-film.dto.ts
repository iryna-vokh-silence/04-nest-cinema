import { ApiProperty } from '@nestjs/swagger';
import {
  IsDefined,
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

// Note: class-validator runs the decorators closest to the property first
// (bottom-up), and with stopAtFirstError only the first failure is reported.
// So the type check sits at the bottom and range checks above it.
export class CreateFilmDto {
  @ApiProperty({
    example: 'Interstellar',
    maxLength: MAX_TITLE_LENGTH,
    description: 'Surrounding spaces are trimmed; must not be blank',
  })
  @MaxLength(MAX_TITLE_LENGTH)
  @IsNotEmpty()
  @IsString()
  @IsDefined()
  @Trim()
  title: string;

  @ApiProperty({
    type: 'integer',
    example: 169,
    minimum: 1,
    maximum: MAX_DURATION_MINUTES,
  })
  @Max(MAX_DURATION_MINUTES)
  @Min(1)
  @IsInt()
  @IsDefined()
  durationMinutes: number;

  @ApiProperty({
    type: 'integer',
    example: 2014,
    minimum: MIN_RELEASE_YEAR,
    maximum: MAX_RELEASE_YEAR,
  })
  @Max(MAX_RELEASE_YEAR)
  @Min(MIN_RELEASE_YEAR)
  @IsInt()
  @IsDefined()
  releaseYear: number;
}
