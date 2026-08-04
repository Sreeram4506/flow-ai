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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Throttle } from '@nestjs/throttler';
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
  constructor(private readonly authService: AuthService) {}

  // ---- Registration & Login ----

  @Public()
  @Throttle(THROTTLE_REGISTER)
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle(THROTTLE_LOGIN)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many attempts — temporarily locked' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle(THROTTLE_TOKEN_SUBMIT)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshTokens(@Body() dto: RefreshTokenDto) {
    return this.authService.refreshTokens(dto.refreshToken);
  }

  // ---- Logout ----

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  async logout(
    @CurrentUser('id') userId: string,
    @Body('refreshToken') refreshToken?: string,
  ) {
    return this.authService.logout(userId, refreshToken);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout from all devices' })
  async logoutAll(@CurrentUser('id') userId: string) {
    return this.authService.logoutAll(userId);
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
  async verifyMagicLink(@Body() dto: VerifyMagicLinkDto) {
    return this.authService.verifyMagicLink(dto.token);
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
  async verify2FA(@Body() body: { tempToken: string; code: string }) {
    return this.authService.verify2FA(body.tempToken, body.code);
  }

  @Post('2fa/disable')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disable 2FA' })
  async disable2FA(@CurrentUser('id') userId: string, @Body() dto: Verify2FADto) {
    return this.authService.disable2FA(userId, dto.code);
  }

  // ---- OAuth ----

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
  async googleCallback(@CurrentUser() user: any) {
    return user;
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
  async githubCallback(@CurrentUser() user: any) {
    return user;
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
