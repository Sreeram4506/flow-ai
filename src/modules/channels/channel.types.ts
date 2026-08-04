import { PublishChannel } from '@prisma/client';

export interface PublishPayload {
  organizationId: string;
  channel: PublishChannel;
  caption?: string | null;
  body?: string | null;
  title?: string | null;
  imageUrl?: string | null;
  hashtags?: string[];
  // email-specific
  toAddress?: string;
  subject?: string;
}

export interface PublishResult {
  success: boolean;
  externalPostId?: string;
  error?: string;
}

export interface ChannelHealth {
  channel: PublishChannel;
  connected: boolean;
  status: string;
  detail?: string;
  tokenExpiresAt?: Date | null;
}

export interface IChannelAdapter {
  readonly channel: PublishChannel;
  publish(payload: PublishPayload, credentials: ChannelCredentials | null): Promise<PublishResult>;
  verify(credentials: ChannelCredentials | null): Promise<{ ok: boolean; detail?: string }>;
}

export interface ChannelCredentials {
  accessToken?: string;
  refreshToken?: string;
  externalId?: string; // IG user id / LinkedIn org URN / from-address
  accountName?: string;
  metadata?: Record<string, unknown>;
}
