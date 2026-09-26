import { describe, it, expect } from 'vitest';
import { buildIntentSources, reconstructHunkHeader } from '../src/modules/intent/sources.js';
import { clampConfidence } from '../src/modules/intent/helpers.js';
import { buildIntentMessages } from '../src/modules/intent/prompt.js';

/**
 * Hermetic coverage for the deterministic source assembly + confidence
 * clamp — the pure core of the L03 intent derivation. No Drizzle, no LLM.
 */

// A fixture diff hunk with real added/removed line text — never handed to
// buildIntentSources directly (there is no content field to pass); only its
// NUMERIC fields feed reconstructHunkHeader, proving the no-diff-bodies rule
// holds even when a caller has the full diff in scope.
const FIXTURE_HUNK = {
  file: 'src/secret.ts',
  oldStart: 10,
  oldLines: 3,
  newStart: 10,
  newLines: 5,
  newLineNumbers: [10, 11, 12, 13, 14],
};
const FIXTURE_DIFF_ADDED_LINE = '+  const apiKey = "sk-should-never-appear-in-a-prompt";';
const FIXTURE_DIFF_REMOVED_LINE = '-  const apiKey = OLD_KEY;';

describe('buildIntentSources — no-diff-bodies rule', () => {
  it('never lets a raw diff line reach the rendered prompt blocks', () => {
    const header = reconstructHunkHeader(FIXTURE_HUNK);
    expect(header).toBe('@@ -10,3 +10,5 @@');

    const { sources, blocks } = buildIntentSources({
      title: 'Rotate API key handling',
      body: 'Rewrites how the secret is loaded.',
      issues: [],
      specs: [],
      files: ['src/secret.ts'],
      hunks: [{ file: FIXTURE_HUNK.file, header }],
      commits: ['Rotate key'],
    });

    const messages = buildIntentMessages(blocks);
    const rendered = messages.map((m) => m.content).join('\n');

    expect(rendered).not.toContain(FIXTURE_DIFF_ADDED_LINE);
    expect(rendered).not.toContain(FIXTURE_DIFF_REMOVED_LINE);
    expect(rendered.split('\n').some((line) => /^[+-]/.test(line.trim()))).toBe(false);

    const hunksSource = sources.find((s) => s.kind === 'hunks');
    expect(hunksSource?.status).toBe('used');
  });
});

describe('buildIntentSources — absence / unavailable accounting', () => {
  it('title-only input records every other source as absent, with no invented text', () => {
    const { sources, blocks } = buildIntentSources({
      title: 'Fix the thing',
      body: null,
      issues: [],
      specs: [],
      files: [],
      hunks: [],
      commits: [],
    });

    expect(sources.find((s) => s.kind === 'title')).toMatchObject({ status: 'used' });
    expect(sources.find((s) => s.kind === 'body')).toMatchObject({ status: 'absent' });
    expect(sources.find((s) => s.kind === 'files')).toMatchObject({ status: 'absent' });
    expect(sources.find((s) => s.kind === 'hunks')).toMatchObject({ status: 'absent' });
    expect(sources.find((s) => s.kind === 'commits')).toMatchObject({ status: 'absent' });
    // Only the title block is rendered — nothing fabricated for absent sources.
    expect(blocks).toHaveLength(1);
    expect(blocks[0].label).toBe('pr-title');
  });

  it('a failed issue fetch is recorded unavailable, with no body/title fabricated', () => {
    const { sources, blocks } = buildIntentSources({
      title: 'Fix #412',
      body: 'See #412.',
      issues: [{ ref: '#412', keyworded: false, status: 'unavailable' }],
      specs: [],
      files: [],
      hunks: [],
      commits: [],
    });

    const issueSource = sources.find((s) => s.kind === 'issue_unkeyworded');
    expect(issueSource).toMatchObject({ status: 'unavailable', ref: '#412', chars: null });
    expect(blocks.some((b) => b.label.startsWith('issue:'))).toBe(false);
  });
});

describe('clampConfidence', () => {
  const absentEverything = buildIntentSources({
    title: 'Fix the thing',
    body: null,
    issues: [],
    specs: [],
    files: [],
    hunks: [],
    commits: [],
  }).sources;

  it('caps at "low" when the PR has no body, issue, or spec/plan — title/paths only', () => {
    expect(clampConfidence('high', absentEverything)).toBe('low');
    expect(clampConfidence('medium', absentEverything)).toBe('low');
    expect(clampConfidence('low', absentEverything)).toBe('low');
  });

  it('caps at "medium" when any source is unavailable, even with a rich body', () => {
    const sourcesWithGap = buildIntentSources({
      title: 'Fix #412',
      body: 'Detailed rationale for the change.',
      issues: [{ ref: '#412', keyworded: true, status: 'unavailable' }],
      specs: [],
      files: [],
      hunks: [],
      commits: [],
    }).sources;

    expect(clampConfidence('high', sourcesWithGap)).toBe('medium');
    expect(clampConfidence('medium', sourcesWithGap)).toBe('medium');
    expect(clampConfidence('low', sourcesWithGap)).toBe('low');
  });

  it('allows "high" only when a rich source is used and nothing is unavailable', () => {
    const richSources = buildIntentSources({
      title: 'Fix #412',
      body: 'Detailed rationale for the change.',
      issues: [{ ref: '#412', keyworded: true, status: 'used', title: 'Bug', body: 'Details' }],
      specs: [],
      files: [],
      hunks: [],
      commits: [],
    }).sources;

    expect(clampConfidence('high', richSources)).toBe('high');
    expect(clampConfidence('medium', richSources)).toBe('medium');
  });

  it('never clamps UP — a model proposing "low" stays "low" even with rich sources', () => {
    const richSources = buildIntentSources({
      title: 'Fix #412',
      body: 'Detailed rationale for the change.',
      issues: [],
      specs: [],
      files: [],
      hunks: [],
      commits: [],
    }).sources;
    expect(clampConfidence('low', richSources)).toBe('low');
  });
});
