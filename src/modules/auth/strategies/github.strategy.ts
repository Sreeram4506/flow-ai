import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, StrategyOptions } from 'passport-github2';
import { AuthService } from '../auth.service';

/** See google.strategy.ts for why this registers unconditionally with placeholder values when unconfigured. */
@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GithubStrategy.name);
  readonly configured: boolean;

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get<string>('oauth.github.clientId');
    const clientSecret = configService.get<string>('oauth.github.clientSecret');
    const callbackURL =
      configService.get<string>('oauth.github.callbackUrl') || 'http://localhost:3000/api/auth/github/callback';

    const options: StrategyOptions = {
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['user:email'],
    };
    super(options);
    this.configured = !!(clientID && clientSecret);
    if (!this.configured) {
      this.logger.warn('GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET are not set — GitHub login will fail at the provider.');
    }
  }

  async validate(
    _accessToken: string,
    _refreshToken: string,
    profile: any,
    done: (err: Error | null, user?: any) => void,
  ): Promise<void> {
    try {
      // GitHub only guarantees a public email if the account has one and it's
      // not marked private; profile.emails may be absent even for a real
      // account, so this is a legitimate case to reject rather than a bug.
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('GitHub account has no public email address — add one at github.com/settings/emails'), false);
      }
      const [firstName, ...rest] = (profile.displayName || profile.username || 'GitHub User').split(' ');
      const result = await this.authService.handleOAuthLogin({
        provider: 'github',
        providerId: String(profile.id),
        email,
        firstName: firstName || profile.username || 'GitHub',
        lastName: rest.join(' '),
        avatar: profile.photos?.[0]?.value,
      });
      done(null, result);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
