import { describe, it, expect } from 'vitest';
import { resolveIntentIssues } from '../src/modules/intent/sources.js';

/**
 * Hermetic coverage for `resolveIntentIssues` — the closing-keyword-required
 * issue resolver that deliberately does NOT reuse `resolveLinkedIssue`
 * (`adapters/github/octokit.ts:128`), whose optional keyword lets the first
 * bare `#N` anywhere in the body win (specs/L03-intent-layer.md).
 */
describe('resolveIntentIssues', () => {
  it('resolves the KEYWORDED reference, not the first bare #N in the body', () => {
    const refs = resolveIntentIssues('see #4 for background. Closes #812');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ ref: '#812', number: 812, keyworded: true });
  });

  it('parses owner/repo#123 and full issue URLs', () => {
    const ownerRepo = resolveIntentIssues('Closes acme/widgets#123');
    expect(ownerRepo).toHaveLength(1);
    expect(ownerRepo[0]).toMatchObject({ ref: 'acme/widgets#123', owner: 'acme', repo: 'widgets', number: 123 });

    const url = resolveIntentIssues('Fixes https://github.com/acme/widgets/issues/456');
    expect(url).toHaveLength(1);
    expect(url[0]).toMatchObject({ owner: 'acme', repo: 'widgets', number: 456 });
  });

  it('returns EVERY keyworded reference when the body names more than one', () => {
    const refs = resolveIntentIssues('Fixes #1 and closes #2. Also resolves #3.');
    expect(refs.map((r) => r.number).sort()).toEqual([1, 2, 3]);
    expect(refs.every((r) => r.keyworded)).toBe(true);
  });

  it('dedupes a repeated keyworded reference to the same issue number', () => {
    const refs = resolveIntentIssues('Fixes #9. This closes #9 as well.');
    expect(refs).toHaveLength(1);
    expect(refs[0].number).toBe(9);
  });

  it('records a bare #N with no keyword as issue_unkeyworded (keyworded: false)', () => {
    const refs = resolveIntentIssues('See #42 for context, no promises though.');
    expect(refs).toHaveLength(1);
    expect(refs[0]).toMatchObject({ ref: '#42', number: 42, keyworded: false });
  });

  it('returns nothing for a body with no issue reference at all', () => {
    expect(resolveIntentIssues('Just a plain description, no issues mentioned.')).toEqual([]);
    expect(resolveIntentIssues(null)).toEqual([]);
    expect(resolveIntentIssues(undefined)).toEqual([]);
  });
});
