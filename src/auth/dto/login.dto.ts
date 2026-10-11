import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsString } from 'class-validator';
import { NormalizeEmail } from './register.dto';

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsNotEmpty()
  @IsString()
  @IsDefined()
  @NormalizeEmail()
  email: string;

  @ApiProperty({ example: 'StrongPass123' })
  @IsNotEmpty()
  @IsString()
  @IsDefined()
  password: string;
}
