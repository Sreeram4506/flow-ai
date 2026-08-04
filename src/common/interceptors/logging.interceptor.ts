import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';

/**
 * Access logging for every HTTP request.
 *
 * Two behaviours worth knowing about:
 *
 * 1. In production it emits single-line JSON so a log aggregator can index and
 *    query the fields (status, duration, userId, requestId) directly. In
 *    development it stays human-readable. It was interpolated text in both
 *    before, which is effectively unqueryable once you run more than one
 *    instance.
 *
 * 2. It logs failed requests too. The previous version only had a success
 *    handler, so any request that threw produced no access-log line at all —
 *    exactly the requests you most want a record of.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');
  private readonly isProduction = process.env.NODE_ENV === 'production';

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const { method, url, ip } = request;
    const userAgent = request.get('user-agent') || '';
    const startedAt = Date.now();

    // Resolved lazily: guards populate request.user *after* this interceptor
    // runs its setup, so reading it upfront would always yield 'anonymous'.
    const baseFields = () => ({
      requestId: request.requestId,
      method,
      url,
      ip,
      userAgent,
      userId: request.user?.id ?? 'anonymous',
      organizationId: request.user?.organizationId,
    });

    return next.handle().pipe(
      tap(() => {
        const statusCode = context.switchToHttp().getResponse().statusCode;
        this.write('log', {
          ...baseFields(),
          statusCode,
          durationMs: Date.now() - startedAt,
        });
      }),
      catchError((err) => {
        const statusCode = err?.status ?? err?.statusCode ?? 500;
        this.write(statusCode >= 500 ? 'error' : 'warn', {
          ...baseFields(),
          statusCode,
          durationMs: Date.now() - startedAt,
          error: err?.message,
        });
        return throwError(() => err);
      }),
    );
  }

  private write(level: 'log' | 'warn' | 'error', fields: Record<string, unknown>): void {
    if (this.isProduction) {
      this.logger[level](JSON.stringify(fields));
      return;
    }

    const { method, url, statusCode, durationMs, userId, requestId, error } =
      fields as Record<string, any>;
    const shortId = requestId ? String(requestId).slice(0, 8) : '-';
    const suffix = error ? ` — ${error}` : '';
    this.logger[level](
      `${method} ${url} ${statusCode} ${durationMs}ms - ${userId} - ${shortId}${suffix}`,
    );
  }
}
