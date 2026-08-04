import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { UpsertBrandProfileDto, UpdateBrandProfileDto } from './dto';

@Injectable()
export class BrandService {
  constructor(private readonly prisma: PrismaService) {}

  async get(orgId: string) {
    const profile = await this.prisma.brandProfile.findUnique({ where: { organizationId: orgId } });
    if (!profile) throw new NotFoundException('Brand profile not set up yet');
    return profile;
  }

  async getOrNull(orgId: string) {
    return this.prisma.brandProfile.findUnique({ where: { organizationId: orgId } });
  }

  async upsert(orgId: string, dto: UpsertBrandProfileDto) {
    return this.prisma.brandProfile.upsert({
      where: { organizationId: orgId },
      create: { organizationId: orgId, ...dto },
      update: { ...dto },
    });
  }

  async update(orgId: string, dto: UpdateBrandProfileDto) {
    const existing = await this.getOrNull(orgId);
    if (!existing) throw new NotFoundException('Brand profile not set up yet');
    return this.prisma.brandProfile.update({ where: { organizationId: orgId }, data: { ...dto } });
  }

  /**
   * Renders the brand profile as a text block injected into every agent prompt.
   * This is what makes agent output sound like the user's company.
   */
  async buildBrandContext(orgId: string): Promise<string> {
    const p = await this.getOrNull(orgId);
    if (!p) return 'No brand profile configured yet. Keep output generic and professional.';
    const lines = [
      `Company: ${p.companyName}`,
      p.tagline && `Tagline: ${p.tagline}`,
      p.description && `About: ${p.description}`,
      p.mission && `Mission: ${p.mission}`,
      p.industry && `Industry: ${p.industry}`,
      p.targetAudience && `Target audience: ${p.targetAudience}`,
      p.toneOfVoice && `Tone of voice: ${p.toneOfVoice}`,
      p.contentGuidelines && `Content guidelines (MUST follow): ${p.contentGuidelines}`,
      p.websiteUrl && `Website: ${p.websiteUrl}`,
      p.instagramHandle && `Instagram: ${p.instagramHandle}`,
      p.linkedinPage && `LinkedIn: ${p.linkedinPage}`,
      p.hashtagDefaults?.length ? `Default hashtags: ${p.hashtagDefaults.join(' ')}` : null,
      p.brandColors?.length ? `Brand colors: ${p.brandColors.join(', ')}` : null,
    ].filter(Boolean);
    return lines.join('\n');
  }
}
