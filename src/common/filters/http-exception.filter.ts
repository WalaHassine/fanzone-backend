import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

import { redactPath } from '../utils';

/**
 * Global HTTP Exception Filter
 * - Catches thrown exceptions and returns a consistent JSON shape
 * - Logs the error for observability
 *
 * The URL is redacted in both the log line and the `path` it echoes back: path
 * UUIDs include the check-in session token, which is a read credential for a
 * public route. See `redactPath` for the reasoning.
 *
 * TODO: expand error mapping / add correlation ids as needed.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    const path = redactPath(request.url);

    this.logger.error(`${request.method} ${path} -> ${status}`);

    response.status(status).json({
      statusCode: status,
      path,
      timestamp: new Date().toISOString(),
      message,
    });
  }
}
