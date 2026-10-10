/* EvalDashboardView — one row per agent plus the recent-runs table (U-41…U-45). */
"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import type { EvalSetRunSummary } from "@devdigest/shared";
import { Badge, Button, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import { EvalMetricBar } from "@/components/eval-metric-bar";
import { notify } from "@/lib/toast";
import { useEvalDashboard, useRunAllEvalAgents } from "@/lib/hooks/eval";
import { formatPercent } from "@/lib/eval-format";
import { METRIC_COLOR, metricSeries, trendRuns } from "@/lib/eval-trend";
import { s } from "./styles";

/** Recall trend of one agent from the recent runs the index already carries. */
function AgentSpark({ runs, agentId, label }: { runs: EvalSetRunSummary[]; agentId: string; label: string }) {
  const series = metricSeries(trendRuns(runs.filter((r) => r.agent_id === agentId)), "recall");
  if (series.length < 2) return <span style={s.spark} aria-hidden />;
  return (
    <span style={s.spark} role="img" aria-label={label}>
      <Sparkline data={series} color={METRIC_COLOR.recall} w={72} h={26} />
    </span>
  );
}

export function EvalDashboardView() {
  const t = useTranslations("evalDashboard");
  const te = useTranslations("eval.shared");
  const th = useTranslations("evalDashboard.table");
  const td = useTranslations("eval.dashboard");
  const { data, isLoading, isError, refetch } = useEvalDashboard();
  const runAll = useRunAllEvalAgents();
  const na = te("notApplicable");

  // Agents that have at least one eval case — the only ones a run can start for.
  const runnable = (data?.agents ?? []).filter((a) => a.cases_total > 0).map((a) => a.agent.id);
  const onRunAll = () =>
    runAll.mutate(runnable, {
      onSuccess: ({ started, failed }) => {
        if (started > 0) notify.success(t("index.runAllStarted", { count: started }));
        else if (failed === 0) notify.info(t("index.runAllNothingNew"));
        if (failed > 0) notify.error(t("index.runAllFailed", { count: failed }));
      },
    });

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>{t("index.title")}</h1>
          <p style={s.subtitle}>{t("index.subtitle")}</p>
        </div>
        <Button
          kind="primary"
          size="sm"
          icon="Play"
          loading={runAll.isPending}
          disabled={!data || runnable.length === 0}
          title={data && runnable.length === 0 ? t("index.runAllNoCases") : undefined}
          onClick={onRunAll}
        >
          {t("index.runAll")}
        </Button>
      </div>

      {isError ? (
        <ErrorState title={t("index.loadFailed")} onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div style={s.list}>
          <Skeleton height={64} />
          <Skeleton height={64} />
          <Skeleton height={200} />
        </div>
      ) : (
        <>
          <div style={s.heading}>
            <Icon.Cpu size={13} />
            {t("index.agentsHeading")}
          </div>
          {data.agents.length === 0 ? (
            <EmptyState title={t("index.noAgents")} />
          ) : (
            <div style={s.list}>
              {data.agents.map(({ agent, latest_completed: run }) => (
                <Link key={agent.id} href={`/eval/${agent.id}`} style={s.agentRow}>
                  <span style={s.tile} aria-hidden>
                    <Icon.Cpu size={18} />
                  </span>
                  <div style={s.agentMain}>
                    <div style={s.agentName}>
                      <span style={s.agentNameText} title={agent.name}>{agent.name}</span>
                      <Badge color="var(--text-secondary)" mono>{agent.model}</Badge>
                    </div>
                    <div style={s.agentSub}>
                      {run
                        ? t("index.lastRun", {
                            version: run.version_label,
                            when: new Date(run.started_at).toLocaleString(),
                            passed: run.cases_passed ?? na,
                            total: run.cases_total,
                          })
                        : t("index.noRunsYet")}
                    </div>
                  </div>
                  {run && <AgentSpark runs={data.recent_runs} agentId={agent.id} label={t("index.trendLabel")} />}
                  {run &&
                    (
                      [
                        ["recall", "recall", run.recall],
                        ["precision", "precision", run.precision],
                        ["citation_accuracy", "citationAccuracy", run.citation_accuracy],
                      ] as const
                    ).map(([metric, key, v]) => (
                      <div key={key} style={s.metric} title={te(`metrics.${key}`)}>
                        <span style={s.metricLabel}>{t(`index.metricShort.${key}`)}</span>
                        <span className="tnum" style={{ ...s.metricValue, color: METRIC_COLOR[metric] }}>
                          {formatPercent(v) ?? na}
                        </span>
                      </div>
                    ))}
                  <Icon.ChevronRight size={16} style={s.chevron} />
                </Link>
              ))}
            </div>
          )}

          <div style={s.heading}>
            <Icon.History size={13} />
            {t("index.recentHeading")}
          </div>
          {data.recent_runs.length === 0 ? (
            <p style={s.muted}>{td("noRuns")}</p>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>{th("agent")}</th>
                  <th style={s.th}>{th("ranAt")}</th>
                  <th style={s.th}>{th("version")}</th>
                  <th style={s.th}>{th("recall")}</th>
                  <th style={s.th}>{th("precision")}</th>
                  <th style={s.th}>{th("citation")}</th>
                  <th style={s.th}>{th("pass")}</th>
                </tr>
              </thead>
              <tbody>
                {data.recent_runs.map((run) => (
                  <tr key={run.id}>
                    <td style={s.tdAgent} title={run.agent_name}>{run.agent_name}</td>
                    <td className="tnum" style={s.td}>{new Date(run.started_at).toLocaleString()}</td>
                    <td style={s.tdVersion}>{run.version_label}</td>
                    <td style={s.td}><EvalMetricBar value={run.recall} metric="recall" /></td>
                    <td style={s.td}><EvalMetricBar value={run.precision} metric="precision" /></td>
                    <td style={s.td}><EvalMetricBar value={run.citation_accuracy} metric="citation_accuracy" /></td>
                    <td className="tnum" style={s.tdPass}>
                      {run.status === "completed"
                        ? `${run.cases_passed ?? na}/${run.cases_total}`
                        : th(run.status === "running" ? "running" : "failed")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}
