import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

import { redactPath } from '../../utils';

/**
 * Global Logging Interceptor
 * - Logs each incoming request and its response time
 *
 * The URL is redacted before it is logged: path UUIDs include the check-in
 * session token, which is a read credential for a public route. See
 * `redactPath` for the reasoning.
 *
 * TODO: enrich with user/context info as needed.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Typed, like the exception filter's: the argless `getRequest()` returns
    // `any`, which spreads untyped values into the log line below.
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const now = Date.now();

    return next
      .handle()
      .pipe(
        tap(() =>
          this.logger.log(
            `${method} ${redactPath(url)} - ${Date.now() - now}ms`,
          ),
        ),
      );
  }
}
