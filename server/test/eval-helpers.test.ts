import { describe, expect, it } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import { parseUnifiedDiff } from '../src/platform/diff.js';
import {
  buildCompare,
  buildDraftDiff,
  deriveExpectationType,
  lastResultForCase,
  metricDeltas,
  toCaseDetail,
  toCaseListItem,
  toRunSummary,
  validateCaseDiff,
  validateCaseName,
  validateExpectation,
} from '../src/modules/eval/helpers.js';
import type { StoredEvalCase, StoredEvalSetRun } from '../src/modules/eval/types.js';

const ONE = 'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n+one\n+two\n+three';

function thrown(fn: () => unknown): { code: string; details: unknown } {
  try {
    fn();
  } catch (e) {
    const err = e as { code: string; details: unknown };
    return { code: err.code, details: err.details };
  }
  throw new Error('did not throw');
}

describe('validateCaseDiff', () => {
  it('accepts a one-file diff and returns the file', () => {
    expect(validateCaseDiff(parseUnifiedDiff(ONE)).path).toBe('src/a.ts');
  });

  it.each([
    ['empty', '   \n', 'empty'],
    ['plain prose', 'just some words', 'unparseable'],
    [
      'two files',
      `${ONE}\ndiff --git a/b.ts b/b.ts\n--- a/b.ts\n+++ b/b.ts\n@@ -1,1 +1,1 @@\n+x`,
      'multiple_files',
    ],
    [
      'two bare +++ blocks',
      '--- a/f\n+++ b/f\n@@ -1,1 +1,1 @@\n+a\n--- a/g\n+++ b/g\n@@ -5,1 +5,1 @@\n+b',
      'multiple_files',
    ],
    ['no hunk', 'diff --git a/x b/x\n--- a/x\n+++ b/x', 'no_hunk'],
  ])('rejects %s', (_n, raw, reason) => {
    const t = thrown(() => validateCaseDiff(parseUnifiedDiff(raw)));
    expect(t.code).toBe('eval_invalid_diff');
    expect(t.details).toEqual({ field: 'input_diff', reason });
  });
});

describe('validateExpectation', () => {
  const file = validateCaseDiff(parseUnifiedDiff(ONE));
  const ok = { file: 'src/a.ts', start_line: 1, end_line: 2 };

  it('accepts a range inside a hunk', () => {
    expect(validateExpectation(ok, file)).toEqual(ok);
  });

  it.each([
    ['empty file', { ...ok, file: '' }, 'expectation.file', 'file_empty'],
    ['other file', { ...ok, file: 'src/b.ts' }, 'expectation.file', 'file_mismatch'],
    ['line 0', { ...ok, start_line: 0 }, 'expectation.start_line', 'line_not_positive_integer'],
    ['line 1.5', { ...ok, end_line: 1.5 }, 'expectation.end_line', 'line_not_positive_integer'],
    ['start after end', { ...ok, start_line: 3, end_line: 2 }, 'expectation.start_line', 'start_after_end'],
    ['off every hunk', { ...ok, start_line: 50, end_line: 60 }, 'expectation.end_line', 'outside_hunks'],
  ])('rejects %s', (_n, loc, field, reason) => {
    const t = thrown(() => validateExpectation(loc, file));
    expect(t.code).toBe('eval_invalid_expectation');
    expect(t.details).toEqual({ field, reason });
  });
});

describe('validateCaseName', () => {
  it('trims and rejects empty', () => {
    expect(validateCaseName('  hi ')).toBe('hi');
    const t = thrown(() => validateCaseName('  '));
    expect(t.code).toBe('eval_invalid_name');
    expect(t.details).toEqual({ field: 'name', reason: 'empty' });
  });
});

function roundTrip(
  r: { inputDiff: string; needsRelocation: boolean } | null,
  loc?: { file: string; start_line: number; end_line: number },
) {
  expect(r).not.toBeNull();
  const file = validateCaseDiff(parseUnifiedDiff(r!.inputDiff));
  if (loc && !r!.needsRelocation) validateExpectation(loc, file);
  return file;
}

describe('buildDraftDiff', () => {
  const TWO_HUNKS =
    'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n' +
    '@@ -1,1 +1,2 @@\n+a1\n+a2\n@@ -20,1 +30,2 @@\n+b1\n+b2';

  it('selects only the hunk the range is in', () => {
    const d = parseUnifiedDiff(TWO_HUNKS);
    const r = buildDraftDiff(d, { file: 'src/a.ts', startLine: 30, endLine: 30, kind: 'finding' });
    const f = roundTrip(r, { file: 'src/a.ts', start_line: 30, end_line: 30 });
    expect(r!.needsRelocation).toBe(false);
    expect(f.hunks).toHaveLength(1);
    expect(f.hunks[0]!.newLineNumbers).toEqual([30, 31]);
  });

  it('keeps both hunks when the range spans them', () => {
    const d = parseUnifiedDiff(TWO_HUNKS);
    const r = buildDraftDiff(d, { file: 'src/a.ts', startLine: 2, endLine: 30, kind: 'finding' });
    expect(roundTrip(r, { file: 'src/a.ts', start_line: 2, end_line: 30 }).hunks).toHaveLength(2);
  });

  it('full-file kind off every hunk -> all hunks, needsRelocation', () => {
    const d = parseUnifiedDiff(TWO_HUNKS);
    const r = buildDraftDiff(d, { file: 'src/a.ts', startLine: 100, endLine: 100, kind: 'secret_leak' });
    expect(r!.needsRelocation).toBe(true);
    expect(roundTrip(r).hunks).toHaveLength(2);
  });

  it('a plain finding off every hunk is outdated', () => {
    const d = parseUnifiedDiff(TWO_HUNKS);
    expect(buildDraftDiff(d, { file: 'src/a.ts', startLine: 100, endLine: 100, kind: 'finding' })).toBeNull();
  });

  it('unknown file is outdated', () => {
    const d = parseUnifiedDiff(TWO_HUNKS);
    expect(buildDraftDiff(d, { file: 'nope.ts', startLine: 1, endLine: 1, kind: 'finding' })).toBeNull();
  });

  it('round-trips the last line and the phantom line of a diff ending in a newline', () => {
    const raw = `${ONE}\n`; // lines 1..3, phantom line 4
    const d = parseUnifiedDiff(raw);
    expect(d.files[0]!.hunks[0]!.newLineNumbers).toEqual([1, 2, 3, 4]);
    for (const line of [3, 4]) {
      const r = buildDraftDiff(d, { file: 'src/a.ts', startLine: line, endLine: line, kind: 'finding' });
      const f = roundTrip(r, { file: 'src/a.ts', start_line: line, end_line: line });
      expect(f.hunks[0]!.newLineNumbers).toEqual([1, 2, 3, 4]);
    }
  });

  it('does not capture a file whose path merely extends the finding path', () => {
    const raw =
      'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,1 +1,1 @@\n+x\n' +
      'diff --git a/src/a.tsx b/src/a.tsx\n--- a/src/a.tsx\n+++ b/src/a.tsx\n@@ -1,1 +1,1 @@\n+y';
    const d = parseUnifiedDiff(raw);
    const r = buildDraftDiff(d, { file: 'src/a.ts', startLine: 1, endLine: 1, kind: 'finding' });
    expect(r!.inputDiff).toContain('+x');
    expect(r!.inputDiff).not.toContain('+y');
    expect(r!.inputDiff).not.toContain('a.tsx');
    roundTrip(r, { file: 'src/a.ts', start_line: 1, end_line: 1 });
  });
});

describe('deriveExpectationType', () => {
  it('maps decisions', () => {
    const now = new Date();
    expect(deriveExpectationType({ acceptedAt: now, dismissedAt: null })).toBe('must_find');
    expect(deriveExpectationType({ acceptedAt: null, dismissedAt: now })).toBe('must_not_flag');
    expect(deriveExpectationType({ acceptedAt: null, dismissedAt: null })).toBeNull();
  });
});

function run(over: Partial<StoredEvalSetRun>): StoredEvalSetRun {
  return {
    id: 'r',
    workspaceId: 'w',
    agentId: 'a',
    status: 'completed',
    error: null,
    agentVersion: 1,
    provider: 'openai',
    model: 'm',
    strategy: 's',
    systemPrompt: 'p',
    skills: [],
    cases: [],
    results: [],
    casesTotal: 0,
    casesDone: 0,
    casesPassed: 0,
    casesErrored: 0,
    recall: 0.5,
    precision: 0.5,
    citationAccuracy: 1,
    durationMs: 10,
    costUsd: 1,
    startedAt: new Date('2026-01-01T00:00:00Z'),
    finishedAt: new Date('2026-01-01T00:01:00Z'),
    ...over,
  };
}

const result = (case_id: string, status: 'passed' | 'failed' = 'passed') => ({
  case_id,
  case_name: case_id,
  expectation_type: 'must_find' as const,
  status,
  matched: 1,
  expected: 1,
  surviving: 1,
  pre_gate: 1,
  post_gate: 1,
  duration_ms: 5,
  cost_usd: 0.1,
  error: null,
});

describe('lastResultForCase', () => {
  it('skips newer failed/running runs in favour of an older completed one', () => {
    const runs = [
      run({ id: 'run', status: 'running', results: [result('c1', 'failed')] }),
      run({ id: 'fail', status: 'failed', results: [result('c1', 'failed')] }),
      run({ id: 'ok', status: 'completed', results: [result('c1', 'passed')] }),
    ];
    const last = lastResultForCase(runs, 'c1');
    expect(last?.run_id).toBe('ok');
    expect(last?.status).toBe('passed');
    expect(lastResultForCase(runs.slice(0, 2), 'c1')).toBeNull();
  });
});

describe('DTO mappers', () => {
  const exp: EvalExpectation = {
    type: 'must_find', file: 'a', start_line: 1, end_line: 1, severity: 'WARNING', category: 'bug', title: 't',
  };
  const c: StoredEvalCase = {
    id: 'c', workspaceId: 'w', agentId: 'a', sourceFindingId: null, name: 'n', inputDiff: 'd',
    pr: { number: 1, title: 't', body: null, head_sha: 'h' }, expectation: exp,
    createdAt: new Date('2026-01-01T00:00:00Z'), updatedAt: new Date('2026-01-02T00:00:00Z'),
  };
  it('emits ISO strings and drops heavy fields on list items', () => {
    const d = toCaseDetail(c, 'Agent', null);
    expect(d.created_at).toBe('2026-01-01T00:00:00.000Z');
    const li = toCaseListItem(c, 'Agent', null);
    expect('input_diff' in li).toBe(false);
    expect('pr' in li).toBe(false);
    const s = toRunSummary(run({ agentVersion: 3 }), 'Agent');
    expect(s.version_label).toBe('v3');
    expect(s.started_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('metricDeltas / buildCompare', () => {
  it('orders by startedAt regardless of argument order and flags warnings', () => {
    const older = run({
      id: 'old', startedAt: new Date('2026-01-01T00:00:00Z'), recall: 0.5, costUsd: 1,
      cases: [{ case_id: 'a', updated_at: 't1' }, { case_id: 'b', updated_at: 't1' }, { case_id: 'x', updated_at: 't1' }],
      skills: [{ id: 's1', name: 's', version: 1 }],
    });
    const newer = run({
      id: 'new', startedAt: new Date('2026-02-01T00:00:00Z'), recall: 0.75, precision: null, costUsd: 3,
      systemPrompt: 'changed', model: 'm2',
      cases: [{ case_id: 'a', updated_at: 't1' }, { case_id: 'b', updated_at: 't2' }, { case_id: 'y', updated_at: 't1' }],
      skills: [{ id: 's1', name: 's', version: 2 }],
    });
    const cmp = buildCompare(newer, older, 'Agent');
    expect(cmp.base.id).toBe('old');
    expect(cmp.head.id).toBe('new');
    expect(cmp.delta.recall).toBeCloseTo(0.25);
    expect(cmp.delta.precision).toBeNull();
    expect(cmp.delta.cost_usd).toBe(2);
    expect(cmp.prompt_changed).toBe(true);
    expect(cmp.model_changed).toBe(true);
    expect(cmp.skills_changed).toBe(true);
    expect(cmp.cases_only_in_base).toEqual(['x']);
    expect(cmp.cases_only_in_head).toEqual(['y']);
    expect(cmp.cases_edited).toEqual(['b']);
    expect(cmp.comparable).toBe(false);
    expect(metricDeltas(newer, older).recall).toBeCloseTo(0.25);
    expect(buildCompare(older, older, 'A').comparable).toBe(true);
  });
});
