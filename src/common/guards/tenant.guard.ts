import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { TenantMembershipCache } from '../cache/tenant-membership.cache';

/**
 * Ensures the user is a member of the organization specified in the request.
 * Sets user.organizationId and user.role on the request.
 *
 * Membership lookups are cached in Redis (see TenantMembershipCache) rather
 * than in process memory, so that removing a member or changing their role
 * takes effect immediately across every running instance instead of lingering
 * until each instance's local TTL expired.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: TenantMembershipCache,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      return false;
    }

    const orgId =
      request.headers['x-organization-id'] ||
      request.params?.orgId ||
      request.query?.organizationId;

    if (!orgId) {
      throw new ForbiddenException('Organization ID is required');
    }

    if (!user.isSuperAdmin) {
      // `undefined` = cache miss, `null` = cached "not a member".
      let membership = await this.cache.get(orgId, user.id);

      if (membership === undefined) {
        const row = await this.prisma.organizationMember.findUnique({
          where: {
            organizationId_userId: {
              organizationId: orgId,
              userId: user.id,
            },
          },
        });
        membership = row
          ? { role: row.role, membershipId: row.id, status: row.status }
          : null;
        await this.cache.set(orgId, user.id, membership);
      }

      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenException('You are not a member of this organization');
      }

      request.user.role = membership.role;
      request.user.membershipId = membership.membershipId;
    }

    // Attach org context to request
    request.user.organizationId = orgId;

    return true;
  }
}
