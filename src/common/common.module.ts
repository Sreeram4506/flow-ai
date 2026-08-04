import { Global, Module } from '@nestjs/common';
import { TenantMembershipCache } from './cache/tenant-membership.cache';

/**
 * Global providers shared across feature modules.
 *
 * TenantMembershipCache has to live here rather than in a feature module:
 * TenantGuard injects it and is applied via `@UseGuards(TenantGuard)` in ~20
 * different controllers. Without a global registration, Nest would fail to
 * resolve the dependency in every one of those modules individually.
 */
@Global()
@Module({
  providers: [TenantMembershipCache],
  exports: [TenantMembershipCache],
})
export class CommonModule {}
