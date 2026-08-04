import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@prisma/client';
import { RolesGuard } from './roles.guard';

/**
 * RolesGuard decides authorization once the caller's identity and org
 * membership are established. Its failure modes are quiet — an over-permissive
 * guard doesn't error, it just lets the wrong person through — so the
 * boundaries are asserted explicitly here.
 */
describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  const contextFor = (user: any): ExecutionContext =>
    ({
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => undefined,
      getClass: () => undefined,
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows any authenticated user when a route declares no roles', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    expect(guard.canActivate(contextFor({ role: UserRole.EMPLOYEE }))).toBe(true);
  });

  it('treats an empty roles array as unrestricted', () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    expect(guard.canActivate(contextFor({ role: UserRole.EMPLOYEE }))).toBe(true);
  });

  it('rejects when no user is attached to the request', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor(undefined))).toThrow(
      ForbiddenException,
    );
  });

  it('admits a user holding one of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER, UserRole.ADMIN]);
    expect(guard.canActivate(contextFor({ role: UserRole.ADMIN }))).toBe(true);
  });

  // The important negative case: a lower-privileged role must not satisfy a
  // requirement for a higher one.
  it('rejects a user whose role is not in the required set', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER, UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor({ role: UserRole.EMPLOYEE }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects a user with no role at all', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor({ id: 'u1' }))).toThrow(
      ForbiddenException,
    );
  });

  it('lets a super admin through regardless of the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.OWNER]);
    expect(
      guard.canActivate(contextFor({ role: UserRole.EMPLOYEE, isSuperAdmin: true })),
    ).toBe(true);
  });
});
