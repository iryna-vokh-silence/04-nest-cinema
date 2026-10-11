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
  MAX_HALL_NAME_LENGTH,
  MAX_ROWS,
  MAX_SEATS_PER_ROW,
} from '../../common/limits';
import { Trim } from '../../common/transforms/trim.transform';

// Decorators run bottom-up; with stopAtFirstError only the first failure
// (type before range) is reported.
export class CreateHallDto {
  @ApiProperty({
    example: 'Red Hall',
    maxLength: MAX_HALL_NAME_LENGTH,
    description:
      'Unique (case-insensitive); surrounding spaces are trimmed; must not be blank',
  })
  @MaxLength(MAX_HALL_NAME_LENGTH)
  @IsNotEmpty()
  @IsString()
  @IsDefined()
  @Trim()
  name: string;

  @ApiProperty({ type: 'integer', example: 3, minimum: 1, maximum: MAX_ROWS })
  @Max(MAX_ROWS)
  @Min(1)
  @IsInt()
  @IsDefined()
  rows: number;

  @ApiProperty({
    type: 'integer',
    example: 5,
    minimum: 1,
    maximum: MAX_SEATS_PER_ROW,
  })
  @Max(MAX_SEATS_PER_ROW)
  @Min(1)
  @IsInt()
  @IsDefined()
  seatsPerRow: number;
}
