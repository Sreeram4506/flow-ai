import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { TenantGuard } from './tenant.guard';
import { TenantMembershipCache } from '../cache/tenant-membership.cache';

/**
 * Tenant isolation is the one bug class in a multi-tenant SaaS that turns
 * into a data breach rather than an outage, and it had no test coverage at
 * all. TenantGuard is the single chokepoint that decides whether a caller may
 * act inside an organization, so it's tested directly here.
 *
 * These are pure unit tests with mocked Prisma/Redis — no database or cache
 * server required, so they run in any CI environment. The companion
 * `test/tenant-isolation.e2e-spec.ts` covers the same properties end-to-end
 * where infrastructure is available.
 */
describe('TenantGuard', () => {
  const ORG_A = 'org-aaaaaaaaaaaaaaaaaaaaaaaa';
  const ORG_B = 'org-bbbbbbbbbbbbbbbbbbbbbbbb';
  const USER_ID = 'user-111111111111111111111111';

  let findUnique: jest.Mock;
  let prisma: any;
  let cache: jest.Mocked<TenantMembershipCache>;
  let guard: TenantGuard;

  /** Builds an ExecutionContext carrying the given request. */
  const contextFor = (request: any): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({}),
      }),
    }) as unknown as ExecutionContext;

  // `user` defaults to a normal member. Note it must be passed as `null` —
  // not `undefined` — to represent an unauthenticated caller, because a
  // default parameter value is applied for `undefined`.
  const requestFor = (
    orgId: string | undefined,
    user: any = { id: USER_ID, isSuperAdmin: false },
  ) => ({
    headers: orgId ? { 'x-organization-id': orgId } : {},
    params: {},
    query: {},
    user,
  });

  beforeEach(() => {
    findUnique = jest.fn();
    prisma = { organizationMember: { findUnique } };
    cache = {
      get: jest.fn().mockResolvedValue(undefined), // default: cache miss
      set: jest.fn().mockResolvedValue(undefined),
      invalidate: jest.fn().mockResolvedValue(undefined),
      invalidateOrg: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<TenantMembershipCache>;

    guard = new TenantGuard(prisma, cache);
  });

  describe('rejects access', () => {
    it('denies an unauthenticated request', async () => {
      const request = requestFor(ORG_A, null);
      await expect(guard.canActivate(contextFor(request))).resolves.toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('requires an organization to be specified', async () => {
      await expect(
        guard.canActivate(contextFor(requestFor(undefined))),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    // The core isolation property: belonging to one org grants nothing in another.
    it('denies a user who is not a member of the requested organization', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_B))),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it('denies a member whose membership is not ACTIVE', async () => {
      findUnique.mockResolvedValue({
        id: 'mem-1',
        role: 'ADMIN',
        status: 'INVITED',
      });

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_A))),
      ).rejects.toThrow('You are not a member of this organization');
    });

    it('denies a member who was suspended, even with a privileged role', async () => {
      findUnique.mockResolvedValue({
        id: 'mem-1',
        role: 'OWNER',
        status: 'SUSPENDED',
      });

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_A))),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('grants access', () => {
    it('admits an active member and attaches their org context', async () => {
      findUnique.mockResolvedValue({
        id: 'mem-42',
        role: 'MANAGER',
        status: 'ACTIVE',
      });
      const request = requestFor(ORG_A);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);

      // Downstream controllers read these off the request; the role must come
      // from the membership record, never from anything client-supplied.
      expect(request.user.organizationId).toBe(ORG_A);
      expect(request.user.role).toBe('MANAGER');
      expect(request.user.membershipId).toBe('mem-42');
    });

    it('lets a super admin through without a membership lookup', async () => {
      const request = requestFor(ORG_A, { id: USER_ID, isSuperAdmin: true });

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
      expect(request.user.organizationId).toBe(ORG_A);
    });

    it('reads the organization from a route param when no header is present', async () => {
      findUnique.mockResolvedValue({ id: 'm', role: 'MEMBER', status: 'ACTIVE' });
      // `user` is widened because the guard attaches organizationId/role to it
      // at runtime; a narrow literal type would make those assertions fail to
      // compile (matching the `user: any` in the requestFor helper above).
      const request: { headers: any; params: any; query: any; user: any } = {
        headers: {},
        params: { orgId: ORG_A },
        query: {},
        user: { id: USER_ID, isSuperAdmin: false },
      };

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(request.user.organizationId).toBe(ORG_A);
    });
  });

  describe('caching', () => {
    it('skips the database when a membership is cached', async () => {
      cache.get.mockResolvedValue({
        role: 'ADMIN',
        membershipId: 'mem-9',
        status: 'ACTIVE',
      });
      const request = requestFor(ORG_A);

      await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
      expect(findUnique).not.toHaveBeenCalled();
      expect(request.user.role).toBe('ADMIN');
    });

    it('honours a cached non-membership without re-querying', async () => {
      cache.get.mockResolvedValue(null); // cached "definitely not a member"

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_B))),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('caches a negative result so repeat probes stay cheap', async () => {
      findUnique.mockResolvedValue(null);

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_B))),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(cache.set).toHaveBeenCalledWith(ORG_B, USER_ID, null);
    });

    // A cache outage must degrade to a database read, never to open access.
    it('falls back to the database when the cache is unavailable', async () => {
      cache.get.mockResolvedValue(undefined);
      findUnique.mockResolvedValue({ id: 'm', role: 'MEMBER', status: 'ACTIVE' });

      await expect(
        guard.canActivate(contextFor(requestFor(ORG_A))),
      ).resolves.toBe(true);
      expect(findUnique).toHaveBeenCalledTimes(1);
    });

    it('scopes cache lookups to the requested organization', async () => {
      findUnique.mockResolvedValue({ id: 'm', role: 'MEMBER', status: 'ACTIVE' });

      await guard.canActivate(contextFor(requestFor(ORG_A)));

      // A key that ignored the org would let a membership in one org satisfy
      // a request against another.
      expect(cache.get).toHaveBeenCalledWith(ORG_A, USER_ID);
      expect(findUnique).toHaveBeenCalledWith({
        where: {
          organizationId_userId: { organizationId: ORG_A, userId: USER_ID },
        },
      });
    });
  });
});
