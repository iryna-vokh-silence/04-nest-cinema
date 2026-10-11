import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsDefined,
  IsObject,
  ValidateNested,
} from 'class-validator';
import { Seat } from '../../common/seat';

/** Identifier used to detect duplicate seats; tolerant to malformed items. */
function seatIdentifier(item: unknown): string {
  if (item && typeof item === 'object') {
    const { row, seat } = item as Partial<Seat>;
    return `${String(row)}:${String(seat)}`;
  }
  return JSON.stringify(item);
}

export class CreateBookingDto {
  @ApiProperty({
    type: Seat,
    isArray: true,
    minItems: 1,
    description:
      'Seats to book; must be non-empty and without duplicates. Every seat must be inside the hall.',
    example: [
      { row: 1, seat: 1 },
      { row: 1, seat: 2 },
    ],
  })
  // Decorators run bottom-up and stop at the first failure, so the duplicate
  // check only runs for a non-empty array of objects.
  @ValidateNested({ each: true })
  @ArrayUnique(seatIdentifier, {
    message: 'seats must not contain duplicate seats',
  })
  @IsObject({ each: true, message: 'each seat must be an object {row, seat}' })
  @ArrayNotEmpty({ message: 'seats must contain at least one seat' })
  @IsArray({ message: 'seats must be an array of {row, seat} objects' })
  @IsDefined()
  @Type(() => Seat)
  seats: Seat[];
}
