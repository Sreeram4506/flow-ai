import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PublishChannel, SocialAccountStatus } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { decryptSecret, encryptSecret } from '../../common/utils';
import { ChannelCredentials, ChannelHealth, IChannelAdapter, PublishPayload, PublishResult } from './channel.types';
import { InstagramAdapter } from './adapters/instagram.adapter';
import { LinkedInAdapter } from './adapters/linkedin.adapter';
import { EmailAdapter } from './adapters/email.adapter';
import { WebsiteAdapter } from './adapters/website.adapter';
import { ConnectAccountDto } from './dto';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);
  private readonly adapters: Map<PublishChannel, IChannelAdapter>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    instagram: InstagramAdapter,
    linkedin: LinkedInAdapter,
    email: EmailAdapter,
    website: WebsiteAdapter,
  ) {
    this.adapters = new Map<PublishChannel, IChannelAdapter>([
      [PublishChannel.INSTAGRAM, instagram],
      [PublishChannel.LINKEDIN, linkedin],
      [PublishChannel.EMAIL, email],
      [PublishChannel.WEBSITE, website],
    ]);
  }

  private get encryptionKey(): string {
    // AGENT_ENCRYPTION_KEY is required by env validation (configuration.ts),
    // so this should always be set by the time the app boots. No fallback:
    // a missing key must throw, not silently encrypt tokens with a value an
    // attacker could derive or find in source control.
    const key = this.configService.get<string>('agents.encryptionKey');
    if (!key) {
      throw new Error('AGENT_ENCRYPTION_KEY is not configured');
    }
    return key;
  }

  // ---- Account management ----

  async connectAccount(orgId: string, dto: ConnectAccountDto) {
    const data = {
      organizationId: orgId,
      platform: dto.platform,
      accountName: dto.accountName,
      externalId: dto.externalId,
      accessToken: dto.accessToken ? encryptSecret(dto.accessToken, this.encryptionKey) : undefined,
      refreshToken: dto.refreshToken ? encryptSecret(dto.refreshToken, this.encryptionKey) : undefined,
      tokenExpiresAt: dto.tokenExpiresAt ? new Date(dto.tokenExpiresAt) : undefined,
      scopes: dto.scopes || [],
      status: SocialAccountStatus.CONNECTED,
      lastCheckedAt: new Date(),
    };
    return this.prisma.socialAccount.upsert({
      where: {
        organizationId_platform_accountName: {
          organizationId: orgId,
          platform: dto.platform,
          accountName: dto.accountName,
        },
      },
      create: data,
      update: data,
    });
  }

  async listAccounts(orgId: string) {
    const accounts = await this.prisma.socialAccount.findMany({ where: { organizationId: orgId } });
    // Never return raw tokens
    return accounts.map(({ accessToken, refreshToken, ...rest }) => ({
      ...rest,
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
    }));
  }

  async disconnectAccount(orgId: string, id: string) {
    const account = await this.prisma.socialAccount.findFirst({ where: { id, organizationId: orgId } });
    if (!account) throw new NotFoundException('Account not found');
    return this.prisma.socialAccount.update({
      where: { id },
      data: { accessToken: null, refreshToken: null, status: SocialAccountStatus.REVOKED },
    });
  }

  async getCredentials(orgId: string, channel: PublishChannel): Promise<ChannelCredentials | null> {
    const account = await this.prisma.socialAccount.findFirst({
      where: { organizationId: orgId, platform: channel, status: SocialAccountStatus.CONNECTED },
      orderBy: { updatedAt: 'desc' },
    });
    if (!account) return null;
    return {
      accessToken: account.accessToken ? decryptSecret(account.accessToken, this.encryptionKey) : undefined,
      refreshToken: account.refreshToken ? decryptSecret(account.refreshToken, this.encryptionKey) : undefined,
      externalId: account.externalId || undefined,
      accountName: account.accountName,
      metadata: (account.metadata as Record<string, unknown>) || undefined,
    };
  }

  // ---- Publishing ----

  async publish(payload: PublishPayload): Promise<PublishResult> {
    const adapter = this.adapters.get(payload.channel);
    if (!adapter) throw new BadRequestException(`No adapter for channel ${payload.channel}`);
    const credentials = await this.getCredentials(payload.organizationId, payload.channel);
    const result = await adapter.publish(payload, credentials);
    if (!result.success) this.logger.warn(`Publish failed on ${payload.channel}: ${result.error}`);
    return result;
  }

  // ---- Health (used by CTO agent + dashboard) ----

  async healthCheck(orgId: string): Promise<ChannelHealth[]> {
    const results: ChannelHealth[] = [];
    for (const [channel, adapter] of this.adapters.entries()) {
      const account = await this.prisma.socialAccount.findFirst({
        where: { organizationId: orgId, platform: channel },
        orderBy: { updatedAt: 'desc' },
      });
      const credentials = await this.getCredentials(orgId, channel).catch(() => null);
      const check = await adapter.verify(credentials);

      // Auto-flag expiring tokens
      if (account?.tokenExpiresAt && account.tokenExpiresAt < new Date() && account.status === 'CONNECTED') {
        await this.prisma.socialAccount.update({
          where: { id: account.id },
          data: { status: SocialAccountStatus.EXPIRED },
        });
      }

      results.push({
        channel,
        connected: check.ok,
        status: account?.status || 'NOT_CONFIGURED',
        detail: check.detail,
        tokenExpiresAt: account?.tokenExpiresAt || null,
      });
    }
    await this.prisma.socialAccount.updateMany({
      where: { organizationId: orgId },
      data: { lastCheckedAt: new Date() },
    });
    return results;
  }
}
