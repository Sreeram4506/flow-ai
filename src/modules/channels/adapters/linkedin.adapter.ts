import { Injectable, Logger } from '@nestjs/common';
import { PublishChannel } from '@prisma/client';
import { ChannelCredentials, IChannelAdapter, PublishPayload, PublishResult } from '../channel.types';

const LINKEDIN_API = 'https://api.linkedin.com/rest/posts';
const LINKEDIN_VERSION = '202405';
const FETCH_TIMEOUT_MS = 15_000;

/**
 * LinkedIn Company Page publishing via the Posts API.
 * Requires Marketing Developer Platform / Community Management API access with
 * the `w_organization_social` scope. externalId must be the org URN
 * (e.g. "urn:li:organization:12345").
 */
@Injectable()
export class LinkedInAdapter implements IChannelAdapter {
  readonly channel = PublishChannel.LINKEDIN;
  private readonly logger = new Logger(LinkedInAdapter.name);

  async publish(payload: PublishPayload, credentials: ChannelCredentials | null): Promise<PublishResult> {
    if (!credentials?.accessToken || !credentials?.externalId) {
      return {
        success: false,
        error:
          'LinkedIn not connected. Company-page posting requires Marketing Developer Platform access (w_organization_social).',
      };
    }

    const commentary = [payload.title, payload.caption || payload.body, (payload.hashtags || []).join(' ')]
      .filter(Boolean)
      .join('\n\n');

    try {
      const res = await fetch(LINKEDIN_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${credentials.accessToken}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          author: credentials.externalId,
          commentary,
          visibility: 'PUBLIC',
          distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
          lifecycleState: 'PUBLISHED',
          isReshareDisabledByAuthor: false,
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (res.status === 201) {
        const postId = res.headers.get('x-restli-id') || undefined;
        this.logger.log(`Published LinkedIn post ${postId}`);
        return { success: true, externalPostId: postId };
      }
      const errBody = await res.text();
      return { success: false, error: `LinkedIn publish failed (HTTP ${res.status}): ${errBody.slice(0, 300)}` };
    } catch (err: any) {
      return { success: false, error: `LinkedIn request error: ${err.message}` };
    }
  }

  async verify(credentials: ChannelCredentials | null): Promise<{ ok: boolean; detail?: string }> {
    if (!credentials?.accessToken) return { ok: false, detail: 'Not connected' };
    try {
      const res = await fetch('https://api.linkedin.com/v2/me', {
        headers: { Authorization: `Bearer ${credentials.accessToken}` },
        signal: AbortSignal.timeout(8_000),
      });
      return res.ok
        ? { ok: true, detail: 'Token valid' }
        : { ok: false, detail: `Token check failed (HTTP ${res.status})` };
    } catch (err: any) {
      return { ok: false, detail: err.message };
    }
  }
}
