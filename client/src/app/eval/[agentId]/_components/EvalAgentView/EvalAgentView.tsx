/* EvalAgentView — header, run button, metric cards and runs table for one agent. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { EvalMetricCards } from "@/components/eval-metric-cards";
import { EvalRunButton } from "@/components/eval-run-button";
import { useAgentEvalRuns } from "@/lib/hooks/eval";
import { METRIC_KEYS, metricSeries, trendRuns } from "@/lib/eval-trend";
import { RunsTable } from "../RunsTable";
import { MetricTrendChart } from "../MetricTrendChart";
import { RegressionBanner } from "../RegressionBanner";
import { CompareRunsModal } from "../CompareRunsModal";
import { s } from "./styles";

export function EvalAgentView({ agentId }: { agentId: string }) {
  const t = useTranslations("evalDashboard.agent");
  const te = useTranslations("eval.shared");
  const { data, isLoading, isError, refetch } = useAgentEvalRuns(agentId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [comparing, setComparing] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (isError) {
    return (
      <div style={s.page}>
        <ErrorState title={t("loadFailed")} onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !data) {
    return (
      <div style={s.page}>
        <Skeleton height={40} width={320} />
        <Skeleton height={100} />
        <Skeleton height={240} />
      </div>
    );
  }

  const latest = data.latest_completed;
  const erroredCount = latest?.cases_errored ?? 0;
  const ids = [...selected];
  const history = trendRuns(data.runs);
  const trends = Object.fromEntries(METRIC_KEYS.map((k) => [k, metricSeries(history, k)]));

  return (
    <div style={s.page}>
      <Link href="/eval" style={s.back}>
        <Icon.ChevronLeft size={14} />
        {t("back")}
      </Link>

      <div style={s.header}>
        <div style={{ minWidth: 0 }}>
          <div style={s.titleRow}>
            <h1 style={s.title} title={data.agent.name}>{data.agent.name}</h1>
            <Badge color="var(--text-secondary)" mono>{data.agent.model}</Badge>
          </div>
          <p style={s.sub}>{t("casesSummary", { count: data.cases_total })}</p>
        </div>
        <EvalRunButton agentId={agentId} />
      </div>

      {latest && <RegressionBanner delta={data.delta} version={latest.version_label} />}
      <EvalMetricCards latest={latest} delta={data.delta} showPassCount trends={trends} />
      {erroredCount > 0 && <div style={s.errored}>{te("run.erroredCount", { count: erroredCount })}</div>}
      <MetricTrendChart runs={data.runs} />

      <div style={s.tableHead}>
        <span style={s.heading}>{t("runsHeading")}</span>
        {selected.size > 0 && <span style={s.selected}>{t("selected", { count: selected.size })}</span>}
        <span style={s.spacer} />
        <Button kind="primary" size="sm" icon="GitMerge" disabled={selected.size !== 2} onClick={() => setComparing(true)}>
          {t("compare")}
        </Button>
      </div>

      {data.runs.length === 0 ? (
        <p style={s.muted}>{t("noRuns")}</p>
      ) : (
        <RunsTable runs={data.runs} selected={selected} onToggle={toggle} />
      )}

      {comparing && ids.length === 2 && (
        <CompareRunsModal idA={ids[0]!} idB={ids[1]!} onClose={() => setComparing(false)} />
      )}
    </div>
  );
}
