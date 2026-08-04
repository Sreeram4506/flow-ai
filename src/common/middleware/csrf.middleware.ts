import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

// Routes that authenticate with credentials (password, magic-link token,
// OAuth) rather than an existing session cookie. There is no csrf_token
// cookie yet on the first of these calls, so double-submit has nothing to
// compare against — and a forged cross-site request is in exactly the same
// position, since it can't supply valid credentials either.
const EXEMPT_PREFIXES = [
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout', // logout should succeed even with a stale/missing csrf cookie
  '/api/auth/magic-link',
  '/api/auth/2fa/verify',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-email',
  '/api/auth/google',
  '/api/auth/github',
  '/api/content/public',
  '/api/orchestrator/emails/inbound', // inbound-email webhook, not a browser session
];

/**
 * Double-submit CSRF defense for cookie-authenticated requests.
 *
 * SameSite=Lax/Strict on the auth cookies already blocks the classic
 * cross-site form/XHR CSRF vector in current browsers, but this is
 * defense-in-depth (older browsers, and any future SameSite=None deployment
 * where frontend and backend live on genuinely different domains). Login,
 * register and refresh set a non-httpOnly `csrf_token` cookie alongside the
 * httpOnly auth cookies; the frontend echoes its value back as the
 * `x-csrf-token` header on every mutating request. A cross-origin attacker's
 * page can make the browser attach the cookie automatically, but — being a
 * different origin — cannot read its value to also set the header.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method)) return next();
    // req.path/req.url are NOT reliable here: Nest mounts a forRoutes('*')
    // middleware the way Express mounts a sub-router, which rewrites req.url
    // relative to the mount point for the duration of this middleware layer —
    // in practice that made req.path read as "/" for every request,
    // regardless of the real route. req.originalUrl is untouched by that
    // rewriting and always holds the actual path the client requested.
    const path = req.originalUrl.split('?')[0];
    if (EXEMPT_PREFIXES.some((prefix) => path.startsWith(prefix))) return next();

    // Only cookie-authenticated requests carry a csrf_token cookie at all. A
    // Bearer-token API client (scripts, Swagger "Authorize") never receives
    // one, so it has nothing to double-submit — the Authorization header it
    // must supply out-of-band is itself proof of intent, same as before this
    // middleware existed.
    const cookieToken = req.cookies?.csrf_token;
    if (!cookieToken) return next();

    const headerToken = req.headers['x-csrf-token'];
    if (headerToken && headerToken === cookieToken) return next();

    throw new ForbiddenException('Missing or invalid CSRF token');
  }
}
