import {
  calculatePercentage,
  formatDocumentNumber,
  generateSlug,
  paginate,
} from './helpers';

describe('helpers', () => {
  it('generates stable slugs', () => {
    expect(generateSlug('Hello, Flow Team!')).toBe('hello-flow-team');
  });

  it('formats document numbers with padding', () => {
    expect(formatDocumentNumber('INV', 12)).toBe('INV-00012');
  });

  it('calculates rounded percentages', () => {
    expect(calculatePercentage(2, 8)).toBe(25);
  });

  it('creates paginated responses', () => {
    const result = paginate([1, 2], 4, 1, 2);

    expect(result.success).toBe(true);
    expect(result.data).toEqual([1, 2]);
    expect(result.meta).toEqual({
      total: 4,
      page: 1,
      limit: 2,
      totalPages: 2,
    });
  });
});
