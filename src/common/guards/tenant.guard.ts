import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

/**
 * Ensures the user is a member of the organization specified in the request.
 * Sets user.organizationId and user.role on the request.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

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
      const membership = await this.prisma.organizationMember.findUnique({
        where: {
          organizationId_userId: {
            organizationId: orgId,
            userId: user.id,
          },
        },
      });

      if (!membership || membership.status !== 'ACTIVE') {
        throw new ForbiddenException('You are not a member of this organization');
      }

      request.user.role = membership.role;
      request.user.membershipId = membership.id;
    }

    // Attach org context to request
    request.user.organizationId = orgId;

    return true;
  }
}
