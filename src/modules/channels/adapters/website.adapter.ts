import { Injectable, Logger } from '@nestjs/common';
import { PublishChannel } from '@prisma/client';
import { IChannelAdapter, PublishPayload, PublishResult } from '../channel.types';

/**
 * Website/blog publishing. Published BLOG_POST ContentItems are served from
 * Flow's own database via the public blog endpoint (GET /api/content/public/blog).
 * Publishing here is therefore just a success marker — the ContentItem row IS the post.
 * Swap this adapter for a CMS integration (WordPress/Webflow/etc.) later if needed.
 */
@Injectable()
export class WebsiteAdapter implements IChannelAdapter {
  readonly channel = PublishChannel.WEBSITE;
  private readonly logger = new Logger(WebsiteAdapter.name);

  async publish(payload: PublishPayload): Promise<PublishResult> {
    if (!payload.title && !payload.body) {
      return { success: false, error: 'Blog posts require a title or body' };
    }
    this.logger.log(`Blog post published to site: "${payload.title}"`);
    return { success: true, externalPostId: `blog_${Date.now()}` };
  }

  async verify(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'Internal blog always available' };
  }
}
