/**
 * PR-list rollup helpers (`modules/pulls/status.ts`) — the pure derivation that
 * decides each PR's review STATUS and tallies its FINDINGS for the list. The DB
 * `status` column holds GitHub's merge state; the review status
 * (needs_review / reviewed / stale) is derived here from head vs lastReviewedSha
 * + age, so it gets unit coverage independent of the route's queries.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveReviewStatus,
  rollupSeverities,
  toFindingsRollup,
  plainTextPreview,
  FINDINGS_PREVIEW_LIMIT,
  STALE_DAYS,
  type FindingRollupRow,
} from '../src/modules/pulls/status.js';

const DAY = 86_400_000;
const now = Date.UTC(2026, 5, 11);

describe('deriveReviewStatus', () => {
  it('needs_review when never reviewed, or when head moved since the last review', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: null, headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'old', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('needs_review');
  });

  it('reviewed when the current head was reviewed and the PR is recent', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'open', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now - DAY), now }),
    ).toBe('reviewed');
  });

  it('stale when the current head was reviewed but the PR is older than STALE_DAYS', () => {
    expect(
      deriveReviewStatus({
        ghStatus: 'open',
        lastReviewedSha: 'abc',
        headSha: 'abc',
        updatedAt: new Date(now - (STALE_DAYS + 1) * DAY),
        now,
      }),
    ).toBe('stale');
  });

  it('keeps merged/closed regardless of review state', () => {
    expect(
      deriveReviewStatus({ ghStatus: 'merged', lastReviewedSha: null, headSha: 'abc', updatedAt: null, now }),
    ).toBe('merged');
    expect(
      deriveReviewStatus({ ghStatus: 'closed', lastReviewedSha: 'abc', headSha: 'abc', updatedAt: new Date(now), now }),
    ).toBe('closed');
  });
});

describe('rollupSeverities', () => {
  it('tallies findings into critical / warning / suggestion buckets (ignores unknown)', () => {
    expect(
      rollupSeverities([
        { severity: 'CRITICAL' },
        { severity: 'CRITICAL' },
        { severity: 'WARNING' },
        { severity: 'SUGGESTION' },
        { severity: 'WEIRD' },
      ]),
    ).toEqual({ critical: 2, warning: 1, suggestion: 1 });
  });

  it('is all-zero for no findings', () => {
    expect(rollupSeverities([])).toEqual({ critical: 0, warning: 0, suggestion: 0 });
  });
});

function row(overrides: Partial<FindingRollupRow>): FindingRollupRow {
  return {
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    file: 'src/config.ts',
    startLine: 12,
    endLine: 12,
    confidence: 0.98,
    rationale: 'A secret is committed.',
    ...overrides,
  };
}

describe('plainTextPreview', () => {
  it('collapses whitespace and strips backticks/fences', () => {
    expect(plainTextPreview('line one\n\nline  two')).toBe('line one line two');
    expect(plainTextPreview('has `inline code` and\n```\nfenced\n```\nblock')).toBe(
      'has inline code and block',
    );
  });

  it('truncates only when over the limit, appending an ellipsis', () => {
    expect(plainTextPreview('short', 10)).toBe('short');
    expect(plainTextPreview('a much longer sentence than the limit', 10)).toBe('a much lon…');
  });
});

describe('toFindingsRollup', () => {
  it('total counts every row, including severities outside the three buckets', () => {
    const rollup = toFindingsRollup([
      row({ severity: 'CRITICAL' }),
      row({ severity: 'WEIRD' }),
    ]);
    expect(rollup.total).toBe(2);
    expect(rollup.critical).toBe(1);
  });

  it('caps the preview at the limit while counts still reflect every row', () => {
    const rows = Array.from({ length: FINDINGS_PREVIEW_LIMIT + 3 }, (_, i) =>
      row({ severity: 'WARNING', file: `src/f${i}.ts` }),
    );
    const rollup = toFindingsRollup(rows);
    expect(rollup.warning).toBe(rows.length);
    expect(rollup.preview).toHaveLength(FINDINGS_PREVIEW_LIMIT);
  });

  it('orders the preview CRITICAL → WARNING → SUGGESTION, then file, then start line', () => {
    const rollup = toFindingsRollup([
      row({ severity: 'SUGGESTION', file: 'b.ts', startLine: 1, title: 'sugg' }),
      row({ severity: 'CRITICAL', file: 'b.ts', startLine: 5, title: 'crit-b' }),
      row({ severity: 'CRITICAL', file: 'a.ts', startLine: 1, title: 'crit-a' }),
      row({ severity: 'WARNING', file: 'a.ts', startLine: 1, title: 'warn' }),
    ]);
    expect(rollup.preview.map((p) => p.title)).toEqual(['crit-a', 'crit-b', 'warn', 'sugg']);
  });

  it('description is truncated single-line text, not the raw rationale', () => {
    const rollup = toFindingsRollup([row({ rationale: 'line one\nline two' })]);
    expect(rollup.preview[0]!.description).toBe('line one line two');
  });

  it('empty input rolls up to all zeros and an empty preview (not null — that is the repository layer’s job)', () => {
    expect(toFindingsRollup([])).toEqual({
      critical: 0,
      warning: 0,
      suggestion: 0,
      total: 0,
      preview: [],
    });
  });
});
