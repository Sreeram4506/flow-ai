import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Request, Response, NextFunction } from 'express';

export const REQUEST_ID_HEADER = 'x-request-id';

declare module 'express-serve-static-core' {
  interface Request {
    /** Correlation ID for this request, set by RequestIdMiddleware. */
    requestId?: string;
  }
}

/**
 * Assigns every request a correlation ID and echoes it back on the response.
 *
 * Without this, logs from concurrent requests interleave with no way to tell
 * which lines belong together — the thing you most need when debugging a
 * production incident. An upstream ID (from a load balancer or gateway) is
 * honoured when present so a trace can be followed across services; otherwise
 * we mint one.
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const requestId =
      (Array.isArray(incoming) ? incoming[0] : incoming)?.trim() || randomUUID();

    req.requestId = requestId;
    res.setHeader(REQUEST_ID_HEADER, requestId);

    next();
  }
}
