/**
 * Shared severity-grouping helpers for the findings-by-severity feature — used
 * by the run-card pill filter, the run Timeline chips, and the PR-list
 * FINDINGS popover, so all three group identically. See
 * specs/L02-findings-by-severity.md.
 */
import type { Severity } from "@devdigest/shared";

/** Sort weight per severity (lower = shown first). Unknown severities sort last. */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

export interface SeverityBucket {
  severity: Severity;
  count: number;
}

/**
 * Tally findings by severity, keeping only severities that are actually
 * present, ordered CRITICAL → WARNING → SUGGESTION. Pure — no confidence
 * filtering, no LLM call, just a count over data already in memory.
 */
export function severityBuckets(findings: ReadonlyArray<{ severity: string }>): SeverityBucket[] {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return [...counts.entries()]
    .map(([severity, count]) => ({ severity: severity as Severity, count }))
    .sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

/** Keep only findings of `severity`; `null` is the identity (no filter). */
export function bySeverity<T extends { severity: string }>(
  list: readonly T[],
  severity: string | null,
): T[] {
  return severity == null ? [...list] : list.filter((f) => f.severity === severity);
}
