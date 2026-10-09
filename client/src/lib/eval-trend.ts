/* eval-trend.ts — pure helpers behind the dashboard's trend chart, card
   sparklines and regression banner. Metrics and deltas are computed by the
   server; this only selects, orders and rounds them for display. */
import type { EvalMetricDeltas, EvalSetRunSummary } from "@devdigest/shared";

export type MetricKey = "recall" | "precision" | "citation_accuracy";

export const METRIC_KEYS: readonly MetricKey[] = ["recall", "precision", "citation_accuracy"];

/** One colour per metric, shared by the cards, the chart and the table bars
 *  (a metric keeps its colour everywhere). Same tokens as the design. */
export const METRIC_COLOR: Record<MetricKey, string> = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation_accuracy: "var(--warn)",
};

/** How many of the most recent completed runs the trend shows. */
export const TREND_RUN_LIMIT = 12;

/** Completed runs, oldest → newest, capped to the latest `limit`. `runs` is the
 *  server's newest-first history of every status. */
export function trendRuns(runs: EvalSetRunSummary[], limit = TREND_RUN_LIMIT): EvalSetRunSummary[] {
  return runs
    .filter((r) => r.status === "completed")
    .slice(0, limit)
    .reverse();
}

/** A metric's values across `runs`, skipping runs where it is not applicable. */
export function metricSeries(runs: EvalSetRunSummary[], key: MetricKey): number[] {
  return runs.map((r) => r[key]).filter((v): v is number => v != null);
}

/** Y-axis range: from just under the lowest plotted value (snapped to 0.1) up to 100 %. */
export function chartDomain(values: number[]): [number, number] {
  if (values.length === 0) return [0, 1];
  const lo = Math.floor((Math.min(...values) - 0.05) * 10) / 10;
  return [Math.min(0.9, Math.max(0, lo)), 1];
}

export interface RegressionSummary {
  /** Metrics that fell by at least one whole point vs the previous run. */
  dropped: { key: MetricKey; points: number }[];
  /** Metrics that rose by at least one whole point. */
  improved: { key: MetricKey; points: number }[];
}

/** Which metrics moved by ≥ 1 point between the previous and latest run.
 *  Sub-point noise is ignored so the banner never says "dipped 0 pts". */
export function regressionSummary(delta: EvalMetricDeltas | null): RegressionSummary {
  const out: RegressionSummary = { dropped: [], improved: [] };
  if (!delta) return out;
  for (const key of METRIC_KEYS) {
    const d = delta[key];
    if (d == null) continue;
    const points = Math.round(d * 100);
    if (points <= -1) out.dropped.push({ key, points: Math.abs(points) });
    else if (points >= 1) out.improved.push({ key, points });
  }
  return out;
}
