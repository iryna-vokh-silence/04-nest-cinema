import { ApiProperty } from '@nestjs/swagger';

/** A token pair returned by /auth/login and /auth/refresh. */
export class TokensDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description:
      'Short-lived JWT (minutes). Send it as "Authorization: Bearer <accessToken>".',
  })
  accessToken: string;

  @ApiProperty({
    example: 'kq3J6v1oT0Yl0c2m3n4b5v6c7x8z9a0s1d2f3g4h5j6',
    description:
      'Long-lived opaque token (days). Single use: /auth/refresh consumes it and returns a new pair.',
  })
  refreshToken: string;

  constructor(accessToken: string, refreshToken: string) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }
}
