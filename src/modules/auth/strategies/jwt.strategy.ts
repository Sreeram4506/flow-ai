import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../../database/prisma.service';
import { JwtPayload, AuthenticatedUser } from '../../../common/types';
import { TtlCache } from '../../../common/utils';

/** Reads the access token from the httpOnly cookie the browser client uses. */
const fromCookie = (req: Request): string | null => req?.cookies?.access_token || null;

// 30s TTL: every authenticated request previously hit the DB for the user row.
// A short cache removes that round-trip; deactivated users still lose access
// within seconds, and token expiry provides the hard cutoff.
const userCache = new TtlCache<AuthenticatedUser | null>(30_000);

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      // The browser frontend authenticates via the httpOnly access_token
      // cookie now (never JS-readable, so it survives an XSS that a
      // localStorage-held token would not); the Bearer header is kept for
      // non-browser API clients (scripts, Swagger "Authorize") that don't
      // carry cookies.
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        fromCookie,
      ]),
      ignoreExpiration: false,
      // getOrThrow, not get: JWT_SECRET is a required env var (validated at
      // startup by the Zod schema in configuration.ts), so the only way this
      // could resolve to undefined is a config bug — better to fail loudly
      // than let TypeScript widen it to `string | undefined` and paper over
      // that with a cast.
      secretOrKey: configService.getOrThrow<string>('jwt.secret'),
    });
  }

  async validate(payload: JwtPayload): Promise<AuthenticatedUser> {
    const cached = userCache.get(payload.sub);
    if (cached !== undefined) return cached as AuthenticatedUser;

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isSuperAdmin: true,
        isActive: true,
        isEmailVerified: true,
      },
    });

    if (!user || !user.isActive) {
      userCache.set(payload.sub, null);
      return null as any;
    }

    const authUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      isSuperAdmin: user.isSuperAdmin,
      isEmailVerified: user.isEmailVerified,
    };
    userCache.set(payload.sub, authUser);
    return authUser;
  }
}
