import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Strategy, StrategyOptions, VerifyCallback } from 'passport-google-oauth20';
import { AuthService } from '../auth.service';

/**
 * Registered unconditionally so the app boots the same way regardless of
 * whether OAuth is configured — passport-google-oauth20 throws in its own
 * constructor if clientID/clientSecret/callbackURL are missing, so an
 * unconfigured deployment gets placeholder values here instead of a crash at
 * startup. Hitting `/api/auth/google` in that state redirects to Google,
 * which rejects the request; the failure surfaces there, not as a boot loop.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  private readonly logger = new Logger(GoogleStrategy.name);
  readonly configured: boolean;

  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    const clientID = configService.get<string>('oauth.google.clientId');
    const clientSecret = configService.get<string>('oauth.google.clientSecret');
    const callbackURL =
      configService.get<string>('oauth.google.callbackUrl') || 'http://localhost:3000/api/auth/google/callback';

    const options: StrategyOptions = {
      clientID: clientID || 'not-configured',
      clientSecret: clientSecret || 'not-configured',
      callbackURL,
      scope: ['email', 'profile'],
    };
    super(options);
    this.configured = !!(clientID && clientSecret);
    if (!this.configured) {
      this.logger.warn('GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET are not set — Google login will fail at the provider.');
    }
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any, done: VerifyCallback): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        return done(new Error('Google account has no accessible email address'), false);
      }
      const result = await this.authService.handleOAuthLogin({
        provider: 'google',
        providerId: profile.id,
        email,
        firstName: profile.name?.givenName || profile.displayName || 'Google',
        lastName: profile.name?.familyName || '',
        avatar: profile.photos?.[0]?.value,
      });
      done(null, result);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
