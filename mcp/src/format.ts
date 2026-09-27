/**
 * Pure response-shaping for the MCP tools. Zero I/O — never imports
 * `api/client.ts` (plan §2 D13). All PR-/repo-derived text passed through here
 * is treated as untrusted data, never instructions (plan §2 D16).
 */
import type {
  Agent,
  ConventionCandidate,
  ConventionScan,
  FindingCategory,
  FindingRecord,
  ReviewRecord,
  RunSummary,
  Severity,
  Verdict,
} from '@devdigest/shared';

import {
  DEFAULT_CONVENTIONS_LIMIT,
  DEFAULT_FINDINGS_LIMIT,
  MAX_CONVENTIONS_LIMIT,
  MAX_FINDINGS_LIMIT,
  TEXT_CAPS,
} from './constants.js';

export type SeverityFilter = 'CRITICAL' | 'WARNING' | 'SUGGESTION';

/** Lower = more severe; mirrors `client/src/lib/severity.ts` SEVERITY_ORDER
 *  (not imported — client is a separate package). */
const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
};

export interface FindingView {
  severity: Severity;
  location: string;
  category: FindingCategory;
  title: string;
  why: string;
}

export interface ReviewResultView {
  status: 'done';
  run_id: string | null;
  repo: string;
  pr: number;
  agent: string;
  verdict: Verdict;
  score: number | null;
  blockers: number | null;
  summary: string;
  counts: Record<Severity, number>;
  total: number;
  shown: number;
  findings: FindingView[];
  note?: string;
  attached?: boolean;
}

export interface AgentView {
  id: string;
  name: string;
  model: string;
  provider: string;
  enabled: boolean;
  description: string;
}

export interface AgentsView {
  agents: AgentView[];
  hint: string;
}

/** Structurally identical to `ConventionsListResponse` (owned by WU-4's
 *  `api/schemas.ts`, plan §3.1 D6) — kept as a local shape here so this file
 *  has zero dependency on WU-4 landing first. */
export interface ConventionsListResponseLike {
  scan: ConventionScan | null;
  candidates: ConventionCandidate[];
}

export interface ConventionView {
  category: string;
  rule: string;
  status: string;
  evidence: string;
  confidence: number;
}

export interface ConventionsView {
  repo: string;
  scan: { status: string; created_at: string; degraded: boolean } | null;
  counts: { accepted: number; pending: number; rejected: number };
  total: number;
  shown: number;
  conventions: ConventionView[];
  note?: string;
}

/**
 * Strips control characters (`\u0000`-`\u001f`, treated as whitespace so
 * word boundaries survive), collapses runs of whitespace to a single space,
 * neutralizes triple-backtick fences (so PR-derived text can never reopen a
 * markdown code block the model would read as instructions), and truncates
 * to `max` characters with a trailing ellipsis.
 */
export function sanitizeText(s: string | null | undefined, max: number): string {
  if (s == null) return '';
  // eslint-disable-next-line no-control-regex -- intentional: stripping C0 control chars from untrusted PR/repo text
  let out = s.replace(/[\u0000-\u001f]/g, ' ');
  out = out.replace(/\s+/g, ' ').trim();
  out = out.split('```').join("'''");
  if (out.length > max) {
    out = `${out.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
  }
  return out;
}

/** CRITICAL → WARNING → SUGGESTION, then file, then start_line. */
export function sortFindings<T extends { severity: Severity; file: string; start_line: number }>(
  findings: readonly T[],
): T[] {
  return [...findings].sort((a, b) => {
    const bySeverity = (SEVERITY_ORDER[a.severity] ?? 99) - (SEVERITY_ORDER[b.severity] ?? 99);
    if (bySeverity !== 0) return bySeverity;
    const byFile = a.file.localeCompare(b.file);
    if (byFile !== 0) return byFile;
    return a.start_line - b.start_line;
  });
}

function filterBySeverity<T extends { severity: Severity }>(
  findings: readonly T[],
  min: SeverityFilter | undefined,
): T[] {
  if (!min) return [...findings];
  const threshold = SEVERITY_ORDER[min];
  return findings.filter((f) => (SEVERITY_ORDER[f.severity] ?? 99) <= threshold);
}

function countBySeverity(findings: readonly FindingRecord[]): Record<Severity, number> {
  const counts: Record<Severity, number> = { CRITICAL: 0, WARNING: 0, SUGGESTION: 0 };
  for (const f of findings) {
    if (f.severity in counts) counts[f.severity] += 1;
  }
  return counts;
}

function formatLocation(file: string, start: number, end: number): string {
  return start === end ? `${file}:${start}` : `${file}:${start}-${end}`;
}

/** First sentence of `rationale`, sanitized and capped at TEXT_CAPS.why. */
function deriveWhy(rationale: string): string {
  const clean = sanitizeText(rationale, Number.MAX_SAFE_INTEGER);
  const sentenceEnd = clean.search(/[.!?](\s|$)/);
  const firstSentence = sentenceEnd >= 0 ? clean.slice(0, sentenceEnd + 1) : clean;
  return sanitizeText(firstSentence, TEXT_CAPS.why);
}

function clampLimit(limit: number | undefined, fallback: number, max: number): number {
  const value = limit ?? fallback;
  return Math.min(Math.max(Math.trunc(value), 1), max);
}

/**
 * Plan §2 D7: `review.verdict` wins when present; otherwise derive from
 * `run.blockers` and finding count.
 */
export function deriveVerdict(review: ReviewRecord | null, run: RunSummary | null): Verdict {
  if (review?.verdict) return review.verdict;
  const blockers = run?.blockers ?? 0;
  if (blockers > 0) return 'request_changes';
  const findingsCount = review?.findings.length ?? 0;
  if (findingsCount > 0) return 'comment';
  return 'approve';
}

export function formatReviewResult(input: {
  repo: string;
  pr: number;
  run: RunSummary | null;
  review: ReviewRecord | null;
  severity?: SeverityFilter;
  limit?: number;
  attached?: boolean;
}): ReviewResultView {
  const { repo, pr, run, review, severity, attached } = input;
  const limit = clampLimit(input.limit, DEFAULT_FINDINGS_LIMIT, MAX_FINDINGS_LIMIT);

  const allFindings = review?.findings ?? [];
  const counts = countBySeverity(allFindings);
  const filtered = sortFindings(filterBySeverity(allFindings, severity));
  const total = filtered.length;
  const shown = Math.min(limit, total);

  const findings: FindingView[] = filtered.slice(0, limit).map((f) => ({
    severity: f.severity,
    location: formatLocation(f.file, f.start_line, f.end_line),
    category: f.category,
    title: sanitizeText(f.title, TEXT_CAPS.title),
    why: deriveWhy(f.rationale),
  }));

  const verdict = deriveVerdict(review, run);
  const score = review?.score ?? run?.score ?? null;
  const blockers = run?.blockers ?? null;
  const runId = run?.run_id ?? review?.run_id ?? null;
  const agentName = run?.agent_name ?? review?.agent_name ?? 'unknown';
  const summary = sanitizeText(review?.summary ?? '', TEXT_CAPS.summary);

  const view: ReviewResultView = {
    status: 'done',
    run_id: runId,
    repo,
    pr,
    agent: agentName,
    verdict,
    score,
    blockers,
    summary,
    counts,
    total,
    shown,
    findings,
  };
  if (shown < total) {
    view.note = `showing ${shown} of ${total} (most severe first); pass severity or limit to change`;
  }
  if (attached) view.attached = true;
  return view;
}

export function formatAgents(agents: readonly Agent[]): AgentsView {
  return {
    agents: agents.map((a) => ({
      id: a.id,
      name: a.name,
      model: a.model,
      provider: a.provider,
      enabled: a.enabled,
      description: sanitizeText(a.description, TEXT_CAPS.agentDescription),
    })),
    hint: 'Pass name or id as `agent` to run_agent_on_pr.',
  };
}

function evidenceLocation(c: ConventionCandidate): string {
  return c.evidence_line != null ? `${c.evidence_path}:${c.evidence_line}` : c.evidence_path;
}

export function formatConventions(input: {
  repo: string;
  data: ConventionsListResponseLike;
  status: 'accepted' | 'pending' | 'all';
  limit?: number;
}): ConventionsView {
  const { repo, data, status } = input;
  const limit = clampLimit(input.limit, DEFAULT_CONVENTIONS_LIMIT, MAX_CONVENTIONS_LIMIT);

  const counts = { accepted: 0, pending: 0, rejected: 0 };
  for (const c of data.candidates) {
    if (c.status in counts) counts[c.status] += 1;
  }

  const filtered =
    status === 'all' ? [...data.candidates] : data.candidates.filter((c) => c.status === status);
  const total = filtered.length;
  const shown = Math.min(limit, total);

  const conventions: ConventionView[] = filtered.slice(0, limit).map((c) => ({
    category: c.category,
    rule: sanitizeText(c.rule, TEXT_CAPS.rule),
    status: c.status,
    evidence: evidenceLocation(c),
    confidence: c.confidence,
  }));

  const view: ConventionsView = {
    repo,
    scan: data.scan
      ? { status: data.scan.status, created_at: data.scan.created_at, degraded: data.scan.degraded }
      : null,
    counts,
    total,
    shown,
    conventions,
  };

  if (!data.scan) {
    view.note =
      'No conventions extracted yet — run extraction in the DevDigest UI (repo → Conventions).';
  } else if (counts.accepted === 0 && counts.pending > 0) {
    view.note = `${counts.pending} pending candidates; review them in the DevDigest UI or pass status='all'.`;
  } else if (shown < total) {
    view.note = `showing ${shown} of ${total}; pass limit to see more`;
  }

  return view;
}
