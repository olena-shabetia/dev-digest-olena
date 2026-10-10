import type {
  DiffHunk,
  EvalCaseDetail,
  EvalCaseLastResult,
  EvalCaseListItem,
  EvalExpectationInput,
  EvalExpectationLocation,
  EvalExpectationType,
  EvalMetricDeltas,
  EvalRunCompare,
  EvalSetRun,
  EvalSetRunSummary,
  Finding,
  UnifiedDiff,
} from '@devdigest/shared';
import { groundFindings } from '../../platform/grounding.js';
import { parseUnifiedDiff } from '../../platform/diff.js';
import { AppError } from '../../platform/errors.js';
import {
  EVAL_DIFF_REASON,
  EVAL_ERROR,
  EVAL_EXPECTATION_REASON,
  FULL_FILE_FINDING_KINDS,
} from './constants.js';
import type { StoredEvalCase, StoredEvalSetRun } from './types.js';

type DiffFile = UnifiedDiff['files'][number];

/* ------------------------------------------------------------------ */
/* Expectation type                                                    */
/* ------------------------------------------------------------------ */

export function deriveExpectationType(f: {
  acceptedAt: Date | null;
  dismissedAt: Date | null;
}): EvalExpectationType | null {
  if (f.acceptedAt) return 'must_find';
  if (f.dismissedAt) return 'must_not_flag';
  return null;
}

/* ------------------------------------------------------------------ */
/* Hunk rule (D-9): delegate to the real gate via a probe diff         */
/* ------------------------------------------------------------------ */

export function rangeHitsHunks(path: string, hunks: DiffHunk[], start: number, end: number): boolean {
  const probeDiff: UnifiedDiff = {
    raw: '',
    files: [{ path, additions: 0, deletions: 0, hunks }],
  };
  const probe: Finding = {
    id: 'probe',
    severity: 'SUGGESTION',
    category: 'bug',
    title: 'probe',
    file: path,
    start_line: start,
    end_line: end,
    rationale: '',
    confidence: 1,
    kind: 'finding',
  };
  return groundFindings([probe], probeDiff).kept.length > 0;
}

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

function invalidDiff(reason: string, message: string): AppError {
  return new AppError(EVAL_ERROR.invalidDiff, message, 422, { field: 'input_diff', reason });
}

function invalidExpectation(field: string, reason: string, message: string): AppError {
  return new AppError(EVAL_ERROR.invalidExpectation, message, 422, { field, reason });
}

/** D-15: exactly one file, at least one hunk, one `diff --git`, one `+++ `. */
export function validateCaseDiff(diff: UnifiedDiff): DiffFile {
  if (diff.raw.trim() === '') throw invalidDiff(EVAL_DIFF_REASON.empty, 'The diff is empty');
  if (diff.files.length === 0) {
    throw invalidDiff(EVAL_DIFF_REASON.unparseable, 'The diff could not be parsed');
  }
  const rawLines = diff.raw.split('\n');
  const gitHeaders = rawLines.filter((l) => l.startsWith('diff --git')).length;
  const plusHeaders = rawLines.filter((l) => l.startsWith('+++ ')).length;
  const file = diff.files[0];
  if (diff.files.length !== 1 || gitHeaders > 1 || plusHeaders !== 1 || !file) {
    throw invalidDiff(EVAL_DIFF_REASON.multipleFiles, 'The diff must touch exactly one file');
  }
  if (file.hunks.length === 0) {
    throw invalidDiff(EVAL_DIFF_REASON.noHunk, 'The diff has no hunks');
  }
  return file;
}

function isPositiveInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 1;
}

export function validateExpectation(loc: EvalExpectationInput, file: DiffFile): EvalExpectationLocation {
  if (loc.file === '') {
    throw invalidExpectation('expectation.file', EVAL_EXPECTATION_REASON.fileEmpty, 'File is required');
  }
  if (loc.file !== file.path) {
    throw invalidExpectation(
      'expectation.file',
      EVAL_EXPECTATION_REASON.fileMismatch,
      'File must be the file the diff changes',
    );
  }
  if (!isPositiveInt(loc.start_line)) {
    throw invalidExpectation(
      'expectation.start_line',
      EVAL_EXPECTATION_REASON.lineNotPositiveInteger,
      'Start line must be a whole number of at least 1',
    );
  }
  if (!isPositiveInt(loc.end_line)) {
    throw invalidExpectation(
      'expectation.end_line',
      EVAL_EXPECTATION_REASON.lineNotPositiveInteger,
      'End line must be a whole number of at least 1',
    );
  }
  if (loc.start_line > loc.end_line) {
    throw invalidExpectation(
      'expectation.start_line',
      EVAL_EXPECTATION_REASON.startAfterEnd,
      'Start line must not be after end line',
    );
  }
  if (!rangeHitsHunks(file.path, file.hunks, loc.start_line, loc.end_line)) {
    throw invalidExpectation(
      'expectation.end_line',
      EVAL_EXPECTATION_REASON.outsideHunks,
      'The line range does not intersect any hunk of the diff',
    );
  }
  return { file: loc.file, start_line: loc.start_line, end_line: loc.end_line };
}

export function validateCaseName(name: string): string {
  const trimmed = name.trim();
  if (trimmed === '') {
    throw new AppError(EVAL_ERROR.invalidName, 'Name is required', 422, { field: 'name', reason: 'empty' });
  }
  return trimmed;
}

/* ------------------------------------------------------------------ */
/* Draft diff (D-10)                                                   */
/* ------------------------------------------------------------------ */

interface RawHunk {
  start: number; // index of the @@ line
  end: number; // exclusive
}
interface RawFile {
  path: string;
  hunks: RawHunk[];
}

/** Mirror of the parser's header rules, recording raw line ranges per hunk. */
function scanRaw(lines: string[]): RawFile[] {
  const files: RawFile[] = [];
  let current: RawFile | null = null;
  let open: RawHunk | null = null;

  const closeHunk = (endIdx: number) => {
    if (open) {
      open.end = endIdx;
      current?.hunks.push(open);
    }
    open = null;
  };
  const closeFile = (endIdx: number) => {
    closeHunk(endIdx);
    if (current) files.push(current);
    current = null;
  };

  lines.forEach((line, i) => {
    if (line.startsWith('diff --git')) {
      closeFile(i);
      current = { path: '', hunks: [] };
      return;
    }
    if (line.startsWith('+++ ')) {
      // a `--- ` line directly above belongs to this header, not the hunk body
      const prev = i - 1;
      const bodyEnd = prev >= 0 && lines[prev]!.startsWith('--- ') ? prev : i;
      closeHunk(bodyEnd);
      if (!current) current = { path: '', hunks: [] };
      const p = line.slice(4).replace(/^b\//, '').trim();
      current.path = p === '/dev/null' ? current.path : p;
      return;
    }
    if (line.startsWith('--- ')) return;
    if (/^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.test(line)) {
      closeHunk(i);
      open = { start: i, end: i };
      return;
    }
  });
  closeFile(lines.length);
  return files;
}

export function buildDraftDiff(
  diff: UnifiedDiff,
  f: { file: string; startLine: number; endLine: number; kind: string },
): { inputDiff: string; needsRelocation: boolean } | null {
  const parsedFile = diff.files.find((x) => x.path === f.file);
  if (!parsedFile || parsedFile.hunks.length === 0) return null;

  const rawFile = scanRaw(diff.raw.split('\n')).find((x) => x.path === f.file);
  if (!rawFile || rawFile.hunks.length !== parsedFile.hunks.length) return null;

  let picked: number[] = [];
  parsedFile.hunks.forEach((h, i) => {
    if (rangeHitsHunks(f.file, [h], f.startLine, f.endLine)) picked.push(i);
  });
  let needsRelocation = false;
  if (picked.length === 0) {
    if (!(FULL_FILE_FINDING_KINDS as readonly string[]).includes(f.kind)) return null;
    picked = parsedFile.hunks.map((_, i) => i);
    needsRelocation = true;
  }

  const lines = diff.raw.split('\n');
  const out: string[] = [`diff --git a/${f.file} b/${f.file}`, `--- a/${f.file}`, `+++ b/${f.file}`];
  for (const i of picked) {
    const rh = rawFile.hunks[i]!;
    out.push(...lines.slice(rh.start, rh.end));
  }
  const inputDiff = out.join('\n');

  // Self-check (A-6b): a returned draft must be valid as returned.
  try {
    const reparsed = parseUnifiedDiff(inputDiff);
    const file = validateCaseDiff(reparsed);
    if (file.hunks.length !== picked.length) return null;
    for (let k = 0; k < picked.length; k++) {
      const a = file.hunks[k]!.newLineNumbers;
      const b = parsedFile.hunks[picked[k]!]!.newLineNumbers;
      if (a.length !== b.length || a.some((n, j) => n !== b[j])) return null;
    }
    if (!needsRelocation) {
      validateExpectation({ file: f.file, start_line: f.startLine, end_line: f.endLine }, file);
    }
  } catch {
    return null;
  }
  return { inputDiff, needsRelocation };
}

/* ------------------------------------------------------------------ */
/* DTO mappers                                                         */
/* ------------------------------------------------------------------ */

export function lastResultForCase(runs: StoredEvalSetRun[], caseId: string): EvalCaseLastResult | null {
  for (const run of runs) {
    if (run.status !== 'completed') continue;
    const r = run.results.find((x) => x.case_id === caseId);
    if (!r) continue;
    return {
      run_id: run.id,
      ran_at: (run.finishedAt ?? run.startedAt).toISOString(),
      status: r.status,
      matched: r.matched,
      expected: r.expected,
      surviving: r.surviving,
      duration_ms: r.duration_ms,
      cost_usd: r.cost_usd,
      error: r.error,
    };
  }
  return null;
}

export function toCaseDetail(
  c: StoredEvalCase,
  agentName: string,
  last: EvalCaseLastResult | null,
): EvalCaseDetail {
  return {
    id: c.id,
    agent_id: c.agentId,
    agent_name: agentName,
    source_finding_id: c.sourceFindingId,
    name: c.name,
    input_diff: c.inputDiff,
    pr: c.pr,
    expectation: c.expectation,
    created_at: c.createdAt.toISOString(),
    updated_at: c.updatedAt.toISOString(),
    last_result: last,
  };
}

export function toCaseListItem(
  c: StoredEvalCase,
  agentName: string,
  last: EvalCaseLastResult | null,
): EvalCaseListItem {
  const { input_diff: _d, pr: _p, ...rest } = toCaseDetail(c, agentName, last);
  void _d;
  void _p;
  return rest;
}

export function toRunSummary(r: StoredEvalSetRun, agentName: string): EvalSetRunSummary {
  return {
    id: r.id,
    agent_id: r.agentId,
    agent_name: agentName,
    status: r.status,
    error: r.error,
    agent_version: r.agentVersion,
    version_label: `v${r.agentVersion}`,
    provider: r.provider,
    model: r.model,
    started_at: r.startedAt.toISOString(),
    finished_at: r.finishedAt ? r.finishedAt.toISOString() : null,
    cases_total: r.casesTotal,
    cases_done: r.casesDone,
    cases_passed: r.casesPassed,
    cases_errored: r.casesErrored,
    recall: r.recall,
    precision: r.precision,
    citation_accuracy: r.citationAccuracy,
    duration_ms: r.durationMs,
    cost_usd: r.costUsd,
  };
}

export function toSetRun(r: StoredEvalSetRun, agentName: string): EvalSetRun {
  return {
    ...toRunSummary(r, agentName),
    strategy: r.strategy,
    system_prompt: r.systemPrompt,
    skills: r.skills,
    cases: r.cases,
    results: r.results,
  };
}

function diffOrNull(head: number | null, base: number | null): number | null {
  return head === null || base === null ? null : head - base;
}

export function metricDeltas(head: StoredEvalSetRun, base: StoredEvalSetRun): EvalMetricDeltas {
  return {
    recall: diffOrNull(head.recall, base.recall),
    precision: diffOrNull(head.precision, base.precision),
    citation_accuracy: diffOrNull(head.citationAccuracy, base.citationAccuracy),
  };
}

export function buildCompare(a: StoredEvalSetRun, b: StoredEvalSetRun, agentName: string): EvalRunCompare {
  const [base, head] = a.startedAt.getTime() <= b.startedAt.getTime() ? [a, b] : [b, a];

  const baseCases = new Map(base.cases.map((c) => [c.case_id, c.updated_at]));
  const headCases = new Map(head.cases.map((c) => [c.case_id, c.updated_at]));
  const onlyInBase = [...baseCases.keys()].filter((id) => !headCases.has(id));
  const onlyInHead = [...headCases.keys()].filter((id) => !baseCases.has(id));
  const edited = [...baseCases.keys()].filter(
    (id) => headCases.has(id) && headCases.get(id) !== baseCases.get(id),
  );

  const skillKey = (r: StoredEvalSetRun) => r.skills.map((s) => `${s.id}@${s.version}`).join('|');

  return {
    base: toSetRun(base, agentName),
    head: toSetRun(head, agentName),
    delta: { ...metricDeltas(head, base), cost_usd: diffOrNull(head.costUsd, base.costUsd) },
    prompt_changed: base.systemPrompt !== head.systemPrompt,
    model_changed: base.provider !== head.provider || base.model !== head.model,
    skills_changed: skillKey(base) !== skillKey(head),
    cases_only_in_base: onlyInBase,
    cases_only_in_head: onlyInHead,
    cases_edited: edited,
    comparable: onlyInBase.length === 0 && onlyInHead.length === 0 && edited.length === 0,
  };
}
