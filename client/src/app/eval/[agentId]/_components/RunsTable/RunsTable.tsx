/* RunsTable — newest first; checkbox only on completed runs (U-48, U-49). */
"use client";

import { useTranslations } from "next-intl";
import type { EvalSetRunSummary } from "@devdigest/shared";
import { EvalMetricBar } from "@/components/eval-metric-bar";
import { formatCost } from "@/lib/format";
import { s } from "./styles";

export function RunsTable({
  runs,
  selected,
  onToggle,
}: {
  runs: EvalSetRunSummary[];
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
}) {
  const t = useTranslations("evalDashboard.table");
  const te = useTranslations("eval.shared");
  const na = te("notApplicable");

  return (
    <table style={s.table}>
      <thead>
        <tr>
          <th style={s.th} />
          <th style={s.th}>{t("ranAt")}</th>
          <th style={s.th}>{t("version")}</th>
          <th style={s.th}>{t("recall")}</th>
          <th style={s.th}>{t("precision")}</th>
          <th style={s.th}>{t("citation")}</th>
          <th style={s.th}>{t("pass")}</th>
          <th style={s.th}>{t("cost")}</th>
        </tr>
      </thead>
      <tbody>
        {runs.map((run) => {
          const done = run.status === "completed";
          const errored = run.cases_errored ?? 0;
          return (
            <tr key={run.id}>
              <td style={s.td}>
                {done && (
                  <input
                    type="checkbox"
                    checked={selected.has(run.id)}
                    onChange={() => onToggle(run.id)}
                    aria-label={t("select", { version: `${run.version_label} ${new Date(run.started_at).toLocaleString()}` })}
                  />
                )}
              </td>
              <td className="tnum" style={s.td}>{new Date(run.started_at).toLocaleString()}</td>
              <td style={s.td}>{run.version_label}</td>
              {done ? (
                <>
                  <td style={s.td}><EvalMetricBar value={run.recall} metric="recall" /></td>
                  <td style={s.td}><EvalMetricBar value={run.precision} metric="precision" /></td>
                  <td style={s.td}><EvalMetricBar value={run.citation_accuracy} metric="citation_accuracy" /></td>
                  <td className="tnum" style={s.td}>
                    {run.cases_passed ?? na}/{run.cases_total}
                    {errored > 0 && <span style={s.errored}>{te("run.erroredCount", { count: errored })}</span>}
                  </td>
                </>
              ) : (
                <td style={s.td} colSpan={4}>
                  <span style={s.muted}>{t(run.status === "running" ? "running" : "failed")}</span>
                  {run.status === "failed" && run.error && <div style={s.error}>{run.error}</div>}
                </td>
              )}
              <td className="tnum" style={s.td}>{done ? formatCost(run.cost_usd) : te("costUnknown")}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
