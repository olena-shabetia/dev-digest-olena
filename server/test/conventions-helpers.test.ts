import { describe, it, expect } from 'vitest';
import {
  normalizeRelPath,
  normalizeRuleText,
  verifyEvidence,
  dedupeCandidates,
  toConventionDto,
  toScanDto,
  buildSkillMarkdown,
  collectEvidenceFiles,
  groupByCategory,
  blobUrl,
} from '../src/modules/conventions/helpers.js';
import { diversifyByTopLevelDir, clampFile, numberLines } from '../src/modules/conventions/sampler.js';
import type { RawCandidate, SampledFile, VerifiedOccurrence } from '../src/modules/conventions/types.js';
import type { ConventionCandidate } from '@devdigest/shared';

/**
 * Hermetic (no DB) coverage for the conventions module's pure helpers:
 * evidence verification (every rejection path), dedupe/merge, DTO mapping
 * (derived evidence_url), skill-markdown rendering, and the sampler's pure
 * pieces (diversify/clamp/number).
 */

function sample(path: string, lines: string[]): SampledFile {
  return { path, lines };
}

describe('normalizeRelPath / normalizeRuleText', () => {
  it('strips a leading "./" and normalizes backslashes', () => {
    expect(normalizeRelPath('./src/foo.ts')).toBe('src/foo.ts');
    expect(normalizeRelPath('src\\foo.ts')).toBe('src/foo.ts');
    expect(normalizeRelPath('/src/foo.ts')).toBe('src/foo.ts');
  });

  it('collapses whitespace and case for rule grouping', () => {
    expect(normalizeRuleText('  Always   use  Zod  ')).toBe('always use zod');
  });
});

describe('verifyEvidence', () => {
  const files = new Map<string, SampledFile>([
    ['src/foo.ts', sample('src/foo.ts', ['export function foo() {}', '', 'const x = 1;'])],
  ]);

  function candidate(overrides: Partial<RawCandidate['evidence']> = {}, rest: Partial<RawCandidate> = {}): RawCandidate {
    return {
      category: 'naming',
      rule: 'Use camelCase for functions',
      evidence: { file: 'src/foo.ts', line: 1, ...overrides },
      confidence: 0.7,
      ...rest,
    };
  }

  it('verifies a candidate whose cited file:line is real and non-blank', () => {
    const result = verifyEvidence(candidate(), files, 'abc123');
    expect(result).not.toBeNull();
    expect(result!.path).toBe('src/foo.ts');
    expect(result!.line).toBe(1);
    expect(result!.sha).toBe('abc123');
    expect(result!.snippet).toContain('export function foo()');
  });

  it('rejects a file not in the sampled allowlist', () => {
    const result = verifyEvidence(candidate({ file: 'src/not-shown.ts' } as never), files, null);
    expect(result).toBeNull();
  });

  it('rejects a candidate citing a file not shown, even with a valid-looking line', () => {
    const bad = candidate();
    bad.evidence.file = 'src/other.ts';
    expect(verifyEvidence(bad, files, null)).toBeNull();
  });

  it('rejects an out-of-range line (too high)', () => {
    const bad = candidate();
    bad.evidence.line = 999;
    expect(verifyEvidence(bad, files, null)).toBeNull();
  });

  it('rejects an out-of-range line (zero / non-positive)', () => {
    const bad = candidate();
    bad.evidence.line = 0;
    expect(verifyEvidence(bad, files, null)).toBeNull();
  });

  it('rejects a blank cited line', () => {
    const bad = candidate();
    bad.evidence.line = 2; // the blank line in the fixture
    expect(verifyEvidence(bad, files, null)).toBeNull();
  });

  it('captures a snippet with up to ±2 lines of context around the cited line', () => {
    const bigFile = new Map([
      ['src/big.ts', sample('src/big.ts', ['a', 'b', 'c', 'd', 'e', 'f', 'g'])],
    ]);
    const c = candidate({ file: 'src/big.ts', line: 4 } as never);
    const result = verifyEvidence(c, bigFile, null);
    expect(result!.snippet).toBe('b\nc\nd\ne\nf');
  });
});

describe('dedupeCandidates', () => {
  const rankOf = (path: string) => ({ 'src/a.ts': 2, 'src/b.ts': 1 })[path] ?? 0;

  it('merges occurrences with the same category + normalized rule into one candidate', () => {
    const occurrences: VerifiedOccurrence[] = [
      { path: 'src/a.ts', line: 1, snippet: 's1', sha: null, category: 'naming', rule: 'Use camelCase', confidence: 0.5 },
      { path: 'src/b.ts', line: 2, snippet: 's2', sha: null, category: 'naming', rule: 'use CAMELCASE', confidence: 0.9 },
    ];
    const merged = dedupeCandidates(occurrences, rankOf);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.confidence).toBe(0.9); // max of the merged set
    expect(merged[0]!.evidences).toHaveLength(2);
    // Highest-ranked path first.
    expect(merged[0]!.evidences[0]!.path).toBe('src/a.ts');
  });

  it('keeps distinct rules as separate candidates', () => {
    const occurrences: VerifiedOccurrence[] = [
      { path: 'src/a.ts', line: 1, snippet: 's1', sha: null, category: 'naming', rule: 'Rule A', confidence: 0.5 },
      { path: 'src/b.ts', line: 2, snippet: 's2', sha: null, category: 'testing', rule: 'Rule B', confidence: 0.6 },
    ];
    expect(dedupeCandidates(occurrences, rankOf)).toHaveLength(2);
  });

  it('caps evidences per candidate and sorts merged output by confidence desc', () => {
    const many: VerifiedOccurrence[] = Array.from({ length: 8 }, (_, i) => ({
      path: `src/f${i}.ts`,
      line: 1,
      snippet: 's',
      sha: null,
      category: 'other' as const,
      rule: 'Same rule',
      confidence: 0.4,
    }));
    const merged = dedupeCandidates(many, () => 0);
    expect(merged[0]!.evidences.length).toBeLessThanOrEqual(5);
  });
});

describe('DTO mapping', () => {
  const repo = { owner: 'acme', name: 'widgets' };

  it('derives evidence_url from sha+line, null when either is missing', () => {
    expect(blobUrl(repo, 'sha1', 'src/a.ts', 10)).toBe(
      'https://github.com/acme/widgets/blob/sha1/src/a.ts#L10',
    );
    expect(blobUrl(repo, null, 'src/a.ts', 10)).toBeNull();
    expect(blobUrl(repo, 'sha1', 'src/a.ts', null)).toBeNull();
  });

  it('toConventionDto maps a row + derives evidence_url / evidences[].url', () => {
    const row = {
      id: 'c1',
      repoId: 'r1',
      scanId: 's1',
      category: 'naming',
      rule: 'Use camelCase',
      evidencePath: 'src/a.ts',
      evidenceLine: 5,
      evidenceSnippet: 'const x = 1;',
      evidenceSha: 'sha1',
      evidences: [{ path: 'src/a.ts', line: 5, snippet: 'const x = 1;', sha: 'sha1' }],
      confidence: 0.8,
      status: 'pending',
      edited: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    const dto = toConventionDto(row, repo);
    expect(dto.evidence_url).toBe('https://github.com/acme/widgets/blob/sha1/src/a.ts#L5');
    expect(dto.evidences[0]!.url).toBe('https://github.com/acme/widgets/blob/sha1/src/a.ts#L5');
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
    expect(dto).not.toHaveProperty('createdAt');
  });

  it('toScanDto maps a scan row to the public shape', () => {
    const dto = toScanDto({
      id: 's1',
      repoId: 'r1',
      status: 'done',
      sha: 'sha1',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      candidatesProposed: 8,
      candidatesVerified: 3,
      degraded: false,
      degradedReason: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    expect(dto.candidates_proposed).toBe(8);
    expect(dto.candidates_verified).toBe(3);
    expect(dto.created_at).toBe('2026-01-01T00:00:00.000Z');
  });
});

describe('buildSkillMarkdown / groupByCategory / collectEvidenceFiles', () => {
  function dto(overrides: Partial<ConventionCandidate>): ConventionCandidate {
    return {
      id: 'c1',
      repo_id: 'r1',
      scan_id: null,
      category: 'naming',
      rule: 'Use camelCase',
      evidence_path: 'src/a.ts',
      evidence_line: 1,
      evidence_snippet: 'x',
      evidence_sha: 'sha1',
      evidence_url: 'https://github.com/acme/widgets/blob/sha1/src/a.ts#L1',
      evidences: [{ path: 'src/a.ts', line: 1, snippet: 'x', sha: 'sha1', url: 'u' }],
      confidence: 0.8,
      status: 'accepted',
      edited: false,
      created_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  it('renders a placeholder body when nothing is accepted', () => {
    expect(buildSkillMarkdown([], 'acme/widgets')).toContain('No accepted conventions yet.');
  });

  it('groups accepted candidates by category with evidence links', () => {
    const body = buildSkillMarkdown([dto({}), dto({ category: 'testing', rule: 'Cover edge cases' })], 'acme/widgets');
    expect(body).toContain('## naming');
    expect(body).toContain('## testing');
    expect(body).toContain('Use camelCase');
    expect(body).toContain('[src/a.ts:1]');
  });

  it('collectEvidenceFiles dedupes across candidates, order-preserving', () => {
    const files = collectEvidenceFiles([
      dto({}),
      dto({ evidences: [{ path: 'src/a.ts', line: 1, snippet: 'x', sha: 'sha1', url: 'u' }, { path: 'src/b.ts', line: 2, snippet: 'y', sha: 'sha1', url: 'u2' }] }),
    ]);
    expect(files).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('groupByCategory preserves first-seen order within a group', () => {
    const groups = groupByCategory([dto({ rule: 'First' }), dto({ rule: 'Second' })]);
    expect(groups.get('naming')!.map((c) => c.rule)).toEqual(['First', 'Second']);
  });
});

describe('sampler pure helpers', () => {
  it('diversifyByTopLevelDir caps files per top-level directory', () => {
    const paths = ['a/1.ts', 'a/2.ts', 'a/3.ts', 'b/1.ts', 'c/1.ts'];
    const out = diversifyByTopLevelDir(paths, 10, 2);
    expect(out).toEqual(['a/1.ts', 'a/2.ts', 'b/1.ts', 'c/1.ts']);
  });

  it('diversifyByTopLevelDir still respects the overall limit', () => {
    const paths = ['a/1.ts', 'b/1.ts', 'c/1.ts', 'd/1.ts'];
    expect(diversifyByTopLevelDir(paths, 2, 2)).toEqual(['a/1.ts', 'b/1.ts']);
  });

  it('clampFile caps line count', () => {
    const content = Array.from({ length: 10 }, (_, i) => `line${i}`).join('\n');
    expect(clampFile(content, 3)).toEqual(['line0', 'line1', 'line2']);
  });

  it('numberLines prefixes 1-based gutter numbers', () => {
    expect(numberLines(['a', 'b'])).toBe('1\ta\n2\tb');
  });
});
