import { describe, it, expect } from 'vitest';
import { validateContextDocPaths as validateAgentContextDocPaths } from '../src/modules/agents/helpers.js';
import { validateContextDocPaths as validateSkillContextDocPaths } from '../src/modules/skills/helpers.js';

/**
 * L05 — `validateContextDocPaths` is duplicated verbatim in `agents/helpers.ts`
 * and `skills/helpers.ts` (cross-module imports are forbidden, see
 * `server/INSIGHTS.md` 2026-09-21). Both copies are covered here so a future
 * edit to one that isn't mirrored to the other shows up as a failing test.
 */
describe.each([
  ['agents', validateAgentContextDocPaths],
  ['skills', validateSkillContextDocPaths],
])('%s validateContextDocPaths', (_name, validateContextDocPaths) => {
  const discovered = new Set(['specs/a.md', 'docs/b.md']);

  it('accepts an empty path list', () => {
    expect(validateContextDocPaths([], discovered)).toBe(true);
  });

  it('accepts paths that are safe AND in the discovered set', () => {
    expect(validateContextDocPaths(['specs/a.md', 'docs/b.md'], discovered)).toBe(true);
  });

  it('rejects a path not in the discovered set', () => {
    expect(validateContextDocPaths(['specs/a.md', 'insights/missing.md'], discovered)).toBe(
      false,
    );
  });

  it('rejects a path-traversal attempt even if it happens to be in the set', () => {
    const withTraversal = new Set([...discovered, '../outside.md']);
    expect(validateContextDocPaths(['../outside.md'], withTraversal)).toBe(false);
  });
});
