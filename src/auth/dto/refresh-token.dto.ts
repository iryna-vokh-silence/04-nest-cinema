import { ApiProperty } from '@nestjs/swagger';
import { IsDefined, IsNotEmpty, IsString } from 'class-validator';

/** Body of POST /auth/refresh and POST /auth/logout. */
export class RefreshTokenDto {
  @ApiProperty({
    example: 'kq3J6v1oT0Yl0c2m3n4b5v6c7x8z9a0s1d2f3g4h5j6',
    description: 'Refresh token received from /auth/login or /auth/refresh',
  })
  @IsNotEmpty()
  @IsString()
  @IsDefined()
  refreshToken: string;
}
