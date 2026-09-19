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
