import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ErrorResponseDto } from '../dto/error-response.dto';

/**
 * Global exception filter: every error response has the same structure
 * { statusCode, message, error, path, timestamp }.
 *
 * - HttpException (incl. validation errors from ValidationPipe): status and
 *   message are taken from the exception.
 * - Anything else (e.g. an unexpected database error) becomes 500 with a
 *   generic message; the details are only logged, never sent to the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = exception.name;
      } else {
        const { message: msg, error: err } = body as {
          message?: string | string[];
          error?: string;
        };
        message = msg ?? exception.message;
        error = err ?? exception.name;
      }
    } else {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponseDto = {
      statusCode,
      message,
      error,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(payload);
  }
}
