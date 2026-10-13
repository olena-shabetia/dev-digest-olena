/**
 * Pure grouping/verdict/status/totals helpers for the multi-agent read model
 * (L07, SPEC-14). No I/O, no `db`/`fastify`/`container` imports — this file
 * only ever sees plain data handed to it by `multi-run.service.ts`.
 *
 * The file + line-range overlap semantics here are the SAME as
 * `eval/scoring.ts:51-59` (`matches`), re-implemented rather than imported —
 * `eval` and `reviews` are different modules and must not cross-import
 * (server/INSIGHTS.md 2026-10-09).
 */
import type {
  FindingGroup,
  GroupVerdict,
  MultiAgentRunStatus,
  MultiAgentRunTotals,
  Severity,
  VerdictState,
} from '@devdigest/shared';

/** A finding, reduced to what grouping needs. `FindingRecord` satisfies this. */
export interface GroupableFinding {
  id: string;
  review_id: string;
  file: string;
  start_line: number;
  end_line: number;
  severity: Severity;
  confidence: number;
  title: string;
}

/** One child run of the batch, in submission (batch) order. */
export interface BatchChild {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: string | null;
  review_id: string | null;
}

const SEVERITY_RANK: Record<Severity, number> = {
  CRITICAL: 3,
  WARNING: 2,
  SUGGESTION: 1,
};

/** Severity desc, then confidence desc, then normalised start_line asc, then id asc. */
function compareFindings(a: GroupableFinding, b: GroupableFinding): number {
  const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
  if (sevDiff !== 0) return sevDiff;
  const confDiff = b.confidence - a.confidence;
  if (confDiff !== 0) return confDiff;
  const lineDiff = normalizedLo(a) - normalizedLo(b);
  if (lineDiff !== 0) return lineDiff;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

function normalizedLo(f: GroupableFinding): number {
  return Math.min(f.start_line, f.end_line);
}

function normalizedHi(f: GroupableFinding): number {
  return Math.max(f.start_line, f.end_line);
}

/** True iff two findings' normalised line ranges overlap (closed ranges). */
function overlaps(a: GroupableFinding, b: GroupableFinding): boolean {
  return normalizedLo(a) <= normalizedHi(b) && normalizedLo(b) <= normalizedHi(a);
}

/** Simple union-find for the connected-components pass below. */
class UnionFind {
  private parent: number[];
  constructor(size: number) {
    this.parent = Array.from({ length: size }, (_, i) => i);
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]!]!;
      x = this.parent[x]!;
    }
    return x;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

/**
 * Group findings into connected components by exact `file` + overlapping
 * line ranges (transitive), and attach one `GroupVerdict` per batch child —
 * SPEC-14 criteria 28-39.
 *
 * Only findings whose child run has `status === 'done'` participate in
 * grouping; findings from a non-done child cannot exist in practice (a
 * running/failed/cancelled run persists no review), but the filter keeps
 * this function defensive regardless of caller behaviour.
 */
export function groupFindings(
  children: readonly BatchChild[],
  findings: readonly GroupableFinding[],
): FindingGroup[] {
  const doneReviewIds = new Set(
    children.filter((c) => c.status === 'done' && c.review_id != null).map((c) => c.review_id!),
  );
  const eligible = findings.filter((f) => doneReviewIds.has(f.review_id));

  // ---- connected components, per exact file --------------------------------
  const byFile = new Map<string, GroupableFinding[]>();
  for (const f of eligible) {
    const list = byFile.get(f.file);
    if (list) list.push(f);
    else byFile.set(f.file, [f]);
  }

  const componentsByFinding = new Map<string, GroupableFinding[]>();
  for (const list of byFile.values()) {
    const uf = new UnionFind(list.length);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i]!, list[j]!)) uf.union(i, j);
      }
    }
    const byRoot = new Map<number, GroupableFinding[]>();
    for (let i = 0; i < list.length; i++) {
      const root = uf.find(i);
      const group = byRoot.get(root);
      if (group) group.push(list[i]!);
      else byRoot.set(root, [list[i]!]);
    }
    for (const group of byRoot.values()) {
      for (const f of group) componentsByFinding.set(f.id, group);
    }
  }

  // Dedupe component arrays (several findings share the same array reference).
  const seenGroups = new Set<GroupableFinding[]>();
  const rawGroups: GroupableFinding[][] = [];
  for (const group of componentsByFinding.values()) {
    if (seenGroups.has(group)) continue;
    seenGroups.add(group);
    rawGroups.push(group);
  }

  // ---- build FindingGroup[] -------------------------------------------------
  const reviewToChild = new Map<string, BatchChild>();
  for (const c of children) {
    if (c.review_id != null) reviewToChild.set(c.review_id, c);
  }

  const groups: FindingGroup[] = rawGroups.map((members) => {
    const sorted = [...members].sort(compareFindings);
    const ids = sorted.map((m) => m.id);
    const minId = [...ids].sort()[0]!;
    const startLine = Math.min(...sorted.map(normalizedLo));
    const endLine = Math.max(...sorted.map(normalizedHi));
    const severity = sorted.reduce<Severity>(
      (max, m) => (SEVERITY_RANK[m.severity] > SEVERITY_RANK[max] ? m.severity : max),
      sorted[0]!.severity,
    );

    // membersByReview: this group's members for each contributing review.
    const membersByReview = new Map<string, GroupableFinding[]>();
    for (const m of sorted) {
      const list = membersByReview.get(m.review_id);
      if (list) list.push(m);
      else membersByReview.set(m.review_id, [m]);
    }

    const verdicts: GroupVerdict[] = children.map((child) => {
      const flaggedMembers = child.review_id != null ? membersByReview.get(child.review_id) : undefined;
      let state: VerdictState;
      if (flaggedMembers && flaggedMembers.length > 0) {
        state = 'flagged';
      } else if (child.status === 'done') {
        state = 'did_not_flag';
      } else if (child.status === 'running') {
        state = 'running';
      } else if (child.status === 'cancelled') {
        state = 'cancelled';
      } else {
        state = 'failed';
      }

      const topMember = flaggedMembers?.[0];
      return {
        run_id: child.run_id,
        agent_id: child.agent_id,
        agent_name: child.agent_name,
        state,
        severity: topMember ? topMember.severity : null,
        title: topMember ? topMember.title : null,
        finding_ids: flaggedMembers ? flaggedMembers.map((m) => m.id) : [],
      };
    });

    const conflict = computeConflict(verdicts);

    return {
      id: `grp_${minId}`,
      file: sorted[0]!.file,
      start_line: startLine,
      end_line: endLine,
      headline: sorted[0]!.title,
      severity,
      finding_ids: ids,
      conflict,
      verdicts,
    };
  });

  groups.sort((a, b) => {
    const sevDiff = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (sevDiff !== 0) return sevDiff;
    if (a.file !== b.file) return a.file < b.file ? -1 : 1;
    if (a.start_line !== b.start_line) return a.start_line - b.start_line;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  return groups;
}

/**
 * `conflict` is true when, among `flagged` / `did_not_flag` verdicts only,
 * either (a) at least one flags and at least one does not, or (b) the
 * flagged verdicts carry two or more distinct severities.
 */
function computeConflict(verdicts: readonly GroupVerdict[]): boolean {
  const relevant = verdicts.filter((v) => v.state === 'flagged' || v.state === 'did_not_flag');
  const flagged = relevant.filter((v) => v.state === 'flagged');
  const didNotFlag = relevant.filter((v) => v.state === 'did_not_flag');
  if (flagged.length > 0 && didNotFlag.length > 0) return true;
  const severities = new Set(flagged.map((v) => v.severity).filter((s): s is Severity => s != null));
  return severities.size >= 2;
}

/**
 * Derive the parent's status from its children's statuses (criterion 69 —
 * derived, never stored). An unknown or `null` status is treated as
 * `failed` for this purpose (plan recommendation 12).
 */
export function deriveMultiRunStatus(statuses: readonly (string | null)[]): MultiAgentRunStatus {
  if (statuses.length === 0) return 'failed';
  if (statuses.some((s) => s === 'running')) return 'running';
  const allDone = statuses.every((s) => s === 'done');
  if (allDone) return 'done';
  const noneDone = !statuses.some((s) => s === 'done');
  if (noneDone) return 'failed';
  return 'partial';
}

/** Compute the parent's cost/duration totals from its children — criteria 65-66. */
export function computeTotals(input: {
  ranAt: Date;
  completedAt: Date | null;
  children: readonly {
    status: string | null;
    cost_usd: number | null;
    ran_at: string | null;
    duration_ms: number | null;
  }[];
}): MultiAgentRunTotals {
  const { ranAt, completedAt, children } = input;
  const inProgress = children.some((c) => c.status === 'running');

  const knownCosts = children.map((c) => c.cost_usd).filter((c): c is number => c != null);
  const costUsd = knownCosts.length > 0 ? knownCosts.reduce((a, b) => a + b, 0) : null;
  const costPartial = children.some((c) => c.status !== 'running' && c.cost_usd == null);

  let durationMs: number | null = null;
  if (!inProgress) {
    if (completedAt) {
      durationMs = completedAt.getTime() - ranAt.getTime();
    } else {
      const ends = children
        .filter((c) => c.ran_at != null && c.duration_ms != null)
        .map((c) => Date.parse(c.ran_at!) + c.duration_ms!);
      if (ends.length > 0) {
        durationMs = Math.max(...ends) - ranAt.getTime();
      }
    }
    if (durationMs != null) durationMs = Math.max(0, Math.round(durationMs));
  }

  return {
    cost_usd: costUsd,
    cost_partial: costPartial,
    duration_ms: durationMs,
    in_progress: inProgress,
  };
}
