import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Delete,
  Param,
  HttpCode,
  HttpStatus,
  Res,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';
import { randomBytes } from 'crypto';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  MagicLinkDto,
  VerifyMagicLinkDto,
  VerifyEmailDto,
  Setup2FADto,
  Verify2FADto,
} from './dto';
import { CurrentUser, Public } from '../../common/decorators';

const isProd = process.env.NODE_ENV === 'production';
/** Same registrable-site deployments (api.example.com + app.example.com) still send Lax cookies cross-subdomain; only a genuinely different domain needs SameSite=None (and Secure is then mandatory). */
const COOKIE_SAME_SITE: 'strict' | 'lax' = isProd ? 'strict' : 'lax';
const REFRESH_COOKIE_PATH = '/api/auth';

/**
 * Per-route rate limits for credential-accepting endpoints.
 *
 * The app-wide default is 100 requests / 60s, which is far too generous for
 * auth: it permits ~144k password guesses a day from a single IP. These are
 * the per-IP ceilings for the endpoints an attacker actually targets. They
 * work alongside the per-account lockout in AuthService — the throttle caps
 * one source, the lockout protects one account from a distributed attempt.
 */
const THROTTLE_LOGIN = { default: { limit: 5, ttl: 60_000 } };
const THROTTLE_REGISTER = { default: { limit: 5, ttl: 3_600_000 } };
// Anything that sends an email is also an outbound-spam vector, not just a
// guessing vector — keep these tight regardless of credential risk.
const THROTTLE_EMAIL_SEND = { default: { limit: 3, ttl: 900_000 } };
const THROTTLE_TOKEN_SUBMIT = { default: { limit: 10, ttl: 900_000 } };

@ApiTags('Authentication')
@Controller('api/auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  // ---- Cookie helpers ----
  //
  // Access/refresh tokens are delivered as httpOnly cookies rather than in the
  // JSON body: a token in the body is briefly visible to page JavaScript (and
  // to anything monkey-patching fetch/XHR under XSS) the moment the response
  // arrives, and historically this app went on to persist that same value in
  // localStorage, where it lived indefinitely and was fully readable by any
  // injected script. An httpOnly cookie is never exposed to JS at all, at any
  // point. `refresh_token` is additionally scoped to /api/auth so it isn't
  // attached to every other API call.

  private cookieMaxAge(token: string, fallbackMs: number): number {
    const decoded = this.jwtService.decode(token) as { exp?: number } | null;
    if (decoded?.exp) return Math.max(0, decoded.exp * 1000 - Date.now());
    return fallbackMs;
  }

  private setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
    res.cookie('access_token', accessToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: COOKIE_SAME_SITE,
      path: '/',
      maxAge: this.cookieMaxAge(accessToken, 15 * 60 * 1000),
    });
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: COOKIE_SAME_SITE,
      path: REFRESH_COOKIE_PATH,
      maxAge: this.cookieMaxAge(refreshToken, 7 * 24 * 60 * 60 * 1000),
    });
    // Deliberately NOT httpOnly: the frontend reads this value and echoes it
    // back as the x-csrf-token header (double-submit CSRF defense, see
    // CsrfMiddleware). It is not a credential on its own — it's only useful
    // paired with the httpOnly cookies above, which a cross-origin page can
    // never read.
    res.cookie('csrf_token', randomBytes(24).toString('hex'), {
      httpOnly: false,
      secure: isProd,
      sameSite: COOKIE_SAME_SITE,
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }

  private clearAuthCookies(res: Response): void {
    res.clearCookie('access_token', { path: '/' });
    res.clearCookie('refresh_token', { path: REFRESH_COOKIE_PATH });
    res.clearCookie('csrf_token', { path: '/' });
  }

  // ---- Registration & Login ----

  @Public()
  @Throttle(THROTTLE_REGISTER)
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, ...body } = await this.authService.register(dto);
    this.setAuthCookies(res, accessToken, refreshToken);
    return body;
  }

  @Public()
  @Throttle(THROTTLE_LOGIN)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many attempts — temporarily locked' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, ...body } = await this.authService.login(dto);
    // 2FA-pending responses carry empty tokens (see AuthService.login) — no
    // session exists yet, so nothing to set until verify2FA succeeds.
    if (accessToken && refreshToken) this.setAuthCookies(res, accessToken, refreshToken);
    return body;
  }

  @Public()
  @Throttle(THROTTLE_TOKEN_SUBMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token (reads refresh_token cookie; body field is a fallback for non-browser clients)' })
  async refreshTokens(
    @Body() dto: RefreshTokenDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.refresh_token || dto.refreshToken;
    if (!refreshToken) {
      this.clearAuthCookies(res);
      throw new UnauthorizedException('No refresh token provided');
    }
    const tokens = await this.authService.refreshTokens(refreshToken);
    this.setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { message: 'Token refreshed' };
  }

  // ---- Logout ----

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') refreshToken?: string,
  ) {
    const token = req.cookies?.refresh_token || refreshToken;
    await this.authService.logout(userId, token);
    this.clearAuthCookies(res);
    return { message: 'Logged out' };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@CurrentUser('id') userId: string, @Res({ passthrough: true }) res: Response) {
    await this.authService.logoutAll(userId);
    this.clearAuthCookies(res);
    return { message: 'Logged out from all devices' };
  }

  // ---- Password ----

  @Public()
  @Throttle(THROTTLE_EMAIL_SEND)
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Throttle(THROTTLE_TOKEN_SUBMIT)
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change password (authenticated)' })
  async changePassword(
    @CurrentUser('id') userId: string,
    @Body() dto: ChangePasswordDto,
  ) {
    return this.authService.changePassword(userId, dto);
  }

  // ---- Magic Link ----

  @Public()
  @Throttle(THROTTLE_EMAIL_SEND)
  @Post('magic-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send magic login link' })
  async sendMagicLink(@Body() dto: MagicLinkDto) {
    return this.authService.sendMagicLink(dto);
  }

  @Public()
  @Throttle(THROTTLE_TOKEN_SUBMIT)
  @Post('magic-link/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify magic link and login' })
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, ...rest } = await this.authService.verifyMagicLink(dto.token);
    this.setAuthCookies(res, accessToken, refreshToken);
    return rest;
  }

  // ---- Email Verification ----

  @Public()
  @Throttle(THROTTLE_TOKEN_SUBMIT)
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify email address' })
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.authService.verifyEmail(dto.token);
  }

  // ---- 2FA ----

  @Post('2fa/setup')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Start 2FA setup – returns QR code' })
  async setup2FA(@CurrentUser('id') userId: string) {
    return this.authService.setup2FA(userId);
  }

  @Post('2fa/enable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Enable 2FA by verifying TOTP code' })
  async enable2FA(@CurrentUser('id') userId: string, @Body() dto: Setup2FADto) {
    return this.authService.enable2FA(userId, dto.code);
  }

  @Public()
  // A TOTP code is only 6 digits — without a limit the whole keyspace is
  // walkable in minutes, which would defeat the point of having 2FA at all.
  @Throttle(THROTTLE_LOGIN)
  @Post('2fa/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify 2FA code during login' })
  async verify2FA(@Body() body: { tempToken: string; code: string }, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshToken, ...rest } = await this.authService.verify2FA(body.tempToken, body.code);
    this.setAuthCookies(res, accessToken, refreshToken);
    return rest;
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2FA(@CurrentUser('id') userId: string, @Body() dto: Verify2FADto) {
    return this.authService.disable2FA(userId, dto.code);
  }

  // ---- OAuth ----
  //
  // The callback previously just `return user`ed — raw JSON with the tokens
  // sitting in the response body, no redirect back into the app at all. That
  // was flagged as unbuilt rather than broken: no Passport strategy was even
  // registered for either provider, so hitting these routes threw an "unknown
  // strategy" 500 and the frontend's Google/GitHub buttons were disabled with
  // a tooltip rather than wired to them. Real strategies now exist
  // (google.strategy.ts / github.strategy.ts); the callback below issues the
  // same httpOnly cookies the password/magic-link/2FA flows do and redirects
  // into the dashboard — never tokens in a URL, which query strings and
  // Referer headers would otherwise leak into server logs and browser
  // history.

  @Public()
  @Get('google')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Login with Google' })
  async googleAuth() {
    // Guard redirects to Google
  }

  @Public()
  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  @ApiOperation({ summary: 'Google OAuth callback' })
  async googleCallback(@CurrentUser() user: any, @Res() res: Response) {
    this.completeOAuthLogin(user, res);
  }

  @Public()
  @Get('github')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'Login with GitHub' })
  async githubAuth() {
    // Guard redirects to GitHub
  }

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  async githubCallback(@CurrentUser() user: any, @Res() res: Response) {
    this.completeOAuthLogin(user, res);
  }

  private completeOAuthLogin(user: any, res: Response): void {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:3001';
    if (!user?.accessToken || !user?.refreshToken) {
      res.redirect(`${frontendUrl}/login?error=oauth_failed`);
      return;
    }
    this.setAuthCookies(res, user.accessToken, user.refreshToken);
    res.redirect(`${frontendUrl}/dashboard`);
  }

  // ---- Profile ----

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  // ---- Sessions & Devices ----

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List active sessions' })
  async getSessions(@CurrentUser('id') userId: string) {
    return this.authService.getSessions(userId);
  }

  @Delete('sessions/:sessionId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke a session' })
  async revokeSession(
    @CurrentUser('id') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.authService.revokeSession(userId, sessionId);
  }

  @Get('devices')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List registered devices' })
  async getDevices(@CurrentUser('id') userId: string) {
    return this.authService.getDevices(userId);
  }

  @Delete('devices/:deviceId')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove a device' })
  async removeDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.authService.removeDevice(userId, deviceId);
  }
}
