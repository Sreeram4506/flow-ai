import { randomFillSync } from 'crypto';
import { PaginationMeta } from '../types';

/**
 * Build a paginated response.
 */
export function paginate<T>(
  data: T[],
  total: number,
  page: number,
  limit: number,
) {
  const meta: PaginationMeta = {
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };

  return {
    success: true,
    data,
    meta,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Generate a unique slug from a string.
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .substring(0, 100);
}

/**
 * Generate a random string for tokens, API keys, etc.
 */
export function generateRandomString(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const randomValues = new Uint8Array(length);
  randomFillSync(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

/**
 * Generate auto-incrementing numbers for invoices/quotations.
 */
export function formatDocumentNumber(prefix: string, counter: number, padding: number = 5): string {
  return `${prefix}-${String(counter).padStart(padding, '0')}`;
}

/**
 * Calculate percentage.
 */
export function calculatePercentage(value: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((value / total) * 100 * 100) / 100;
}
