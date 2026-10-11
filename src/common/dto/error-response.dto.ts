import { ApiProperty } from '@nestjs/swagger';

/** Shape of every error response (produced by AllExceptionsFilter). */
export class ErrorResponseDto {
  @ApiProperty({ type: 'integer', example: 404 })
  statusCode: number;

  @ApiProperty({
    oneOf: [
      { type: 'string', example: 'Film with id ... not found' },
      { type: 'array', items: { type: 'string' } },
    ],
    description:
      'A single message, or a list of validation messages for 400 errors',
  })
  message: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error: string;

  @ApiProperty({
    example: '/films/00000000-0000-4000-8000-000000000000',
    description: 'Path of the request (with query string)',
  })
  path: string;

  @ApiProperty({ example: '2030-01-15T18:00:00.000Z' })
  timestamp: string;
}
