import type { AgentStats } from "@devdigest/shared";
import type { DonutSegment } from "@devdigest/ui";
import { CATEGORY_COLORS } from "./constants";

/** `0.734` → `"73%"`; `null` (no acted-on findings yet) → `"—"`, never `"0%"`
 *  — collapsing "unknown" into "zero" would misreport an agent with no data. */
export function formatPercent(rate: number | null): string {
  if (rate == null) return "—";
  return `${Math.round(rate * 100)}%`;
}

/** `findings_by_category` → Donut segments, stable order (highest first) so
 *  the legend and slice order don't jitter between renders. */
export function toCategorySegments(byCategory: AgentStats["findings_by_category"]): DonutSegment[] {
  return Object.entries(byCategory)
    .filter(([, value]) => value > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([label, value], i) => ({ label, value, color: CATEGORY_COLORS[i % CATEGORY_COLORS.length]! }));
}
