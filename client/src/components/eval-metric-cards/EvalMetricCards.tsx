/* EvalMetricCards — recall / precision / citation accuracy (+ optional pass
   count) for one run. Values and deltas come from the server; this only
   formats them. A null metric reads "n/a" with no delta. */
"use client";

import { useTranslations } from "next-intl";
import { Sparkline } from "@devdigest/ui";
import type { EvalMetricDeltas, EvalSetRunSummary } from "@devdigest/shared";
import { formatDeltaPoints, formatPercent } from "@/lib/eval-format";
import { METRIC_COLOR } from "@/lib/eval-trend";
import { DELTA_COLOR } from "./constants";
import { s } from "./styles";

type MetricKey = "recall" | "precision" | "citation_accuracy";

const METRICS: { key: MetricKey; label: "recall" | "precision" | "citationAccuracy" }[] = [
  { key: "recall", label: "recall" },
  { key: "precision", label: "precision" },
  { key: "citation_accuracy", label: "citationAccuracy" },
];

export function EvalMetricCards({
  latest,
  delta,
  showPassCount = false,
  trends,
}: {
  latest: EvalSetRunSummary | null;
  delta: EvalMetricDeltas | null;
  showPassCount?: boolean;
  /** Per-metric values, oldest → newest; a sparkline is drawn from two points up. */
  trends?: Partial<Record<MetricKey, number[]>>;
}) {
  const t = useTranslations("eval.shared");
  const na = t("notApplicable");

  return (
    <div style={s.row}>
      {METRICS.map(({ key, label }) => {
        const name = t(`metrics.${label}`);
        const value = formatPercent(latest ? latest[key] : null);
        const d = value == null ? null : formatDeltaPoints(delta ? delta[key] : null);
        const deltaText = d ? t("metrics.deltaLabel", { direction: d.direction, points: d.text }) : null;
        return (
          <div key={key} style={s.card} aria-label={`${name}: ${value ?? na}${deltaText ? `, ${deltaText}` : ""}`}>
            <div style={s.labelRow}>
              <span style={s.label}>{name}</span>
              {trends?.[key] && trends[key]!.length >= 2 && (
                <Sparkline data={trends[key]!} color={METRIC_COLOR[key]} w={64} h={22} />
              )}
            </div>
            <div style={s.valueRow}>
              <span className="tnum" style={value == null ? s.na : s.value}>
                {value ?? na}
              </span>
              {d && deltaText && (
                <span className="tnum" style={{ ...s.delta, color: DELTA_COLOR[d.direction] }}>
                  {deltaText}
                </span>
              )}
            </div>
          </div>
        );
      })}
      {showPassCount && (
        <div
          style={s.card}
          aria-label={`${t("metrics.passCount")}: ${latest?.cases_passed ?? na}`}
        >
          <span style={s.label}>{t("metrics.passCount")}</span>
          <div style={s.valueRow}>
            <span className="tnum" style={latest?.cases_passed == null ? s.na : s.value}>
              {latest?.cases_passed == null ? na : `${latest.cases_passed}/${latest.cases_total}`}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
