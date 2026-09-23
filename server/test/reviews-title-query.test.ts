import { describe, it, expect } from 'vitest';
import { nanoid } from 'nanoid';
import { matchesTitleQuery } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the PR list's upcoming `q=` title filter. Each PR title
 * fixture carries a nanoid suffix so a run's fixtures never collide if this
 * suite is ever run concurrently against a shared PR list.
 */

describe('matchesTitleQuery', () => {
  const suffix = nanoid(6);

  it('matches case-insensitively on a plain substring', () => {
    expect(matchesTitleQuery(`Add rate limiting to the API ${suffix}`, 'rate limiting')).toBe(true);
  });

  it('returns true for an empty query (no filter applied)', () => {
    expect(matchesTitleQuery(`Anything ${suffix}`, '')).toBe(true);
  });

  it('returns false when the query does not appear in the title', () => {
    expect(matchesTitleQuery(`Fix the login bug ${suffix}`, 'rate limiting')).toBe(false);
  });
});
