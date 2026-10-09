import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import {
  matches,
  scoreCase,
  scoreRun,
  type ScoringCaseInput,
  type ScoringExpectation,
  type ScoringFinding,
} from '../src/modules/eval/scoring.js';

const F = 'src/a.ts';
const exp = (type: ScoringExpectation['type'], s = 10, e = 12, file = F): ScoringExpectation => ({
  type,
  file,
  start_line: s,
  end_line: e,
});
const fnd = (s: number, e = s, file = F): ScoringFinding => ({ file, start_line: s, end_line: e });
const kase = (
  caseId: string,
  expectations: ScoringExpectation[],
  surviving: ScoringFinding[],
  dropped = 0,
  errored = false,
): ScoringCaseInput => ({
  caseId,
  expectations,
  surviving,
  preGate: surviving.length + dropped,
  postGate: surviving.length,
  errored,
});

describe('matches', () => {
  it('applies closed ranges with no tolerance', () => {
    expect(matches(fnd(12), exp('must_find', 12, 12))).toBe(true);
    expect(matches(fnd(12), exp('must_find', 10, 12))).toBe(true);
    expect(matches(fnd(12), exp('must_find', 12, 20))).toBe(true);
    expect(matches(fnd(12), exp('must_find', 13, 20))).toBe(false);
    expect(matches(fnd(10, 12), exp('must_find', 13, 15))).toBe(false);
  });
  it('normalises reversed ranges and is case-sensitive on path', () => {
    expect(matches(fnd(12, 10), exp('must_find', 11, 11))).toBe(true);
    expect(matches(fnd(11), exp('must_find', 12, 10))).toBe(true);
    expect(matches(fnd(11, 11, 'SRC/a.ts'), exp('must_find'))).toBe(false);
  });
});

describe('edge-case table', () => {
  it('set has only must_not_flag cases: recall null', () => {
    const r = scoreRun([kase('c1', [exp('must_not_flag')], [fnd(50)])]);
    expect(r.recall).toBeNull();
    expect(r.precision).toBe(1);
    expect(r.citation_accuracy).toBe(1);
  });

  it('agent emits nothing in every case', () => {
    const r = scoreRun([
      kase('a', [exp('must_find')], []),
      kase('b', [exp('must_not_flag')], []),
    ]);
    expect(r.recall).toBe(0);
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    expect(r.outcomes.a!.status).toBe('failed');
    expect(r.outcomes.b!.status).toBe('passed');

    const none = scoreRun([kase('b', [exp('must_not_flag')], [])]);
    expect(none.recall).toBeNull();
  });

  it('must_find matched plus 3 unrelated extras', () => {
    const r = scoreRun([kase('a', [exp('must_find')], [fnd(11), fnd(90), fnd(91), fnd(92)])]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.outcomes.a!.status).toBe('passed');
  });

  it('must_not_flag hit by 2 findings: FP = 2, fail', () => {
    const r = scoreRun([kase('a', [exp('must_not_flag')], [fnd(10), fnd(11), fnd(40), fnd(41)])]);
    expect(r.outcomes.a!.falsePositives).toBe(2);
    expect(r.precision).toBe(0.5);
    expect(r.citation_accuracy).toBe(1);
    expect(r.outcomes.a!.status).toBe('failed');
  });

  it('must_not_flag with a finding elsewhere passes and is not FP', () => {
    const r = scoreRun([kase('a', [exp('must_not_flag')], [fnd(80)])]);
    expect(r.outcomes.a!.status).toBe('passed');
    expect(r.precision).toBe(1);
  });

  it('dropped findings (outside hunks / path not in diff) lower citation only', () => {
    const r = scoreRun([kase('a', [exp('must_find')], [fnd(11)], 1)]);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.citation_accuracy).toBe(0.5);
    expect(r.outcomes.a!.status).toBe('passed');
    const r2 = scoreRun([kase('a', [exp('must_find')], [], 2)]);
    expect(r2.recall).toBe(0);
    expect(r2.citation_accuracy).toBe(0);
  });

  it('single-line finding on a range boundary matches', () => {
    expect(scoreCase({ expectations: [exp('must_find')], surviving: [fnd(12)], preGate: 1, postGate: 1, errored: false }).status).toBe('passed');
    expect(scoreCase({ expectations: [exp('must_find')], surviving: [fnd(10)], preGate: 1, postGate: 1, errored: false }).status).toBe('passed');
    expect(scoreCase({ expectations: [exp('must_not_flag')], surviving: [fnd(12)], preGate: 1, postGate: 1, errored: false }).status).toBe('failed');
  });

  it('one case errors, seven score: metrics over seven, eight covered', () => {
    const cases: ScoringCaseInput[] = [];
    for (let i = 0; i < 7; i++) cases.push(kase(`c${i}`, [exp('must_find')], [fnd(11)]));
    cases.push(kase('bad', [exp('must_find')], [fnd(11)], 0, true));
    const r = scoreRun(cases);
    expect(r.recall).toBe(1);
    expect(r.precision).toBe(1);
    expect(r.cases_total).toBe(8);
    expect(r.cases_passed).toBe(7);
    expect(r.cases_errored).toBe(1);
    expect(r.outcomes.bad!.status).toBe('errored');
  });

  it('every case errors: all metrics null', () => {
    const r = scoreRun([kase('a', [exp('must_find')], [], 0, true), kase('b', [exp('must_not_flag')], [], 0, true)]);
    expect(r.recall).toBeNull();
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    expect(r.cases_errored).toBe(2);
    expect(r.cases_passed).toBe(0);
  });

  it('several findings matching one must_find count once; zero expectations pass iff empty', () => {
    const r = scoreRun([kase('a', [exp('must_find')], [fnd(10), fnd(11), fnd(12)])]);
    expect(r.recall).toBe(1);
    expect(r.outcomes.a!.mustFindMatched).toBe(1);
    expect(scoreCase({ expectations: [], surviving: [], preGate: 0, postGate: 0, errored: false }).status).toBe('passed');
    expect(scoreCase({ expectations: [], surviving: [fnd(1)], preGate: 1, postGate: 1, errored: false }).status).toBe('failed');
  });
});

describe('zero I/O', () => {
  it('scoreRun touches no LLM and no network, and the file has no imports', () => {
    const llm = new MockLLMProvider();
    const fetchStub = vi.fn(() => {
      throw new Error('network');
    });
    vi.stubGlobal('fetch', fetchStub);
    try {
      const r = scoreRun([
        kase('a', [exp('must_find')], [fnd(11)], 1),
        kase('b', [exp('must_not_flag')], [fnd(11)]),
      ]);
      expect(r.cases_total).toBe(2);
    } finally {
      vi.unstubAllGlobals();
    }
    expect(llm.calls).toHaveLength(0);
    expect(fetchStub).not.toHaveBeenCalled();

    const src = readFileSync(
      fileURLToPath(new URL('../src/modules/eval/scoring.ts', import.meta.url)),
      'utf8',
    );
    expect(src.split('\n').some((l) => /^\s*import\b/.test(l))).toBe(false);
  });
});
