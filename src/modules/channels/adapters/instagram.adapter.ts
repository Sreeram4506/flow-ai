import { Injectable, Logger } from '@nestjs/common';
import { PublishChannel } from '@prisma/client';
import { ChannelCredentials, IChannelAdapter, PublishPayload, PublishResult } from '../channel.types';

const GRAPH_BASE = 'https://graph.facebook.com/v21.0';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * Instagram publishing via the Meta Graph API (two-step: create media container → publish).
 * Requires: IG Business/Creator account linked to a Facebook Page, an approved Meta app
 * with `instagram_business_content_publish`, and a publicly reachable image URL.
 */
@Injectable()
export class InstagramAdapter implements IChannelAdapter {
  readonly channel = PublishChannel.INSTAGRAM;
  private readonly logger = new Logger(InstagramAdapter.name);

  async publish(payload: PublishPayload, credentials: ChannelCredentials | null): Promise<PublishResult> {
    if (!credentials?.accessToken || !credentials?.externalId) {
      return { success: false, error: 'Instagram account not connected (missing token or IG user id)' };
    }
    if (!payload.imageUrl) {
      return { success: false, error: 'Instagram posts require a publicly hosted image URL' };
    }

    const caption = [payload.caption, (payload.hashtags || []).join(' ')].filter(Boolean).join('\n\n');

    try {
      // Step 1: create media container
      const containerRes = await fetch(`${GRAPH_BASE}/${credentials.externalId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: payload.imageUrl,
          caption,
          access_token: credentials.accessToken,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const container = (await containerRes.json()) as { id?: string; error?: { message: string } };
      if (!containerRes.ok || !container.id) {
        return { success: false, error: `IG container creation failed: ${container.error?.message || containerRes.status}` };
      }

      // Step 2: publish container
      const publishRes = await fetch(`${GRAPH_BASE}/${credentials.externalId}/media_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ creation_id: container.id, access_token: credentials.accessToken }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      const published = (await publishRes.json()) as { id?: string; error?: { message: string } };
      if (!publishRes.ok || !published.id) {
        return { success: false, error: `IG publish failed: ${published.error?.message || publishRes.status}` };
      }

      this.logger.log(`Published Instagram post ${published.id}`);
      return { success: true, externalPostId: published.id };
    } catch (err: any) {
      return { success: false, error: `IG request error: ${err.message}` };
    }
  }

  async verify(credentials: ChannelCredentials | null): Promise<{ ok: boolean; detail?: string }> {
    if (!credentials?.accessToken || !credentials?.externalId) return { ok: false, detail: 'Not connected' };
    try {
      const res = await fetch(
        `${GRAPH_BASE}/${credentials.externalId}?fields=id,username&access_token=${encodeURIComponent(credentials.accessToken)}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!res.ok) return { ok: false, detail: `Token check failed (HTTP ${res.status})` };
      const data = (await res.json()) as { username?: string };
      return { ok: true, detail: `Connected as @${data.username}` };
    } catch (err: any) {
      return { ok: false, detail: err.message };
    }
  }
}
