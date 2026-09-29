import { describe, it, expect } from 'vitest';
import { resolveEffectiveDocPaths, taskLine } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

/**
 * L05 — the effective project-context doc set: agent paths first (their own
 * stored order), then each ENABLED linked skill's paths (by that skill's own
 * `order`) visited in skill-link order, with first occurrence of a path
 * winning.
 */
describe('resolveEffectiveDocPaths', () => {
  it('puts agent paths first, in their given order', () => {
    const result = resolveEffectiveDocPaths(['specs/a.md', 'docs/b.md'], [], []);
    expect(result).toEqual(['specs/a.md', 'docs/b.md']);
  });

  it('appends each enabled skill\'s paths, ordered by the skill\'s own `order`, in skill-link order', () => {
    const result = resolveEffectiveDocPaths(
      [],
      ['skill-1', 'skill-2'],
      [
        { skillId: 'skill-1', path: 'docs/z.md', order: 1 },
        { skillId: 'skill-1', path: 'docs/y.md', order: 0 },
        { skillId: 'skill-2', path: 'docs/x.md', order: 0 },
      ],
    );
    expect(result).toEqual(['docs/y.md', 'docs/z.md', 'docs/x.md']);
  });

  it('dedupes by first occurrence, across agent/skill and skill/skill', () => {
    const result = resolveEffectiveDocPaths(
      ['specs/shared.md'],
      ['skill-1', 'skill-2'],
      [
        { skillId: 'skill-1', path: 'specs/shared.md', order: 0 },
        { skillId: 'skill-1', path: 'docs/only-skill-1.md', order: 1 },
        { skillId: 'skill-2', path: 'docs/only-skill-1.md', order: 0 },
      ],
    );
    expect(result).toEqual(['specs/shared.md', 'docs/only-skill-1.md']);
  });

  it('ignores docs belonging to a skill id not in the enabled list', () => {
    const result = resolveEffectiveDocPaths(
      [],
      ['skill-1'],
      [
        { skillId: 'skill-1', path: 'docs/enabled.md', order: 0 },
        { skillId: 'skill-2', path: 'docs/disabled.md', order: 0 },
      ],
    );
    expect(result).toEqual(['docs/enabled.md']);
  });

  it('returns [] for empty input', () => {
    expect(resolveEffectiveDocPaths([], [], [])).toEqual([]);
  });
});
