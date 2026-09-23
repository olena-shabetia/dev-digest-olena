import type { FindingRecord } from "@devdigest/shared";
import { SEVERITY_ORDER, bySeverity } from "@/lib/severity";
import { LOW_CONFIDENCE_THRESHOLD } from "./constants";

/** Drop low-confidence findings (when `hideLow`) and sort by severity. This is
 *  the stage severity pill counts are derived from — see FindingsPanel.tsx. */
export function confidenceFiltered(findings: FindingRecord[], hideLow: boolean): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/** Further narrow to one severity (or return everything when `severity` is null). */
export function visibleFindings(findings: FindingRecord[], severity: string | null): FindingRecord[] {
  return bySeverity(findings, severity);
}

/** `in_scope === null` ("no intent was derived") is in-scope by default —
 *  only an explicit `false` counts as out-of-scope (`false`/`null` are
 *  different facts; see specs/L03-intent-layer.md). */
export function isOutOfScope(f: FindingRecord): boolean {
  return f.in_scope === false;
}

export interface ScopeCounts {
  /** Findings in the current (severity-filtered) view. */
  total: number;
  /** Of those, how many are labelled out of scope. */
  outOfScope: number;
  /** Of those, how many remain visible once out-of-scope ones collapse. */
  inScope: number;
}

/** Counts derived at the SAME pipeline stage the scope filter itself reads
 *  from (after `bySeverity`, before `scopeFiltered`) — see
 *  client/INSIGHTS.md:43-62 and client/specs/L03-intent-layer.ui.md. */
export function scopeCounts(findings: FindingRecord[]): ScopeCounts {
  const outOfScope = findings.filter(isOutOfScope).length;
  return { total: findings.length, outOfScope, inScope: findings.length - outOfScope };
}

/** Collapse out-of-scope findings behind the disclosure unless `showOutOfScope`. */
export function scopeFiltered(findings: FindingRecord[], showOutOfScope: boolean): FindingRecord[] {
  return showOutOfScope ? findings : findings.filter((f) => !isOutOfScope(f));
}

/** The single most severe out-of-scope finding (SEVERITY_ORDER, confidence as
 *  tiebreak) — always surfaced as one visible strip, per the demote-not-delete
 *  decision in specs/L03-intent-layer.md. `null` when none is out of scope. */
export function mostSevereOutOfScope(findings: FindingRecord[]): FindingRecord | null {
  const outOfScope = findings.filter(isOutOfScope);
  if (outOfScope.length === 0) return null;
  return [...outOfScope].sort((a, b) => {
    const bySev = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9);
    return bySev !== 0 ? bySev : b.confidence - a.confidence;
  })[0]!;
}
