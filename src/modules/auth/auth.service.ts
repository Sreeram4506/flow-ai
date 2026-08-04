import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  ForbiddenException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { PrismaService } from '../../database/prisma.service';
import { RedisService } from '../../database/redis.service';
import { JwtPayload } from '../../common/types';
import {
  RegisterDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  ChangePasswordDto,
  MagicLinkDto,
  AuthResponseDto,
} from './dto';
import { MailService } from './mail.service';

/**
 * Per-account lockout thresholds.
 *
 * The @Throttle limits on the controller are per-IP, so they don't stop a
 * distributed attempt against one account (a botnet with 500 IPs gets 500x
 * the budget). This counts failures per *account* instead, so one targeted
 * user can't be ground down no matter how many sources the attacker has.
 */
const MAX_FAILED_LOGINS = 10;
const LOCKOUT_SECONDS = 15 * 60;
const FAILURE_WINDOW_SECONDS = 15 * 60;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly mailService: MailService,
  ) {}

  // ============================================================
  // REGISTER
  // ============================================================

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
      },
    });

    // Generate email verification token
    const verificationToken = uuidv4();
    await this.redis.set(`email-verify:${verificationToken}`, user.id, 86400); // 24h

    // Send verification email via email service
    await this.mailService.sendVerificationEmail(user.email, verificationToken);

    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);
    await this.storeRefreshToken(tokens.refreshToken, user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  // ============================================================
  // LOGIN
  // ============================================================

  async login(dto: LoginDto): Promise<AuthResponseDto & { requires2FA?: boolean }> {
    const email = dto.email.toLowerCase();

    // Checked before touching the DB so a locked account costs an attacker a
    // Redis GET rather than a bcrypt comparison.
    await this.assertNotLockedOut(email);

    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { twoFactorAuth: true },
    });

    if (!user || !user.passwordHash) {
      // Counted even for non-existent accounts, otherwise the lockout itself
      // becomes an account-enumeration oracle (locked = real user).
      await this.recordFailedLogin(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      await this.recordFailedLogin(email);
      throw new UnauthorizedException('Invalid credentials');
    }

    // Successful password check — wipe the failure counter so a legitimate
    // user who fumbled a few times doesn't stay one mistake from a lockout.
    await this.clearFailedLogins(email);

    // Check if 2FA is enabled
    if (user.twoFactorAuth?.isEnabled) {
      const tempToken = uuidv4();
      await this.redis.set(`2fa-pending:${tempToken}`, user.id, 300); // 5 min

      return {
        accessToken: '',
        refreshToken: '',
        requires2FA: true,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          avatar: user.avatar,
          isEmailVerified: user.isEmailVerified,
          isSuperAdmin: user.isSuperAdmin,
        },
      };
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);
    await this.storeRefreshToken(tokens.refreshToken, user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  // ============================================================
  // REFRESH TOKEN
  // ============================================================

  async refreshTokens(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: true },
    });

    if (!storedToken || storedToken.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    // Delete old refresh token (rotation)
    await this.prisma.refreshToken.delete({ where: { id: storedToken.id } });

    const tokens = await this.generateTokens(
      storedToken.user.id,
      storedToken.user.email,
      storedToken.user.isSuperAdmin,
    );
    await this.storeRefreshToken(tokens.refreshToken, storedToken.user.id);

    return tokens;
  }

  // ============================================================
  // LOGOUT
  // ============================================================

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: { token: refreshToken },
      });
    }

    // Invalidate all sessions for this user in Redis cache
    await this.redis.del(`user-session:${userId}`);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: { userId },
    });
    await this.prisma.session.deleteMany({
      where: { userId },
    });
    await this.redis.del(`user-session:${userId}`);
  }

  // ============================================================
  // FORGOT PASSWORD
  // ============================================================

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return { message: 'If the email exists, a reset link has been sent' };
    }

    const token = uuidv4();
    await this.prisma.passwordReset.create({
      data: {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 3600000), // 1 hour
      },
    });

    // Send password reset email
    await this.mailService.sendPasswordResetEmail(user.email, token);

    return { message: 'If the email exists, a reset link has been sent' };
  }

  // ============================================================
  // RESET PASSWORD
  // ============================================================

  async resetPassword(dto: ResetPasswordDto): Promise<{ message: string }> {
    const resetRecord = await this.prisma.passwordReset.findUnique({
      where: { token: dto.token },
    });

    if (!resetRecord || resetRecord.expiresAt < new Date() || resetRecord.usedAt) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      this.prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      // Invalidate all refresh tokens for security
      this.prisma.refreshToken.deleteMany({
        where: { userId: resetRecord.userId },
      }),
    ]);

    return { message: 'Password reset successfully' };
  }

  // ============================================================
  // CHANGE PASSWORD
  // ============================================================

  async changePassword(userId: string, dto: ChangePasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.passwordHash) {
      throw new BadRequestException('Cannot change password for OAuth-only accounts');
    }

    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new UnauthorizedException('Current password is incorrect');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    return { message: 'Password changed successfully' };
  }

  // ============================================================
  // MAGIC LINK
  // ============================================================

  async sendMagicLink(dto: MagicLinkDto): Promise<{ message: string }> {
    let user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      // Auto-create user for magic link
      user = await this.prisma.user.create({
        data: {
          email: dto.email.toLowerCase(),
          firstName: dto.email.split('@')[0],
          lastName: '',
          isEmailVerified: true,
        },
      });
    }

    const token = uuidv4();
    await this.prisma.magicLink.create({
      data: {
        token,
        userId: user.id,
        email: dto.email.toLowerCase(),
        expiresAt: new Date(Date.now() + 600000), // 10 min
      },
    });

    // Send magic link email
    await this.mailService.sendMagicLinkEmail(dto.email, token);

    return { message: 'Magic link sent to your email' };
  }

  async verifyMagicLink(token: string): Promise<AuthResponseDto> {
    const magicLink = await this.prisma.magicLink.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!magicLink || magicLink.expiresAt < new Date() || magicLink.usedAt) {
      throw new BadRequestException('Invalid or expired magic link');
    }

    await this.prisma.$transaction([
      this.prisma.magicLink.update({
        where: { id: magicLink.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: magicLink.userId },
        data: {
          isEmailVerified: true,
          lastLoginAt: new Date(),
        },
      }),
    ]);

    const tokens = await this.generateTokens(
      magicLink.user.id,
      magicLink.user.email,
      magicLink.user.isSuperAdmin,
    );
    await this.storeRefreshToken(tokens.refreshToken, magicLink.user.id);

    return {
      ...tokens,
      user: {
        id: magicLink.user.id,
        email: magicLink.user.email,
        firstName: magicLink.user.firstName,
        lastName: magicLink.user.lastName,
        avatar: magicLink.user.avatar,
        isEmailVerified: true,
        isSuperAdmin: magicLink.user.isSuperAdmin,
      },
    };
  }

  // ============================================================
  // EMAIL VERIFICATION
  // ============================================================

  async verifyEmail(token: string): Promise<{ message: string }> {
    const userId = await this.redis.get(`email-verify:${token}`);
    if (!userId) {
      throw new BadRequestException('Invalid or expired verification token');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { isEmailVerified: true },
    });

    await this.redis.del(`email-verify:${token}`);

    return { message: 'Email verified successfully' };
  }

  // ============================================================
  // 2FA (TOTP)
  // ============================================================

  async setup2FA(userId: string): Promise<{ secret: string; qrCodeUrl: string }> {
    const { authenticator } = await import('otplib');
    const QRCode = await import('qrcode');

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const secret = authenticator.generateSecret();
    const appName = this.configService.get('twoFactor.appName');
    const otpauthUrl = authenticator.keyuri(user.email, appName, secret);

    // Store the secret temporarily until verified
    await this.redis.set(`2fa-setup:${userId}`, secret, 600); // 10 min

    const qrCodeUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeUrl };
  }

  async enable2FA(userId: string, code: string): Promise<{ backupCodes: string[] }> {
    const { authenticator } = await import('otplib');

    const secret = await this.redis.get(`2fa-setup:${userId}`);
    if (!secret) {
      throw new BadRequestException('2FA setup expired. Please start again.');
    }

    const isValid = authenticator.verify({ token: code, secret });
    if (!isValid) {
      throw new BadRequestException('Invalid 2FA code');
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () =>
      Math.random().toString(36).substring(2, 10).toUpperCase(),
    );

    await this.prisma.twoFactorAuth.upsert({
      where: { userId },
      create: {
        userId,
        secret,
        isEnabled: true,
        backupCodes,
      },
      update: {
        secret,
        isEnabled: true,
        backupCodes,
      },
    });

    await this.redis.del(`2fa-setup:${userId}`);

    return { backupCodes };
  }

  async verify2FA(tempToken: string, code: string): Promise<AuthResponseDto> {
    const { authenticator } = await import('otplib');

    const userId = await this.redis.get(`2fa-pending:${tempToken}`);
    if (!userId) {
      throw new BadRequestException('2FA verification expired. Please login again.');
    }

    const twoFactor = await this.prisma.twoFactorAuth.findUnique({
      where: { userId },
    });

    if (!twoFactor) {
      throw new BadRequestException('2FA not configured');
    }

    const isValid = authenticator.verify({ token: code, secret: twoFactor.secret });

    // Check backup codes if TOTP fails
    if (!isValid) {
      const backupIndex = twoFactor.backupCodes.indexOf(code.toUpperCase());
      if (backupIndex === -1) {
        throw new UnauthorizedException('Invalid 2FA code');
      }
      // Remove used backup code
      const updatedCodes = [...twoFactor.backupCodes];
      updatedCodes.splice(backupIndex, 1);
      await this.prisma.twoFactorAuth.update({
        where: { userId },
        data: { backupCodes: updatedCodes },
      });
    }

    await this.redis.del(`2fa-pending:${tempToken}`);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    await this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);
    await this.storeRefreshToken(tokens.refreshToken, user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  async disable2FA(userId: string, code: string): Promise<{ message: string }> {
    const { authenticator } = await import('otplib');

    const twoFactor = await this.prisma.twoFactorAuth.findUnique({
      where: { userId },
    });

    if (!twoFactor) {
      throw new BadRequestException('2FA not configured');
    }

    const isValid = authenticator.verify({ token: code, secret: twoFactor.secret });
    if (!isValid) {
      throw new UnauthorizedException('Invalid 2FA code');
    }

    await this.prisma.twoFactorAuth.delete({ where: { userId } });

    return { message: '2FA disabled successfully' };
  }

  // ============================================================
  // OAUTH HANDLERS
  // ============================================================

  async handleOAuthLogin(profile: {
    provider: 'google' | 'github' | 'microsoft';
    providerId: string;
    email: string;
    firstName: string;
    lastName: string;
    avatar?: string;
  }): Promise<AuthResponseDto> {
    const providerField = `${profile.provider}Id` as 'googleId' | 'githubId' | 'microsoftId';

    // Try to find by provider ID first
    let user = await this.prisma.user.findFirst({
      where: { [providerField]: profile.providerId },
    });

    if (!user) {
      // Try to find by email
      user = await this.prisma.user.findUnique({
        where: { email: profile.email.toLowerCase() },
      });

      if (user) {
        // Link OAuth to existing account
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            [providerField]: profile.providerId,
            isEmailVerified: true,
            avatar: user.avatar || profile.avatar,
          },
        });
      } else {
        // Create new user
        user = await this.prisma.user.create({
          data: {
            email: profile.email.toLowerCase(),
            firstName: profile.firstName,
            lastName: profile.lastName,
            avatar: profile.avatar,
            [providerField]: profile.providerId,
            isEmailVerified: true,
          },
        });
      }
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.isSuperAdmin);
    await this.storeRefreshToken(tokens.refreshToken, user.id);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        avatar: user.avatar,
        isEmailVerified: user.isEmailVerified,
        isSuperAdmin: user.isSuperAdmin,
      },
    };
  }

  // ============================================================
  // SESSION & DEVICE MANAGEMENT
  // ============================================================

  async getSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { lastActiveAt: 'desc' },
    });
  }

  async revokeSession(userId: string, sessionId: string) {
    await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    return { message: 'Session revoked' };
  }

  async getDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  async removeDevice(userId: string, deviceId: string) {
    await this.prisma.device.deleteMany({
      where: { id: deviceId, userId },
    });
    return { message: 'Device removed' };
  }

  // ============================================================
  // CURRENT USER
  // ============================================================

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        avatar: true,
        phone: true,
        timezone: true,
        locale: true,
        isEmailVerified: true,
        isSuperAdmin: true,
        lastLoginAt: true,
        createdAt: true,
        twoFactorAuth: { select: { isEnabled: true } },
        organizationMembers: {
          where: { status: 'ACTIVE' },
          include: {
            organization: {
              select: { id: true, name: true, slug: true, logo: true },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  // ============================================================
  // PRIVATE HELPERS
  // ============================================================

  /**
   * Throws if the account has exceeded MAX_FAILED_LOGINS within the window.
   *
   * Redis is deliberately fail-open here: if it's unreachable we let the
   * login attempt through rather than locking every user out of the product
   * because the cache is down. The per-IP @Throttle on the controller is the
   * backstop in that scenario.
   */
  private async assertNotLockedOut(email: string): Promise<void> {
    try {
      const attempts = await this.redis.get(this.failedLoginKey(email));
      if (attempts && Number(attempts) >= MAX_FAILED_LOGINS) {
        const ttl = await this.redis.ttl(this.failedLoginKey(email));
        const minutes = Math.max(1, Math.ceil((ttl > 0 ? ttl : LOCKOUT_SECONDS) / 60));
        this.logger.warn(`Blocked login for locked-out account: ${email}`);
        throw new ForbiddenException(
          `Too many failed login attempts. Try again in ${minutes} minute(s).`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.error(
        `Lockout check unavailable (failing open): ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async recordFailedLogin(email: string): Promise<void> {
    try {
      const key = this.failedLoginKey(email);
      const count = await this.redis.incr(key);

      // Only set expiry on the first failure so the window is a fixed period
      // from that first attempt, not a rolling one an attacker can extend
      // indefinitely by continuing to guess.
      if (count === 1) {
        await this.redis.expire(key, FAILURE_WINDOW_SECONDS);
      }

      if (count >= MAX_FAILED_LOGINS) {
        await this.redis.expire(key, LOCKOUT_SECONDS);
        this.logger.warn(`Account locked after ${count} failed logins: ${email}`);
      }
    } catch (err) {
      this.logger.error(
        `Could not record failed login: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  private async clearFailedLogins(email: string): Promise<void> {
    try {
      await this.redis.del(this.failedLoginKey(email));
    } catch {
      // Non-fatal: a stale counter expires on its own.
    }
  }

  private failedLoginKey(email: string): string {
    return `login-failures:${email}`;
  }

  private async generateTokens(
    userId: string,
    email: string,
    isSuperAdmin: boolean,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const payload: JwtPayload = { sub: userId, email, isSuperAdmin };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn'),
      }),
    ]);

    return { accessToken, refreshToken };
  }

  private async storeRefreshToken(token: string, userId: string): Promise<void> {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt },
    });

    // Clean up expired tokens
    await this.prisma.refreshToken.deleteMany({
      where: { userId, expiresAt: { lt: new Date() } },
    });
  }
}
