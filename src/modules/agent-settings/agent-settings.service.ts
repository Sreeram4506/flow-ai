import { Injectable } from '@nestjs/common';
import { PublishChannel } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';

/**
 * Safety rails shared by the whole agent platform:
 * kill-switch, per-channel pause, post caps, token budget, email hold-buffer.
 */
@Injectable()
export class AgentSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(orgId: string) {
    return this.prisma.agentSettings.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId },
      update: {},
    });
  }

  async update(orgId: string, data: Partial<{
    killSwitch: boolean;
    autonomyEnabled: boolean;
    pausedChannels: PublishChannel[];
    maxPostsPerDay: number;
    maxAgentStepsPerRun: number;
    maxTokensPerDay: number;
    emailHoldMinutes: number;
    autoSendEmail: boolean;
    emailAllowlist: string[];
    dailyPlanHour: number;
  }>) {
    await this.get(orgId); // ensure exists
    return this.prisma.agentSettings.update({ where: { organizationId: orgId }, data });
  }

  /** True if ALL agent activity is halted for this org. */
  async isHalted(orgId: string): Promise<boolean> {
    const s = await this.get(orgId);
    return s.killSwitch;
  }

  async isChannelPaused(orgId: string, channel: PublishChannel): Promise<boolean> {
    const s = await this.get(orgId);
    return s.killSwitch || s.pausedChannels.includes(channel);
  }

  /** Daily token budget. Returns remaining tokens (resets every 24h). */
  async consumeTokenBudget(orgId: string, tokens: number): Promise<{ allowed: boolean; remaining: number }> {
    let s = await this.get(orgId);
    const now = new Date();
    if (!s.tokensResetAt || s.tokensResetAt < now) {
      s = await this.prisma.agentSettings.update({
        where: { organizationId: orgId },
        data: { tokensUsedToday: 0, tokensResetAt: new Date(now.getTime() + 24 * 60 * 60 * 1000) },
      });
    }
    if (s.tokensUsedToday + tokens > s.maxTokensPerDay) {
      return { allowed: false, remaining: Math.max(0, s.maxTokensPerDay - s.tokensUsedToday) };
    }
    const updated = await this.prisma.agentSettings.update({
      where: { organizationId: orgId },
      data: { tokensUsedToday: { increment: tokens } },
    });
    return { allowed: true, remaining: s.maxTokensPerDay - updated.tokensUsedToday };
  }

  /** How many posts were already published today on a channel (rate cap). */
  async postsPublishedToday(orgId: string, channel: PublishChannel): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return this.prisma.contentItem.count({
      where: { organizationId: orgId, channel, status: 'PUBLISHED', publishedAt: { gte: startOfDay } },
    });
  }

  async canPublish(orgId: string, channel: PublishChannel): Promise<{ allowed: boolean; reason?: string }> {
    const s = await this.get(orgId);
    if (s.killSwitch) return { allowed: false, reason: 'Kill-switch is active' };
    if (s.pausedChannels.includes(channel)) return { allowed: false, reason: `${channel} is paused` };
    const publishedToday = await this.postsPublishedToday(orgId, channel);
    if (channel !== 'EMAIL' && publishedToday >= s.maxPostsPerDay) {
      return { allowed: false, reason: `Daily post cap reached (${s.maxPostsPerDay}) for ${channel}` };
    }
    return { allowed: true };
  }
}
