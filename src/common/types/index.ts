import { UserRole } from '@prisma/client';

export interface JwtPayload {
  sub: string; // userId
  email: string;
  isSuperAdmin: boolean;
  // Random per-token nonce. JWT signing is deterministic (same header +
  // payload + secret + iat/exp -> byte-identical token), and iat has only
  // second precision — two logins for the same user within the same second
  // produced the exact same refresh token string, which then hit the unique
  // constraint on RefreshToken.token on the second insert. jti guarantees
  // every issued token is unique regardless of timing.
  jti?: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isSuperAdmin: boolean;
  isEmailVerified: boolean;
  // Set by TenantGuard
  organizationId?: string;
  role?: UserRole;
  membershipId?: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  success: boolean;
  data: T[];
  meta: PaginationMeta;
  timestamp: string;
}

export interface SortOptions {
  field: string;
  order: 'asc' | 'desc';
}
