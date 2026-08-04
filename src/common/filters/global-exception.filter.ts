import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
  method: string;
  /** Correlation ID — lets a user quote one value that finds the exact log line. */
  requestId?: string;
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction = process.env.NODE_ENV === 'production';

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = request.requestId;

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const res = exceptionResponse as any;
        message = res.message || exception.message;
        error = res.error || 'Error';
      }
    } else if (exception instanceof Error) {
      // Anything reaching here is an unhandled internal fault. The raw message
      // routinely contains implementation detail — Prisma emits the failing
      // query and connection info, for instance — so it must not be returned
      // to the caller in production. Log it in full, return something generic,
      // and let the requestId join the two together.
      this.logger.error(
        JSON.stringify({
          requestId,
          path: request.url,
          method: request.method,
          message: exception.message,
        }),
        exception.stack,
      );

      message = this.isProduction
        ? 'An unexpected error occurred. Quote the requestId when reporting this.'
        : exception.message;
    }

    const errorResponse: ErrorResponse = {
      statusCode,
      message,
      error,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      requestId,
    };

    response.status(statusCode).json(errorResponse);
  }
}
