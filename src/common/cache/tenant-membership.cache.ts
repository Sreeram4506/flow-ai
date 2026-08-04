import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../database/redis.service';

/**
 * Cached membership shape. `null` is itself a meaningful cached value — it
 * means "we looked, and this user is definitively not a member" — so repeated
 * probes from a non-member don't hit the database every time either.
 */
export interface CachedMembership {
  role: string;
  membershipId: string;
  status: string;
}

/**
 * Redis-backed cache for organization membership lookups.
 *
 * Replaces an in-process TtlCache that could not be invalidated: with N app
 * instances, revoking a member or downgrading a role stayed live on every
 * *other* instance until its local TTL lapsed. A removed user could keep
 * acting on an organization for the length of that window. Redis makes the
 * cache shared, so a single invalidation is seen by every instance at once.
 *
 * Every method fails open (falls back to a database read) rather than
 * throwing — a Redis outage should degrade performance, not availability.
 */
@Injectable()
export class TenantMembershipCache {
  private readonly logger = new Logger(TenantMembershipCache.name);

  // 5 minutes. The old in-process cache used 30s precisely *because* it
  // couldn't be invalidated — the TTL was the revocation delay. Now that
  // mutations bust the key explicitly, the TTL only bounds staleness for
  // changes made outside the app (e.g. direct DB edits), so it can be longer.
  private static readonly TTL_SECONDS = 300;

  constructor(private readonly redis: RedisService) {}

  private key(orgId: string, userId: string): string {
    return `membership:${orgId}:${userId}`;
  }

  /**
   * Returns the cached membership, `null` for a cached non-member, or
   * `undefined` for a cache miss (caller should query the database).
   */
  async get(orgId: string, userId: string): Promise<CachedMembership | null | undefined> {
    try {
      const raw = await this.redis.get(this.key(orgId, userId));
      if (raw === null) return undefined;
      if (raw === 'null') return null;
      return JSON.parse(raw) as CachedMembership;
    } catch (err) {
      this.logger.warn(`Cache read failed, falling back to DB: ${this.msg(err)}`);
      return undefined;
    }
  }

  async set(orgId: string, userId: string, value: CachedMembership | null): Promise<void> {
    try {
      await this.redis.set(
        this.key(orgId, userId),
        value === null ? 'null' : JSON.stringify(value),
        TenantMembershipCache.TTL_SECONDS,
      );
    } catch (err) {
      this.logger.warn(`Cache write failed: ${this.msg(err)}`);
    }
  }

  /** Call after any change to a single member's role or status. */
  async invalidate(orgId: string, userId: string): Promise<void> {
    try {
      await this.redis.del(this.key(orgId, userId));
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${this.msg(err)}`);
    }
  }

  /** Call when an organization is deleted or its members are bulk-modified. */
  async invalidateOrg(orgId: string): Promise<void> {
    try {
      await this.redis.delPattern(`membership:${orgId}:*`);
    } catch (err) {
      this.logger.warn(`Org cache invalidation failed: ${this.msg(err)}`);
    }
  }

  private msg(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
