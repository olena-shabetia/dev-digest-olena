/* StatsTab — real-data-only agent quality/cost dashboard (L02, completing the
   already-specified `AgentStats` contract; a deliberate, documented slice of
   L07 — see specs/L02-skills.stats.md). No "Most-used skills" or
   "Most-pulled memory" panel: neither is backed by real data yet. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  MetricCard,
  Sparkline,
  Donut,
  CircularScore,
  SeverityBadge,
  SEV,
  Skeleton,
  ErrorState,
} from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { formatCost, formatSeconds, formatTokens } from "../../../../../../../lib/format";
import { useAgentStats, useAgentRuns } from "../../../../../../../lib/hooks/agents";
import { toCategorySegments } from "./helpers";
import { s } from "./styles";

const RUN_HISTORY_LIMIT = 20;
// Only the 3 severities `AgentStats.findings_by_severity` actually carries —
// narrower than the UI kit's full `Severity` type (which also has `INFO`).
const SEVERITIES = ["CRITICAL", "WARNING", "SUGGESTION"] as const;

export function StatsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("agents");
  const { data: stats, isLoading: statsLoading, isError, refetch } = useAgentStats(agent.id);
  const { data: runs, isLoading: runsLoading } = useAgentRuns(agent.id, RUN_HISTORY_LIMIT);

  if (statsLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={100} />
        <Skeleton height={160} />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("stats.loadError")} onRetry={() => refetch()} />;
  }

  const trendValues = stats.trend.map((p) => p.value);
  const maxSevCount = Math.max(1, ...SEVERITIES.map((sev) => stats.findings_by_severity[sev]));
  const categorySegments = toCategorySegments(stats.findings_by_category);

  return (
    <div style={s.wrap}>
      <div style={s.tiles}>
        <MetricCard label={t("stats.tiles.totalRuns")} value={stats.runs} />
        <MetricCard label={t("stats.tiles.avgCost")} value={formatCost(stats.avg_cost_usd)} />
        <MetricCard
          label={t("stats.tiles.avgDuration")}
          value={stats.avg_latency_ms != null ? formatSeconds(stats.avg_latency_ms) : "—"}
        />
        <MetricCard
          label={t("stats.tiles.acceptRate")}
          value={
            stats.accept_rate != null ? (
              <CircularScore score={Math.round(stats.accept_rate * 100)} size={40} />
            ) : (
              "—"
            )
          }
        />
      </div>

      {trendValues.length > 0 && (
        <div style={s.section}>
          <div style={s.sectionTitle}>{t("stats.trend.title")}</div>
          <Sparkline data={trendValues} w={280} h={48} />
        </div>
      )}

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.severity.title")}</div>
        {SEVERITIES.map((sev) => {
          const count = stats.findings_by_severity[sev];
          const pct = (count / maxSevCount) * 100;
          return (
            <div key={sev} style={s.sevRow}>
              <SeverityBadge severity={sev} compact />
              <div style={s.sevBarTrack}>
                <div style={s.sevBarFill(pct, SEV[sev].c)} />
              </div>
              <span className="tnum" style={s.sevCount}>
                {count}
              </span>
            </div>
          );
        })}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.category.title")}</div>
        {categorySegments.length === 0 ? (
          <div style={s.empty}>{t("stats.category.empty")}</div>
        ) : (
          <Donut segments={categorySegments} valuePrefix="" />
        )}
      </div>

      <div style={s.section}>
        <div style={s.sectionTitle}>{t("stats.runs.title")}</div>
        {runsLoading ? (
          <Skeleton height={120} />
        ) : !runs || runs.length === 0 ? (
          <div style={s.empty}>{t("stats.runs.empty")}</div>
        ) : (
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>{t("stats.runs.columns.time")}</th>
                <th style={s.th}>{t("stats.runs.columns.pr")}</th>
                <th style={s.th}>{t("stats.runs.columns.tokens")}</th>
                <th style={s.th}>{t("stats.runs.columns.cost")}</th>
                <th style={s.th}>{t("stats.runs.columns.findings")}</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run) => (
                <tr key={run.run_id}>
                  <td style={s.td}>{run.ran_at ? new Date(run.ran_at).toLocaleString() : "—"}</td>
                  <td style={s.td} className="mono">
                    {run.pr_number != null ? `#${run.pr_number}` : "—"}
                  </td>
                  <td style={s.td} className="mono">
                    {run.tokens_in != null && run.tokens_out != null
                      ? formatTokens(run.tokens_in, run.tokens_out)
                      : "—"}
                  </td>
                  <td style={s.td} className="mono">
                    {formatCost(run.cost_usd)}
                  </td>
                  <td style={s.td}>{run.findings_count ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
