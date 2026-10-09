/* RegressionBanner — shown when the latest completed run is worse than the
   previous one on any metric by ≥ 1 point. Deltas come from the server. */
"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { EvalMetricDeltas } from "@devdigest/shared";
import { regressionSummary, type MetricKey } from "@/lib/eval-trend";
import { s } from "./styles";

const LABEL: Record<MetricKey, "recall" | "precision" | "citationAccuracy"> = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citationAccuracy",
};

export function RegressionBanner({ delta, version }: { delta: EvalMetricDeltas | null; version: string }) {
  const t = useTranslations("evalDashboard.agent.banner");
  const tm = useTranslations("eval.shared.metrics");
  const { dropped, improved } = regressionSummary(delta);
  if (dropped.length === 0) return null;

  const list = (items: { key: MetricKey; points: number }[], sign: "itemDown" | "itemUp") =>
    items.map((i) => t(sign, { metric: tm(LABEL[i.key]), points: i.points })).join(", ");

  return (
    <div role="status" style={s.banner}>
      <Icon.AlertTriangle size={16} style={s.icon} />
      <span>
        <strong style={s.strong}>{t("dropped", { items: list(dropped, "itemDown"), version })}</strong>
        {improved.length > 0 && <> {t("improved", { items: list(improved, "itemUp") })}</>}
      </span>
    </div>
  );
}
