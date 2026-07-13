import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Extract organization ID from request headers or params.
 * Usage: @OrgId() orgId: string
 */
export const OrgId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const orgId = request.user?.organizationId;

    if (!orgId) {
      throw new ForbiddenException('Organization context is required');
    }

    return orgId;
  },
);
