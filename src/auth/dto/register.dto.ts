import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** "  User@Example.COM " -> "user@example.com"; other types pass unchanged. */
export const NormalizeEmail = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );

/**
 * Registration body. There is no `role` field: with whitelist validation a
 * role sent by the client is stripped, so a new user is always "user".
 */
export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail({}, { message: 'email must be a valid email address' })
  @IsString()
  @IsDefined()
  @NormalizeEmail()
  email: string;

  @ApiProperty({
    example: 'StrongPass123',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters (bcrypt uses at most 72)',
  })
  @MaxLength(72, { message: 'password must be at most 72 characters long' })
  @MinLength(8, { message: 'password must be at least 8 characters long' })
  @IsString()
  @IsDefined()
  password: string;
}
