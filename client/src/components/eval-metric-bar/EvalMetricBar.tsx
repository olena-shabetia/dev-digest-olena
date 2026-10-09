/* EvalMetricBar — a metric as percent text with a thin bar beside it, in the
   metric's own colour. The text stays (exact value, screen readers); the bar
   is decoration. A null metric ("n/a") has no bar. */
"use client";

import { useTranslations } from "next-intl";
import { formatPercent } from "@/lib/eval-format";
import { METRIC_COLOR, type MetricKey } from "@/lib/eval-trend";
import { s } from "./styles";

export function EvalMetricBar({ value, metric }: { value: number | null; metric: MetricKey }) {
  const na = useTranslations("eval.shared")("notApplicable");
  return (
    <div style={s.wrap}>
      {value != null && (
        <div style={s.track} aria-hidden>
          <div style={{ ...s.fill, width: `${Math.round(value * 100)}%`, background: METRIC_COLOR[metric] }} />
        </div>
      )}
      <span className="tnum" style={s.text}>{formatPercent(value) ?? na}</span>
    </div>
  );
}
