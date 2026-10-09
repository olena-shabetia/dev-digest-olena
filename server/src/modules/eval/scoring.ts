/**
 * Pure eval scoring (SPEC-11 "Scoring definitions"). No I/O, no imports:
 * the structural input types are defined here so the file is trivially
 * testable and provably free of side effects.
 */

export type ExpectationType = 'must_find' | 'must_not_flag';

export interface ScoringExpectation {
  type: ExpectationType;
  file: string;
  start_line: number;
  end_line: number;
}

export interface ScoringFinding {
  file: string;
  start_line: number;
  end_line: number;
}

export interface ScoringCaseInput {
  caseId: string;
  expectations: ScoringExpectation[];
  surviving: ScoringFinding[];
  preGate: number;
  postGate: number;
  errored: boolean;
}

export interface CaseOutcome {
  status: 'passed' | 'failed' | 'errored';
  matched: number;
  expected: number;
  matchedFlags: boolean[]; // one per surviving finding, same order
  mustFindTotal: number;
  mustFindMatched: number;
  falsePositives: number;
}

export interface RunScore {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  cases_passed: number;
  cases_total: number;
  cases_errored: number;
  outcomes: Record<string, CaseOutcome>;
}

/** Exact, case-sensitive path; closed ranges; both ranges min/max normalised. */
export function matches(f: ScoringFinding, e: ScoringExpectation): boolean {
  if (f.file !== e.file) return false;
  const fLo = Math.min(f.start_line, f.end_line);
  const fHi = Math.max(f.start_line, f.end_line);
  const eLo = Math.min(e.start_line, e.end_line);
  const eHi = Math.max(e.start_line, e.end_line);
  return fLo <= eHi && eLo <= fHi;
}

export function scoreCase(input: Omit<ScoringCaseInput, 'caseId'>): CaseOutcome {
  const { expectations, surviving, errored } = input;
  const mustFind = expectations.filter((e) => e.type === 'must_find');
  const mustNot = expectations.filter((e) => e.type === 'must_not_flag');

  if (errored) {
    return {
      status: 'errored',
      matched: 0,
      expected: mustFind.length,
      matchedFlags: surviving.map(() => false),
      mustFindTotal: mustFind.length,
      mustFindMatched: 0,
      falsePositives: 0,
    };
  }

  const matchedFlags = surviving.map((f) => expectations.some((e) => matches(f, e)));
  const mustFindMatched = mustFind.filter((e) => surviving.some((f) => matches(f, e))).length;
  const falsePositives = surviving.filter((f) => mustNot.some((e) => matches(f, e))).length;
  const mustNotPassed = mustNot.every((e) => !surviving.some((f) => matches(f, e)));
  const mustFindPassed = mustFindMatched === mustFind.length;

  const passed =
    expectations.length === 0 ? surviving.length === 0 : mustFindPassed && mustNotPassed;

  return {
    status: passed ? 'passed' : 'failed',
    matched: matchedFlags.filter(Boolean).length,
    expected: mustFind.length,
    matchedFlags,
    mustFindTotal: mustFind.length,
    mustFindMatched,
    falsePositives,
  };
}

export function scoreRun(cases: ScoringCaseInput[]): RunScore {
  const outcomes: Record<string, CaseOutcome> = {};
  let mustFindTotal = 0;
  let mustFindMatched = 0;
  let keptTotal = 0;
  let falsePositives = 0;
  let preGateTotal = 0;
  let postGateTotal = 0;
  let casesPassed = 0;
  let casesErrored = 0;

  for (const c of cases) {
    const outcome = scoreCase({
      expectations: c.expectations,
      surviving: c.surviving,
      preGate: c.preGate,
      postGate: c.postGate,
      errored: c.errored,
    });
    outcomes[c.caseId] = outcome;
    if (outcome.status === 'passed') casesPassed += 1;
    if (outcome.status === 'errored') {
      casesErrored += 1;
      continue; // errored cases are excluded from the three metrics
    }
    mustFindTotal += outcome.mustFindTotal;
    mustFindMatched += outcome.mustFindMatched;
    keptTotal += c.surviving.length;
    falsePositives += outcome.falsePositives;
    preGateTotal += c.preGate;
    postGateTotal += c.postGate;
  }

  return {
    recall: mustFindTotal === 0 ? null : mustFindMatched / mustFindTotal,
    precision: keptTotal === 0 ? null : 1 - falsePositives / keptTotal,
    citation_accuracy: preGateTotal === 0 ? null : postGateTotal / preGateTotal,
    cases_passed: casesPassed,
    cases_total: cases.length,
    cases_errored: casesErrored,
    outcomes,
  };
}
