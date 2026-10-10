/* MetricTrendChart — recall / precision / citation accuracy across the agent's
   completed runs, oldest → newest. One axis (0–100 %), one colour per metric
   (same colours as the cards and table bars), legend always shown, hover
   tooltip with the run's version and time. The runs table below is the
   table view of the same data. */
"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { EvalSetRunSummary } from "@devdigest/shared";
import { formatPercent } from "@/lib/eval-format";
import { METRIC_COLOR, METRIC_KEYS, chartDomain, trendRuns, type MetricKey } from "@/lib/eval-trend";
import { s } from "./styles";

const LABEL: Record<MetricKey, "recall" | "precision" | "citationAccuracy"> = {
  recall: "recall",
  precision: "precision",
  citation_accuracy: "citationAccuracy",
};

interface Row {
  idx: number;
  version: string;
  when: string;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export function MetricTrendChart({ runs }: { runs: EvalSetRunSummary[] }) {
  const t = useTranslations("evalDashboard.agent.trend");
  const tm = useTranslations("eval.shared.metrics");
  const na = useTranslations("eval.shared")("notApplicable");

  const rows: Row[] = useMemo(
    () =>
      trendRuns(runs).map((r, idx) => ({
        idx,
        version: r.version_label,
        when: new Date(r.started_at).toLocaleString(),
        recall: r.recall,
        precision: r.precision,
        citation_accuracy: r.citation_accuracy,
      })),
    [runs],
  );
  const values = rows.flatMap((r) => METRIC_KEYS.map((k) => r[k]).filter((v): v is number => v != null));
  const [lo, hi] = chartDomain(values);

  return (
    <section style={s.card} aria-label={t("heading")}>
      <div style={s.head}>
        <span style={s.heading}>{t("heading")}</span>
        <span style={s.spacer} />
        <ul style={s.legend}>
          {METRIC_KEYS.map((k) => (
            <li key={k} style={s.legendItem}>
              <span style={{ ...s.swatch, background: METRIC_COLOR[k] }} aria-hidden />
              {tm(LABEL[k])}
            </li>
          ))}
        </ul>
      </div>

      {rows.length < 2 ? (
        <p style={s.empty}>{t("needTwoRuns")}</p>
      ) : (
        <div style={{ width: "100%", height: 240 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="idx"
                tickFormatter={(i: number) => rows[i]?.version ?? ""}
                tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                axisLine={{ stroke: "var(--border)" }}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={24}
              />
              <YAxis
                domain={[lo, hi]}
                tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
                axisLine={false}
                tickLine={false}
                width={44}
              />
              <Tooltip
                cursor={{ stroke: "var(--text-muted)", strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  const row = active ? (payload?.[0]?.payload as Row | undefined) : undefined;
                  if (!row) return null;
                  return (
                    <div style={s.tip}>
                      <div style={s.tipHead}>{row.version}</div>
                      <div style={s.tipWhen}>{row.when}</div>
                      {METRIC_KEYS.map((k) => (
                        <div key={k} style={s.tipRow}>
                          <span style={{ ...s.tipDot, background: METRIC_COLOR[k] }} aria-hidden />
                          {tm(LABEL[k])}
                          <span className="tnum" style={s.tipVal}>
                            {formatPercent(row[k]) ?? na}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
              {METRIC_KEYS.map((k) => (
                <Line
                  key={k}
                  type="monotone"
                  dataKey={k}
                  stroke={METRIC_COLOR[k]}
                  strokeWidth={2}
                  dot={{ r: 4, fill: METRIC_COLOR[k], stroke: "var(--bg-elevated)", strokeWidth: 2 }}
                  activeDot={{ r: 5, stroke: "var(--bg-elevated)", strokeWidth: 2 }}
                  isAnimationActive={false}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
