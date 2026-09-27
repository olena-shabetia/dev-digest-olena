/**
 * P3 — pure helper tests for `pr-history/helpers.ts`.
 */
import { describe, it, expect } from 'vitest';
import { computeFilesOverlap, buildHistoryNote } from '../src/modules/pr-history/helpers.js';

describe('computeFilesOverlap', () => {
  it('returns changed files that the candidate also touched, in changed-file order', () => {
    const candidateFiles = ['src/c.ts', 'src/a.ts', 'src/z.ts'];
    const changedFiles = ['src/a.ts', 'src/b.ts', 'src/c.ts'];
    expect(computeFilesOverlap(candidateFiles, changedFiles)).toEqual(['src/a.ts', 'src/c.ts']);
  });

  it('returns an empty array when nothing overlaps', () => {
    expect(computeFilesOverlap(['src/x.ts'], ['src/a.ts'])).toEqual([]);
  });
});

describe('buildHistoryNote', () => {
  it('builds the plain-English overlap note', () => {
    expect(buildHistoryNote(2, 5)).toBe('2 of 5 changed file(s) overlap');
    expect(buildHistoryNote(0, 3)).toBe('0 of 3 changed file(s) overlap');
  });
});
