import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../../database/prisma.service';
import { JwtPayload, AuthenticatedUser } from '../../../common/types';
import { TtlCache } from '../../../common/utils';

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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get('jwt.secret'),
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
